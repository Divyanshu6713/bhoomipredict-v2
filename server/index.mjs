/**
 * LandPulse AI API.
 *
 * A dependency-free Node HTTP service over the columnar case store and the
 * runtime workflow state. Filtering, sorting, paging and aggregation happen
 * server-side; every data endpoint is scoped to the signed-in user's role.
 *
 *   node server/index.mjs            # port 5179, or PORT / BP_API_PORT
 *
 * In production it also serves the built front end from dist/, so one process
 * runs the whole platform.
 */
import http from 'node:http';
import { riskScoreOf } from './domain/risk.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadStore, caseAt, isoFromDay, featureContributionsFor, DATA } from './lib/store.mjs';
import {
  queryCases,
  queryQueue,
  queryMapPoints,
  queryBreakdown,
  queryContributors,
  queryCaseRows,
  contributorsFor,
  clearCache,
} from './lib/query.mjs';
import { scoreModel, predictionSpec, defaultRecord, recordFromCase } from './lib/scorer.mjs';
import { loadState, getState, saveState, flushState, recordAudit, queryAudit, verifyAuditChain } from './lib/persistence.mjs';
import {
  attachStore,
  effectiveProjects,
  getProject,
  projectSummary,
  createProject,
  updateProject,
  deleteProject,
  restoreProject,
  advanceStage,
  deletedProjects,
  touchProjects,
  projectRecord,
  ServiceError,
} from './lib/projects.mjs';
import { listInterventions, updateIntervention, listAlerts, updateAlert, notificationCount, allInterventions, INTERVENTION_STATUSES, ALERT_STATUSES } from './lib/workflow.mjs';
import { scoreScenario, scenarioOptions, scenarioSeedForProject } from './lib/scenario.mjs';
import { dashboardSummary, scopedProjects } from './lib/dashboard.mjs';
import { uploadDocument, addVersion, reviewDocument, listDocuments, documentFile, DOCUMENT_TYPES, MAX_BYTES } from './lib/documents.mjs';
import { processUpload, csvTemplate } from './lib/upload.mjs';
import { startRetrain, startRollback, jobStatus, jobRunning, pythonAvailable } from './lib/jobs.mjs';
import { createSession, sessionForToken, sessionForDownloadToken, endSession, verifyPassword, lockStatus, recordFailure, clearFailures, passwordPolicyErrors, setPassword, applyTransportHeaders, securityPosture, purgeExpiredSessions, SESSION_POLICY } from './lib/security.mjs';
import { recordOutcome, ingestOutcomes, parseOutcomeCsv, advanceSimulation, learningStatus, driftReport, modelRegistry, setLearningSettings, outcomeFor, resetOutcomeCache, effectiveToday } from './lib/learning.mjs';
import { runAlertScan, startScheduler, notificationFeed, markNotificationsRead } from './lib/notifications.mjs';
import { createApiClient, revokeApiClient, listApiClients, apiClientWebhooks, API_SCOPES } from './lib/apiClients.mjs';
import { handleV1 } from './lib/externalApi.mjs';
import { delayTrends, performanceIndicators } from './lib/analytics.mjs';
import { runConsistencyChecks } from './lib/consistency.mjs';
import { USERS, ROLES, userById, can, inScope, describeUser, CATEGORIES, configuredUser, isUnrestricted, rolesForTier } from './domain/roles.mjs';
import { hierarchyConfig, levelOptions, organisationById, resolvePosition, templateLevels, projectInPosition, SECTORS } from './domain/hierarchy.mjs';
import { STATES_AND_UTS } from './domain/india.mjs';
import { projectIssueProfile, typeIssueMatrix, issueCatalogue } from './domain/issues.mjs';
import { configureIntegrations, integrationStatus, parcelDataView, projectDataView } from './integration/index.mjs';
import { portfolioDrilldown, positionPortfolio } from './lib/portfolio.mjs';
import { evaluateCase, RULE_THRESHOLDS, RULE_THRESHOLD_OVERRIDES } from './domain/rules.mjs';
import { FRAMEWORKS, PROJECT_TYPES, PROFILED_STATES, REGISTRY_NOTE, DEPENDENCY_META, authorityOptions, dependencyMatrix } from './domain/registry.mjs';
import { GEO_DIR, districtIndex } from './domain/geography.mjs';
import { LIFECYCLE_RULES } from './domain/lifecycle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.BP_API_PORT ?? process.env.PORT ?? 5179);

let store = loadStore();
loadState();
attachStore(store);
effectiveProjects();
console.log(
  `[api] store loaded: ${store.rows.toLocaleString('en-IN')} cases · ${(store.bytes / 1048576).toFixed(1)} MB · ` +
    `${store.projects.length} projects · ${store.loadMs}ms`,
);

/** Case lookup shared by the case endpoints and the integration layer. */
function caseRowOf(caseId) {
  const mm = /^LAC-(\d+)$/i.exec(caseId ?? '');
  const row = mm ? Number(mm[1]) - 500000 : -1;
  return row >= 0 && row < store.rows ? row : -1;
}

configureIntegrations({
  caseRecord: (caseId) => {
    const row = caseRowOf(caseId);
    return row < 0 ? null : caseAt(store, row);
  },
  project: (id) => getProject(id),
});

function reloadStore() {
  store = loadStore();
  clearCache();
  resetOutcomeCache();
  attachStore(store);
  touchProjects();
  effectiveProjects();
  console.log(`[api] store reloaded: ${store.rows} cases, model ${store.model?.metrics?.generatedAt}`);
}

/* ------------------------------------------------------------------ helpers */

const json = (res, body, status = 200, headers = {}) => {
  const payload = JSON.stringify(body);
  const accepts = /\bgzip\b/.test(res.req?.headers['accept-encoding'] ?? '');
  const base = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers };
  if (accepts && payload.length > 8192) {
    res.writeHead(status, { ...base, 'Content-Encoding': 'gzip' });
    res.end(zlib.gzipSync(payload, { level: 5 }));
  } else {
    res.writeHead(status, base);
    res.end(payload);
  }
};

const notFound = (res, message = 'Not found') => json(res, { error: message }, 404);
const paramsOf = (url) => Object.fromEntries(url.searchParams.entries());

const readRaw = (req, limit) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new ServiceError(`Payload larger than ${Math.round(limit / 1048576)} MB`, 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

async function readBody(req) {
  const buf = await readRaw(req, 1_000_000);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new ServiceError('Request body is not valid JSON', 400);
  }
}

/* -------------------------------------------------------------------- auth */

/** Bearer token (header only), or, on read-only download endpoints, the download token. */
function sessionUser(req, url, { allowDownloadToken = false } = {}) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  let session = token ? sessionForToken(token) : null;
  if (!session && allowDownloadToken && req.method === 'GET') session = sessionForDownloadToken(url.searchParams.get('dl'));
  if (!session) return null;
  if (session.configured) {
    try {
      return configuredUser(session.configured);
    } catch {
      return null;
    }
  }
  return userById(session.userId);
}

const DOWNLOAD_PATH = /^\/api\/(export\/|upload\/template$|learning\/outcomes\/template$|documents\/[^/]+\/download$)/;

function requireUser(req, url) {
  const user = sessionUser(req, url, { allowDownloadToken: DOWNLOAD_PATH.test(url.pathname) });
  if (!user) throw new ServiceError('Sign in required', 401);
  return user;
}

function requirePermission(user, permission) {
  if (!can(user, permission)) throw new ServiceError(`${ROLES[user.role].label} does not have permission for ${permission}`, 403);
}

function projectInScopeOr404(user, id) {
  const p = getProject(decodeURIComponent(id));
  if (!p) throw new ServiceError('Project not found', 404);
  if (!inScope(user, p)) throw new ServiceError('This project is outside your jurisdiction', 403);
  return p;
}

/** Corpus project ids visible to the user, as a filter for case-level queries. */
function scopeFilter(user, p) {
  if (isUnrestricted(user)) return p;
  const ids = scopedProjects(user).filter((x) => x.source === 'corpus').map((x) => x.id);
  const requested = p.projectId ? p.projectId.split(',') : null;
  const allowed = requested ? requested.filter((id) => ids.includes(id)) : ids;
  return { ...p, projectId: allowed.length ? allowed.join(',') : '__none__' };
}

/* --------------------------------------------------------------- endpoints */

function caseStatusOf(c) {
  const overlay = getState().caseStatus[c.caseId];
  return {
    caseStatus: overlay?.status ?? (c.labelObserved ? 'CLOSED' : 'OPEN'),
    caseStatusNote: overlay?.note ?? null,
    caseStatusUpdatedAt: overlay?.at ?? null,
    caseStatusUpdatedBy: overlay?.byName ?? null,
  };
}

function projectList(user, p) {
  const risk = p.risk ? p.risk.split(',') : null;
  const stages = p.stage ? p.stage.split(',') : null;
  const states = p.state ? p.state.split(',') : null;
  const types = p.projectType ? p.projectType.split(',') : null;
  const authorities = p.authority ? p.authority.split(',') : null;
  const priorities = p.priority ? p.priority.split(',') : null;
  const districts = p.district ? p.district.split(',') : null;
  const statuses = p.status ? p.status.split(',') : null;
  const sources = p.source ? p.source.split(',') : null;
  const sector = p.sector && p.sector !== 'all' ? SECTORS.find((s) => s.id === p.sector) : null;
  const q = p.q ? p.q.trim().toLowerCase() : null;

  let rows = scopedProjects(user).filter((pr) => {
    if (risk && !risk.includes(pr.riskBand)) return false;
    if (stages && !stages.includes(pr.currentStage)) return false;
    if (states && !states.includes(pr.state)) return false;
    if (types && !types.includes(pr.type)) return false;
    if (authorities && !authorities.includes(pr.authority)) return false;
    if (priorities && !priorities.includes(pr.priority)) return false;
    if (districts && !pr.districts.some((d) => districts.includes(d))) return false;
    if (statuses && !statuses.includes(pr.lifecycle.currentStatus)) return false;
    if (sources && !sources.includes(pr.source)) return false;
    if (sector && !sector.projectTypes.includes(pr.type)) return false;
    if (p.flag === 'delayed' && !pr.lifecycle.isDelayed) return false;
    if (p.flag === 'blocked' && !pr.lifecycle.isBlocked) return false;
    if (p.flag === 'action' && !pr.recommendations.some((r) => r.intervention && ['High', 'Critical'].includes(r.severity))) return false;
    if (q && !`${pr.name} ${pr.id} ${pr.state} ${pr.authority} ${pr.districts.join(' ')} ${pr.type} ${pr.subtype ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const sort = p.sort ?? 'risk';
  const dir = p.dir === 'asc' ? 1 : -1;
  const key = {
    risk: (x) => x.riskScore,
    progress: (x) => x.progressPct ?? 0,
    parcels: (x) => x.totalParcels,
    open: (x) => x.openCases ?? 0,
    highRisk: (x) => x.highRiskCases ?? 0,
    deadline: (x) => -new Date(x.milestoneDeadline).getTime(),
    name: (x) => x.name,
    area: (x) => x.landRequirementHa,
    families: (x) => x.affectedFamilies,
    quality: (x) => x.dataQuality ?? 0,
    delay: (x) => x.predictedDelayDays ?? 0,
    backlog: (x) => x.lifecycle.residualBacklog,
  }[sort] ?? ((x) => x.riskScore);
  rows = [...rows].sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    if (typeof av === 'string') return av.localeCompare(bv) * -dir;
    return (av - bv) * dir;
  });

  const pageSize = Math.min(500, Math.max(1, Number(p.pageSize ?? 20)));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Number(p.page ?? 1)), pages);

  return {
    total: rows.length,
    page,
    pages,
    pageSize,
    aggregate: {
      openCases: rows.reduce((s, r) => s + (r.openCases ?? 0), 0),
      totalParcels: rows.reduce((s, r) => s + r.totalParcels, 0),
      highRiskCases: rows.reduce((s, r) => s + (r.highRiskCases ?? 0), 0),
      landRequirementHa: Math.round(rows.reduce((s, r) => s + r.landRequirementHa, 0)),
      affectedFamilies: rows.reduce((s, r) => s + (r.affectedFamilies ?? 0), 0),
      avgRisk: rows.length ? Math.round(rows.reduce((s, r) => s + r.riskScore, 0) / rows.length) : 0,
      delayedProjects: rows.filter((r) => r.lifecycle.isDelayed).length,
      blockedProjects: rows.filter((r) => r.lifecycle.isBlocked).length,
      delayedMilestones: rows.filter((r) => r.lifecycle.isDelayed).length,
      residualBacklog: rows.reduce((s, r) => s + r.lifecycle.residualBacklog, 0),
      riskMix: ['Low', 'Medium', 'High', 'Critical'].reduce((acc, b) => ((acc[b] = rows.filter((r) => r.riskBand === b).length), acc), {}),
    },
    projects: rows.slice((page - 1) * pageSize, page * pageSize).map(projectSummary),
  };
}

function projectDetail(user, p) {
  let topCases = [];
  let openAreaHa = null;
  if (p.storeIndex !== undefined) {
    const start = store.ranges[p.storeIndex * 2];
    const end = store.ranges[p.storeIndex * 2 + 1];
    const c = store.col;
    const worst = [];
    let area = 0;
    for (let row = start; row < end; row++) {
      if (c.observed[row] === 0) {
        worst.push(row);
        area += c.areaHa[row];
      }
    }
    worst.sort((a, b) => c.score[b] - c.score[a]);
    topCases = worst.slice(0, 8).map((row) => {
      const cs = caseAt(store, row, { withContributors: true });
      return { ...cs, ...caseStatusOf(cs) };
    });
    openAreaHa = Number(area.toFixed(1));
  }
  const { recommendations, riskSnapshots, ...rest } = p;
  const related = new Set([`project:${p.id}`]);
  const interventions = listInterventions(user, { projectId: p.id, includeClosed: '1', pageSize: 100 }).items;
  const alerts = listAlerts(user, { projectId: p.id, pageSize: 100 }).items;
  const docs = listDocuments(user, { projectId: p.id }, effectiveProjects().byId);
  interventions.forEach((i) => related.add(`intervention:${i.id}`));
  alerts.forEach((a) => related.add(`alert:${a.id}`));
  docs.documents.forEach((d) => related.add(`document:${d.id}`));
  const activity = queryAudit({ pageSize: 200 }).entries.filter((e) => related.has(`${e.entity}:${e.entityId}`) || (e.entity === 'case' && topCases.some((c) => c.caseId === e.entityId)) || e.newValue?.projectId === p.id).slice(0, 40);

  return {
    project: { ...rest, openAreaHa },
    summary: projectSummary(p),
    topCases,
    recommendations,
    riskSnapshots,
    interventions,
    alerts,
    documents: docs,
    activity,
    scenarioSeed: scenarioSeedForProject(p),
    issues: projectIssueProfile(p, projectRecord(p)),
    provenance: {
      record: p.source === 'corpus' ? 'synthetic' : 'user',
      risk: 'model',
      riskBasis: p.riskBasis,
      note: p.source === 'corpus' ? 'Synthetic demonstration project; not an official acquisition record.' : 'Entered by a user of this prototype; scored by the model.',
    },
    permissions: {
      edit: can(user, 'project.edit'),
      delete: can(user, 'project.delete'),
      advanceStage: can(user, 'project.advanceStage'),
      uploadDocument: docs.allowedTypes.length > 0 && can(user, 'document.upload'),
      reviewDocument: can(user, 'document.review'),
      updateIntervention: can(user, 'intervention.update'),
      assignIntervention: can(user, 'intervention.assign'),
      updateAlert: can(user, 'alert.update'),
    },
  };
}

function facets(user) {
  const projects = scopedProjects(user);
  const uniq = (fn) => Array.from(new Set(projects.map(fn))).sort();
  return {
    states: uniq((p) => p.state),
    projectTypes: Object.keys(PROJECT_TYPES),
    sectors: SECTORS.map((s) => ({ id: s.id, label: s.label, projectTypes: s.projectTypes })),
    subtypes: Object.fromEntries(Object.entries(PROJECT_TYPES).map(([k, v]) => [k, v.subtypes])),
    authorities: uniq((p) => p.authority),
    priorities: ['Routine', 'Important', 'Critical'],
    stages: store.stages,
    riskBands: store.bandNames,
    ownership: store.dicts.ownership,
    compensationStatuses: store.dicts.compStatus,
    landTypes: store.dicts.landType,
    districts: Array.from(new Map(projects.flatMap((p) => p.districts.map((d) => [`${p.state}|${d}`, { state: p.state, district: d, key: `${p.state}|${d}` }]))).values()).sort((a, b) => a.key.localeCompare(b.key)),
    stageStatuses: ['IN_PROGRESS', 'DELAYED', 'BLOCKED'],
    milestoneStatuses: ['IN_PROGRESS', 'DELAYED', 'BLOCKED', 'COMPLETED', 'PENDING'],
    interventionStatuses: INTERVENTION_STATUSES,
    alertStatuses: ALERT_STATUSES,
    categories: CATEGORIES,
    documentTypes: DOCUMENT_TYPES,
    roles: Object.entries(ROLES).map(([id, r]) => ({ id, label: r.label })),
    today: store.today,
  };
}

function registryOverview() {
  return {
    note: REGISTRY_NOTE,
    frameworks: Object.values(FRAMEWORKS).map((f) => ({ id: f.id, name: f.name, short: f.short, mode: f.mode, siaRequired: f.siaRequired, disputeForum: f.disputeForum, note: f.note ?? null, milestones: f.milestones })),
    projectTypes: Object.entries(PROJECT_TYPES).map(([name, t]) => ({ name, subtypes: t.subtypes, linear: t.linear, central: t.central })),
    dependencies: DEPENDENCY_META,
    profiledStates: PROFILED_STATES,
    statesAndUts: STATES_AND_UTS.map((s) => ({ name: s.name, code: s.code, type: s.type, profiled: PROFILED_STATES.includes(s.name) })),
    dependencyMatrix: dependencyMatrix(),
    issueMatrix: typeIssueMatrix(),
    issues: issueCatalogue(),
    sectors: SECTORS,
    lifecycleRules: LIFECYCLE_RULES,
    ruleThresholds: RULE_THRESHOLDS,
    ruleThresholdOverrides: RULE_THRESHOLD_OVERRIDES,
  };
}

function exportCases(res, p) {
  const limit = Math.min(50000, Math.max(1, Number(p.limit ?? 20000)));
  const { total, rows } = queryCaseRows(store, p, limit);
  const head = [
    'case_id', 'parcel_id', 'project_id', 'project_name', 'state', 'district', 'taluk_or_tehsil', 'village',
    'current_stage', 'milestone', 'milestone_due_date', 'days_to_milestone', 'land_area_ha',
    'ownership_complexity', 'affected_families', 'compensation_status',
    'compensation_completion_percentage', 'legal_dispute', 'legal_case_count', 'inactivity_days',
    'document_completeness', 'pending_dependencies', 'approval_delay_days', 'data_quality_score',
    'predicted_delay_risk_percent', 'risk_band', 'predicted_delay_days',
    'top_predictive_contributor', 'label_observed', 'observed_outcome', 'data_source',
  ];
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="landpulse-cases-${store.today}.csv"`,
    'Cache-Control': 'no-store',
    'X-Total-Matched': String(total),
    'X-Rows-Exported': String(rows.length),
  });
  res.write(`${head.join(',')}\n`);
  const q = (v) => (v === null || v === undefined ? '' : /[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const lines = rows.slice(i, i + CHUNK).map((row) => {
      const c = caseAt(store, row, { withContributors: true });
      const top = c.contributors.find((x) => x.value > 0)?.group ?? null;
      return [
        c.caseId, c.parcelId, c.projectId, c.projectName, c.state, c.district, c.tehsil, c.village,
        c.stage, c.milestone, c.milestoneDueDate, c.daysToMilestone, c.areaHa,
        c.ownership, c.affectedFamilies, c.compensationStatus, c.compensationCompletionPct,
        c.legalDispute ? 1 : 0, c.legalCases, c.inactivityDays, c.documentCompleteness,
        c.pendingDependencies.join(';'), c.approvalDelayDays, c.dataQuality, c.riskScore, c.riskBand, c.predictedDelayDays,
        top, c.labelObserved ? 1 : 0, c.outcome, 'SYNTHETIC DEMO DATA',
      ].map(q).join(',');
    });
    res.write(`${lines.join('\n')}\n`);
  }
  res.end();
}

function exportProjects(res, user, p) {
  const { projects } = projectList(user, { ...p, pageSize: 500, page: 1 });
  const cols = Object.keys(projects[0] ?? { id: '' }).filter((k) => !['districts', 'supportingDepartments'].includes(k));
  const q = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="landpulse-projects-${store.today}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.write(`${[...cols, 'districts', 'supporting_departments'].join(',')}\n`);
  for (const r of projects) res.write(`${[...cols.map((c) => q(r[c])), q(r.districts.join('; ')), q(r.supportingDepartments.join('; '))].join(',')}\n`);
  res.end();
}

function streamFile(req, res, filePath, contentType, downloadName) {
  if (!fs.existsSync(filePath)) return notFound(res, `${path.basename(filePath)} has not been generated yet`);
  const stat = fs.statSync(filePath);
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && (contentType.startsWith('text') || contentType.includes('json'));
  const headers = {
    'Content-Type': contentType,
    'Content-Disposition': downloadName ? `attachment; filename="${downloadName}"` : 'inline',
    'Cache-Control': downloadName ? 'no-store' : 'public, max-age=3600',
    'X-Uncompressed-Length': String(stat.size),
  };
  if (acceptsGzip) headers['Content-Encoding'] = 'gzip';
  else headers['Content-Length'] = String(stat.size);
  res.writeHead(200, headers);
  const stream = fs.createReadStream(filePath);
  if (acceptsGzip) stream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
  else stream.pipe(res);
}

/* ------------------------------------------------------------ boundaries */

const boundaryCache = new Map();
function boundaries(level, state) {
  const file = { outline: 'india-outline.json', states: 'india-states.json', districts: 'india-districts.json' }[level];
  if (!file) throw new ServiceError('level must be outline, states or districts', 422);
  const k = `${level}|${state ?? ''}`;
  if (!boundaryCache.has(k)) {
    const raw = JSON.parse(fs.readFileSync(path.join(GEO_DIR, file), 'utf8'));
    const features = level === 'districts' && state ? raw.features.filter((f) => f.properties.state === state) : raw.features;
    boundaryCache.set(k, JSON.stringify({ type: 'FeatureCollection', attribution: raw.attribution, features }));
  }
  return boundaryCache.get(k);
}

/* ----------------------------------------------------------------- routing */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  if (!fs.existsSync(DIST)) {
    return json(res, { error: 'Front end bundle not found', hint: 'Run "npm run build" for production, or "npm run dev" which serves the app from Vite.' }, 404);
  }
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(DIST, rel);
  const safe = file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile();
  const target = safe ? file : path.join(DIST, 'index.html');
  const ext = path.extname(target);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
  });
  fs.createReadStream(target).pipe(res);
}

const route = (method, pattern) => (req, pathname) => {
  if (req.method !== method) return null;
  if (typeof pattern === 'string') return pathname === pattern ? [] : null;
  const m = pattern.exec(pathname);
  return m ? m.slice(1).map(decodeURIComponent) : null;
};

async function handle(req, res, url) {
  const { pathname } = url;
  const p = paramsOf(url);
  const at = (method, pattern) => route(method, pattern)(req, pathname);
  let m;

  /* ------------------------------------------------------------- public */
  if (at('GET', '/api/health')) {
    return json(res, {
      ok: true,
      product: 'LandPulse AI',
      rows: store.rows,
      projects: effectiveProjects().list.length,
      today: store.today,
      storeBytes: store.bytes,
      shap: store.meta.shapAvailable,
      model: store.model?.metrics?.generatedAt ?? null,
      modelVersion: store.modelVersion,
      uptimeSeconds: Math.round(process.uptime()),
    });
  }
  if (at('GET', '/api/auth/users')) {
    return json(res, { note: 'Demonstration profiles. A production deployment authenticates through government SSO and maps directory attributes onto these roles and positions.', users: USERS.map((u) => describeUser(userById(u.id))) });
  }
  if (at('GET', '/api/hierarchy')) return json(res, hierarchyConfig());
  if (at('GET', '/api/hierarchy/options')) {
    const org = organisationById(p.orgId ?? '');
    if (!org) throw new ServiceError('Unknown organisation', 404);
    const selection = { region: p.region || undefined, state: org.state ?? (p.state || undefined), division: p.division || undefined, district: p.district || undefined };
    const levels = templateLevels(org, selection);
    let position = null;
    try {
      position = resolvePosition({ orgId: org.id, units: selection });
    } catch (err) {
      throw new ServiceError(err.message, 422);
    }
    // Each option carries how many demo projects it would contain, so an empty scope is visible before it is chosen.
    const projects = effectiveProjects().list;
    const countFor = (units) => {
      try {
        const pos = resolvePosition({ orgId: org.id, units });
        return projects.filter((pr) => projectInPosition(pos, pr)).length;
      } catch {
        return 0;
      }
    };
    const below = { region: ['state', 'division', 'district'], state: ['division', 'district'], division: ['district'], district: [] };
    const optionsFor = (lv) => {
      const base = Object.fromEntries(Object.entries(selection).filter(([k, v]) => v && !below[lv].includes(k) && k !== lv));
      return levelOptions(org.id, lv, selection).map((o) => ({ ...o, projects: countFor({ ...base, [lv]: o.id }) }));
    };
    return json(res, {
      organisation: position.organisation,
      levels,
      options: Object.fromEntries(['region', 'state', 'division', 'district'].filter((lv) => levels.includes(lv)).map((lv) => [lv, optionsFor(lv)])),
      projectsInPosition: countFor(selection),
      position,
      roles: rolesForTier(position.tier),
    });
  }
  if (at('POST', '/api/auth/login')) {
    const body = await readBody(req);
    let user;
    let configured = null;
    if (body.position) {
      try {
        user = configuredUser({ role: body.role, position: body.position });
      } catch (err) {
        throw new ServiceError(err.message, 422);
      }
      configured = { role: user.role, position: user.position };
    } else {
      user = userById(body.userId);
    }
    if (!user) throw new ServiceError('Unknown profile', 404);
    // Configured demo positions are session-only and share the demo credential.
    const principalId = configured ? 'configured-position' : user.id;
    const lock = lockStatus(user.id);
    if (lock.locked) {
      res.setHeader('Retry-After', String(lock.retryAfterSeconds));
      throw new ServiceError(`Too many failed attempts. Try again in ${Math.ceil(lock.retryAfterSeconds / 60)} minute(s).`, 423);
    }
    if (!verifyPassword(principalId, body.password)) {
      const f = recordFailure(user.id);
      recordAudit({ user: null, action: 'session.login_failed', entity: 'user', entityId: user.id, note: f.locked ? 'Profile locked after repeated failures' : `${f.attemptsLeft} attempt(s) left` });
      throw new ServiceError(f.locked ? 'Too many failed attempts. The profile is locked for 5 minutes.' : 'Incorrect password', 401, { attemptsLeft: f.attemptsLeft });
    }
    clearFailures(user.id);
    const session = createSession({ userId: user.id, ...(configured ? { configured } : {}) });
    recordAudit({ user, action: 'session.signed_in', entity: 'user', entityId: user.id, newValue: { expiresAt: session.expiresAt } });
    return json(res, { ...session, user: describeUser(user) });
  }
  if (at('POST', '/api/auth/logout')) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const user = sessionUser(req, url);
    if (token && endSession(token) && user) recordAudit({ user, action: 'session.signed_out', entity: 'user', entityId: user.id });
    return json(res, { ok: true });
  }
  if (at('GET', '/api/summary')) return json(res, { ...store.summary, store: { rows: store.rows, bytes: store.bytes, loadMs: store.loadMs } });
  if (at('GET', '/api/geo/boundaries')) {
    const body = boundaries(p.level ?? 'states', p.state);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400', ...(/\bgzip\b/.test(req.headers['accept-encoding'] ?? '') ? { 'Content-Encoding': 'gzip' } : {}) });
    return res.end(/\bgzip\b/.test(req.headers['accept-encoding'] ?? '') ? zlib.gzipSync(body) : body);
  }

  /* ------------------------------------------------------ authenticated */
  const user = requireUser(req, url);

  if (at('POST', '/api/auth/password')) {
    if (user.configured) throw new ServiceError('Configured demo positions are session-only and have no stored credential', 409);
    const body = await readBody(req);
    if (!verifyPassword(user.id, body.currentPassword)) {
      recordFailure(user.id);
      throw new ServiceError('Current password is incorrect', 401);
    }
    const problems = passwordPolicyErrors(body.newPassword);
    if (problems.length) throw new ServiceError(`The new password needs ${problems.join(', ')}`, 422);
    setPassword(user.id, body.newPassword);
    recordAudit({ user, action: 'session.password_changed', entity: 'user', entityId: user.id });
    return json(res, { ok: true });
  }
  if (at('GET', '/api/security/posture')) return json(res, { ...securityPosture(), sessionPolicy: SESSION_POLICY });

  if (at('GET', '/api/auth/me') || at('GET', '/api/profile')) {
    const projects = scopedProjects(user);
    const mine = listInterventions(user, { mine: '1', pageSize: 100 });
    const assignedCases = Array.from(new Set(mine.items.flatMap((i) => i.caseIds))).slice(0, 25);
    return json(res, {
      user: describeUser(user),
      notifications: notificationCount(user),
      assignedProjects: projects
        .filter((pr) => mine.items.some((i) => i.projectId === pr.id))
        .slice(0, 25)
        .map((pr) => ({ id: pr.id, name: pr.name, state: pr.state, district: pr.district, riskScore: pr.riskScore, riskBand: pr.riskBand, stage: pr.currentStage, stageStatus: pr.lifecycle.currentStatus })),
      jurisdiction: { projects: projects.length, highOrCritical: projects.filter((pr) => ['High', 'Critical'].includes(pr.riskBand)).length, delayed: projects.filter((pr) => pr.lifecycle.isDelayed).length },
      portfolio: positionPortfolio(user),
      official: {
        directory: 'Official contact details are provisioned from the government identity directory at sign-in. No directory is connected in this prototype, so none are shown.',
        identity: user.configured ? 'Configured demo position (session only)' : 'Demonstration directory profile',
      },
      assignedInterventions: mine.total,
      assignedCases,
      recentActivity: queryAudit({ userId: user.id, pageSize: 15 }).entries,
    });
  }
  if (at('GET', '/api/notifications')) return json(res, notificationCount(user));
  if (at('GET', '/api/users')) {
    return json(res, { users: USERS.map((u) => describeUser(userById(u.id))).map((u) => ({ id: u.id, name: u.name, designation: u.designation, role: u.role, roleLabel: u.roleLabel, state: u.state, district: u.district, scopeLabel: u.scopeLabel })) });
  }

  if (at('GET', '/api/facets')) return json(res, facets(user));
  if (at('GET', '/api/hierarchy/portfolio')) return json(res, portfolioDrilldown(user, p));
  if (at('GET', '/api/integrations')) return json(res, integrationStatus());
  if ((m = at('GET', /^\/api\/integrations\/parcel\/([^/]+)$/))) {
    const row = caseRowOf(m[0]);
    if (row < 0) throw new ServiceError('Case not found', 404);
    const project = getProject(store.projects[store.col.projectIdx[row]].id);
    if (!project || !inScope(user, project)) throw new ServiceError('This case is outside your jurisdiction', 403);
    return json(res, await parcelDataView(m[0].toUpperCase()));
  }
  if ((m = at('GET', /^\/api\/integrations\/project\/([^/]+)$/))) {
    const pr = projectInScopeOr404(user, m[0]);
    return json(res, await projectDataView(pr.id));
  }
  if (at('GET', '/api/registry')) return json(res, registryOverview());
  if (at('GET', '/api/geo')) {
    const projects = scopedProjects(user);
    const states = new Set(projects.map((pr) => pr.state));
    const districtKeys = new Set(projects.flatMap((pr) => pr.districts.map((d) => `${pr.state}|${d}`)));
    return json(res, {
      today: store.today,
      states: store.geo.states.filter((s) => states.has(s.state)),
      districts: store.geo.districts.filter((d) => districtKeys.has(d.key)),
      attribution: districtIndex().attribution,
    });
  }
  if (at('GET', '/api/model') || at('GET', '/api/metrics')) return json(res, { ...store.model, python: undefined });

  /* ------------------------------------------------------------ projects */
  if (at('GET', '/api/projects')) return json(res, projectList(user, p));
  if (at('GET', '/api/projects/map')) {
    return json(res, {
      dataSource: 'SYNTHETIC DEMO DATA',
      projects: scopedProjects(user).map((pr) => ({
        id: pr.id,
        name: pr.name,
        state: pr.state,
        district: pr.district,
        districts: pr.districts,
        type: pr.type,
        stage: pr.currentStage,
        stageStatus: pr.lifecycle.currentStatus,
        riskScore: pr.riskScore,
        delayProbability: pr.delayProbability,
        riskBand: pr.riskBand,
        predictedDelayDays: pr.predictedDelayDays,
        primaryAuthority: pr.authority,
        lat: pr.lat,
        lon: pr.lon,
        openCases: pr.openCases ?? 0,
        source: pr.source,
      })),
    });
  }
  if (at('GET', '/api/projects/deleted')) {
    requirePermission(user, 'project.delete');
    return json(res, { projects: deletedProjects() });
  }
  if (at('POST', '/api/projects')) {
    requirePermission(user, 'project.create');
    const body = await readBody(req);
    const scopeProbe = { state: body.state, districts: [body.district], type: body.type, authority: body.authority, network: { nodes: [] } };
    if (!inScope(user, scopeProbe)) throw new ServiceError('You can only create projects inside your jurisdiction', 403);
    const created = createProject(user, body);
    return json(res, { project: projectSummary(created) }, 201);
  }
  if ((m = at('GET', /^\/api\/projects\/([^/]+)$/))) return json(res, projectDetail(user, projectInScopeOr404(user, m[0])));
  if ((m = at('PUT', /^\/api\/projects\/([^/]+)$/))) {
    requirePermission(user, 'project.edit');
    const pr = projectInScopeOr404(user, m[0]);
    const updated = updateProject(user, pr.id, await readBody(req));
    return json(res, { project: projectSummary(updated) });
  }
  if ((m = at('DELETE', /^\/api\/projects\/([^/]+)$/))) {
    requirePermission(user, 'project.delete');
    const pr = projectInScopeOr404(user, m[0]);
    const body = await readBody(req);
    deleteProject(user, pr.id, { reason: body.reason });
    return json(res, { ok: true, id: pr.id, restorable: true });
  }
  if ((m = at('POST', /^\/api\/projects\/([^/]+)\/restore$/))) {
    requirePermission(user, 'project.delete');
    const restored = restoreProject(user, m[0]);
    return json(res, { project: projectSummary(restored) });
  }
  if ((m = at('POST', /^\/api\/projects\/([^/]+)\/advance-stage$/))) {
    requirePermission(user, 'project.advanceStage');
    const pr = projectInScopeOr404(user, m[0]);
    const updated = advanceStage(user, pr.id, await readBody(req));
    return json(res, { project: projectSummary(updated) });
  }
  if ((m = at('GET', /^\/api\/projects\/([^/]+)\/cases$/))) {
    const pr = projectInScopeOr404(user, m[0]);
    if (pr.storeIndex === undefined) return json(res, { total: 0, page: 1, pages: 1, pageSize: 10, rows: [], aggregate: null, queryMs: 0, note: 'No case-level records are attached to this project.' });
    const result = queryCases(store, { ...p, projectId: pr.id });
    return json(res, { ...result, rows: result.rows.map((r) => ({ ...r, ...caseStatusOf(r) })) });
  }

  /* --------------------------------------------------------------- cases */
  if (at('GET', '/api/cases')) {
    const result = queryCases(store, scopeFilter(user, p));
    return json(res, { ...result, rows: result.rows.map((r) => ({ ...r, ...caseStatusOf(r) })) });
  }
  if ((m = at('GET', /^\/api\/cases\/([^/]+)$/))) {
    const mm = /^LAC-(\d+)$/i.exec(m[0]);
    const row = mm ? Number(mm[1]) - 500000 : -1;
    if (!(row >= 0 && row < store.rows)) throw new ServiceError('Case not found', 404);
    const projectBase = store.projects[store.col.projectIdx[row]];
    const project = getProject(projectBase.id);
    if (!project) throw new ServiceError('The project for this case has been deleted', 410);
    if (!inScope(user, project)) throw new ServiceError('This case is outside your jurisdiction', 403);
    const detail = caseAt(store, row, { withContributors: true });
    const withStatus = { ...detail, ...caseStatusOf(detail) };
    return json(res, {
      case: { ...withStatus, featureContributions: featureContributionsFor(store, row) },
      project: projectSummary(project),
      network: project.network,
      stage: project.stages[detail.stageIndex],
      recommendations: evaluateCase(withStatus, project),
      documents: listDocuments(user, { caseId: detail.caseId }, effectiveProjects().byId).documents,
      activity: queryAudit({ entity: 'case', entityId: detail.caseId, pageSize: 20 }).entries,
      permissions: { updateCase: can(user, 'case.update'), recordOutcome: can(user, 'learning.record') && !detail.labelObserved && !outcomeFor(detail.caseId) },
      recordedOutcome: outcomeFor(detail.caseId),
      outcomeRecordingDate: effectiveToday(store),
      explanation: {
        basis: store.meta.shapAvailable ? 'TreeSHAP on the deployed ensemble' : 'linear surrogate',
        unit: 'log-odds contribution to the predicted risk',
        baseValue: store.model.metrics.shap?.baseValue ?? null,
        caveat: 'These factors contributed most to the model’s prediction for this case. They are not a finding that any factor caused a delay.',
      },
    });
  }
  if ((m = at('PATCH', /^\/api\/cases\/([^/]+)\/status$/))) {
    requirePermission(user, 'case.update');
    const mm = /^LAC-(\d+)$/i.exec(m[0]);
    const row = mm ? Number(mm[1]) - 500000 : -1;
    if (!(row >= 0 && row < store.rows)) throw new ServiceError('Case not found', 404);
    const project = getProject(store.projects[store.col.projectIdx[row]].id);
    if (!project || !inScope(user, project)) throw new ServiceError('This case is outside your jurisdiction', 403);
    const body = await readBody(req);
    const allowed = ['OPEN', 'UNDER_REVIEW', 'ESCALATED', 'ON_HOLD', 'RESOLVED_PENDING_RESCORE'];
    if (!allowed.includes(body.status)) throw new ServiceError(`Case status must be one of: ${allowed.join(', ')}`, 422);
    if (!body.note || String(body.note).trim().length < 5) throw new ServiceError('A note of at least 5 characters is required', 422);
    const key = `LAC-${500000 + row}`;
    const state = getState();
    const before = state.caseStatus[key] ?? { status: store.col.observed[row] ? 'CLOSED' : 'OPEN' };
    state.caseStatus[key] = { status: body.status, note: String(body.note).slice(0, 500), by: user.id, byName: user.name, at: new Date().toISOString() };
    saveState();
    recordAudit({ user, action: 'case.status_changed', entity: 'case', entityId: key, oldValue: { status: before.status }, newValue: { status: body.status, projectId: project.id }, note: body.note });
    return json(res, { caseId: key, ...state.caseStatus[key] });
  }

  if (at('GET', '/api/queue')) return json(res, queryQueue(store, scopeFilter(user, p)));
  if (at('GET', '/api/map/points')) return json(res, queryMapPoints(store, scopeFilter(user, p)));
  if (at('GET', '/api/breakdown')) return json(res, queryBreakdown(store, scopeFilter(user, p)));
  if (at('GET', '/api/contributors')) return json(res, queryContributors(store, scopeFilter(user, p)));

  /* ----------------------------------------------------------- prediction */
  if (at('GET', '/api/predict/spec')) return json(res, { ...predictionSpec(store), defaults: defaultRecord(store) });
  if (at('GET', '/api/predict/case')) {
    const mm = /^LAC-(\d+)$/i.exec(p.caseId ?? '');
    const row = mm ? Number(mm[1]) - 500000 : -1;
    if (!(row >= 0 && row < store.rows)) throw new ServiceError('Case not found', 404);
    const caseProject = getProject(store.projects[store.col.projectIdx[row]].id);
    if (!caseProject || !inScope(user, caseProject)) throw new ServiceError('This case is outside your jurisdiction', 403);
    const record = recordFromCase(store, row);
    const live = scoreModel(store, record);
    return json(res, {
      record,
      ensemble: {
        probability: Number(store.col.score[row].toFixed(4)),
        riskScore: riskScoreOf(store.col.score[row]),
        contributors: contributorsFor(store, row),
      },
      // Re-scored live from the record with the exported trees; equals the stored score.
      surrogate: live,
      live,
    });
  }
  if (at('POST', '/api/predict')) {
    const body = await readBody(req);
    const record = { ...defaultRecord(store), ...(body.record ?? body) };
    // The registry decides which acquiring bodies a project type can have; an
    // inconsistent pair is rejected rather than scored.
    if (body.record?.project_type && body.record?.authority && body.record?.state) {
      const options = authorityOptions({ projectType: record.project_type, state: record.state, district: body.record.district });
      const typeKnown = Boolean(PROJECT_TYPES[record.project_type]);
      if (typeKnown && options.length && !options.includes(record.authority)) {
        throw new ServiceError(`"${record.authority}" is not an eligible acquiring body for ${record.project_type} in ${record.state}`, 422, { eligible: options });
      }
    }
    const result = scoreModel(store, record);
    const baseline = body.baseline ? scoreModel(store, { ...defaultRecord(store), ...body.baseline }) : null;
    return json(res, {
      record,
      result,
      baseline,
      delta: baseline ? { probability: Number((result.probability - baseline.probability).toFixed(4)), riskScore: Number(((result.probability - baseline.probability) * 100).toFixed(1)) } : null,
    });
  }
  if (at('GET', '/api/scenario/options')) return json(res, scenarioOptions(store, p));
  if (at('GET', '/api/scenario/seed')) {
    const pr = projectInScopeOr404(user, p.projectId ?? '');
    return json(res, { project: projectSummary(pr), seed: scenarioSeedForProject(pr) });
  }
  if (at('POST', '/api/scenario/score')) return json(res, scoreScenario(store, await readBody(req)));

  /* ------------------------------------------------------------ workflow */
  if (at('GET', '/api/dashboard/summary')) return json(res, dashboardSummary(user, p, store));
  if (at('GET', '/api/interventions')) return json(res, listInterventions(user, p));
  if ((m = at('PATCH', /^\/api\/interventions\/(.+)$/))) {
    requirePermission(user, 'intervention.update');
    return json(res, { intervention: updateIntervention(user, m[0], await readBody(req)) });
  }
  if (at('GET', '/api/alerts')) return json(res, listAlerts(user, p));
  if ((m = at('PATCH', /^\/api\/alerts\/(.+)$/))) {
    requirePermission(user, 'alert.update');
    const body = await readBody(req);
    return json(res, { alert: updateAlert(user, m[0], body.status) });
  }
  if (at('GET', '/api/recommendations')) {
    const pr = projectInScopeOr404(user, p.projectId ?? '');
    return json(res, { projectId: pr.id, recommendations: pr.recommendations });
  }

  /* ----------------------------------------------------------- documents */
  if (at('GET', '/api/documents')) return json(res, listDocuments(user, p, effectiveProjects().byId));
  if (at('POST', '/api/documents')) {
    requirePermission(user, 'document.upload');
    const bytes = await readRaw(req, MAX_BYTES + 1024);
    const doc = uploadDocument(user, { projectId: p.projectId, title: p.title, type: p.type, stage: p.stage, caseId: p.caseId, fileName: p.fileName }, bytes);
    return json(res, { document: doc }, 201);
  }
  if ((m = at('POST', /^\/api\/documents\/([^/]+)\/versions$/))) {
    requirePermission(user, 'document.upload');
    const bytes = await readRaw(req, MAX_BYTES + 1024);
    return json(res, { document: addVersion(user, m[0], p.fileName, bytes) }, 201);
  }
  if ((m = at('PATCH', /^\/api\/documents\/([^/]+)$/))) {
    requirePermission(user, 'document.review');
    const body = await readBody(req);
    touchProjects(); // a rejection feeds the documentation alert rule
    const doc = reviewDocument(user, m[0], body);
    touchProjects();
    return json(res, { document: doc });
  }
  if ((m = at('GET', /^\/api\/documents\/([^/]+)\/download$/))) {
    const f = documentFile(user, m[0], p.version);
    recordAudit({ user, action: 'document.downloaded', entity: 'document', entityId: m[0], newValue: { version: p.version ?? 'latest' } });
    res.writeHead(200, { 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.fileName}"`, 'Cache-Control': 'no-store' });
    return fs.createReadStream(f.file).pipe(res);
  }

  /* --------------------------------------------------------------- admin */
  if (at('GET', '/api/upload/template')) {
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="landpulse-project-upload-template.csv"' });
    return res.end(csvTemplate());
  }
  if (at('POST', '/api/upload')) {
    requirePermission(user, 'data.upload');
    const text = (await readRaw(req, 2 * 1024 * 1024)).toString('utf8');
    const commit = p.commit === '1' || p.commit === 'true';
    const result = processUpload(user, text, { commit });
    if (!commit) recordAudit({ user, action: 'upload.validated', entity: 'upload', entityId: new Date().toISOString(), newValue: result.summary ?? { fileErrors: result.fileErrors } });
    return json(res, result, result.ok || !commit ? 200 : 422);
  }
  if (at('POST', '/api/retrain')) {
    requirePermission(user, 'model.retrain');
    const result = startRetrain(user, { onSuccess: async () => reloadStore(), onFinished: () => runAlertScan({ reason: 'after-retrain', apiClientWebhooks: apiClientWebhooks() }).catch(() => {}) });
    recordAudit({ user, action: result.started ? 'model.retrain_started' : 'model.retrain_refused', entity: 'model', entityId: result.job.id ?? 'retrain', note: result.reason ?? null });
    return json(res, result, result.started ? 202 : 409);
  }
  if (at('GET', '/api/retrain/status')) {
    requirePermission(user, 'admin.view');
    return json(res, { job: jobStatus(), environment: pythonAvailable(), model: store.model?.metrics?.generatedAt ?? null, modelVersion: store.modelVersion });
  }
  /* ------------------------------------------------- trends & performance */
  if (at('GET', '/api/analytics/trends')) {
    return json(res, delayTrends(store, user, { level: p.level === 'district' ? 'district' : 'state', state: p.state || undefined, district: p.district || undefined, months: Math.min(36, Number(p.months ?? 18)), top: Math.min(15, Number(p.top ?? 8)) }));
  }
  if (at('GET', '/api/analytics/performance')) {
    return json(res, performanceIndicators(store, user, { state: p.state || undefined, district: p.district || undefined, projectType: p.projectType || undefined, sector: p.sector || undefined }));
  }

  /* ---------------------------------------------------- continuous learning */
  if (at('GET', '/api/learning/status')) {
    requirePermission(user, 'admin.view');
    return json(res, { ...learningStatus(store), registry: modelRegistry(store), job: jobStatus(), environment: pythonAvailable() });
  }
  if (at('GET', '/api/learning/drift')) {
    requirePermission(user, 'admin.view');
    return json(res, driftReport(store, { recentDays: Math.min(365, Math.max(30, Number(p.days ?? 120))) }));
  }
  if ((m = at('POST', /^\/api\/cases\/([^/]+)\/outcome$/))) {
    requirePermission(user, 'learning.record');
    const mm = /^LAC-(\d+)$/i.exec(m[0]);
    const row = mm ? Number(mm[1]) - 500000 : -1;
    if (!(row >= 0 && row < store.rows)) throw new ServiceError('Case not found', 404);
    const project = getProject(store.projects[store.col.projectIdx[row]].id);
    if (!project || !inScope(user, project)) throw new ServiceError('This case is outside your jurisdiction', 403);
    const body = await readBody(req);
    return json(res, { outcome: recordOutcome(store, user, { ...body, caseId: m[0] }, 'officer') }, 201);
  }
  if (at('GET', '/api/learning/outcomes/template')) {
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="landpulse-outcomes-template.csv"' });
    return res.end('case_id,completed_on,still_pending_on,next_milestone_delayed,actual_stage_delay_days\nLAC-812345,2026-09-02,,,\n');
  }
  if (at('POST', '/api/learning/outcomes')) {
    requirePermission(user, 'learning.record');
    const text = (await readRaw(req, 5 * 1024 * 1024)).toString('utf8');
    const rows = parseOutcomeCsv(text);
    if (!isUnrestricted(user)) {
      const outside = rows.filter((r) => {
        const mm = /^LAC-(\d+)$/i.exec(String(r.case_id ?? r.caseId ?? ''));
        const row = mm ? Number(mm[1]) - 500000 : -1;
        if (row < 0 || row >= store.rows) return false;
        const pr = getProject(store.projects[store.col.projectIdx[row]].id);
        return !pr || !inScope(user, pr);
      }).length;
      if (outside) throw new ServiceError(`${outside} row(s) refer to cases outside your jurisdiction`, 403);
    }
    const result = ingestOutcomes(store, user, rows, { commit: p.commit === '1', source: 'csv' });
    return json(res, result, result.summary.invalid && p.commit === '1' ? 422 : 200);
  }
  if (at('POST', '/api/learning/simulate')) {
    requirePermission(user, 'model.retrain');
    const body = await readBody(req);
    const result = advanceSimulation(store, user, body.days);
    const scan = await runAlertScan({ reason: 'simulation', user, apiClientWebhooks: apiClientWebhooks() });
    return json(res, { ...result, scan });
  }
  if (at('PATCH', '/api/learning/settings')) {
    requirePermission(user, 'model.retrain');
    return json(res, { learning: setLearningSettings(user, await readBody(req)) });
  }
  if ((m = at('POST', /^\/api\/learning\/rollback\/([^/]+)$/))) {
    requirePermission(user, 'model.retrain');
    const result = startRollback(user, m[0], { onSuccess: async () => reloadStore() });
    recordAudit({ user, action: result.started ? 'model.rollback_started' : 'model.rollback_refused', entity: 'model', entityId: m[0], note: result.reason ?? null });
    return json(res, result, result.started ? 202 : 409);
  }

  /* ---------------------------------------------------------- notifications */
  if (at('GET', '/api/notifications/feed')) {
    const all = p.all === '1';
    if (all) requirePermission(user, 'notification.manage');
    return json(res, notificationFeed(user, { all, page: p.page, pageSize: p.pageSize, unread: p.unread }));
  }
  if (at('POST', '/api/notifications/read')) {
    const body = await readBody(req);
    return json(res, markNotificationsRead(user, Array.isArray(body.ids) ? body.ids : null));
  }
  if (at('POST', '/api/notifications/scan')) {
    requirePermission(user, 'notification.manage');
    return json(res, { scan: await runAlertScan({ reason: 'manual', user, apiClientWebhooks: apiClientWebhooks() }) });
  }

  /* ----------------------------------------------------------- integrations */
  if (at('GET', '/api/integrations/clients')) {
    requirePermission(user, 'integration.manage');
    return json(res, { clients: listApiClients(user), scopes: API_SCOPES, openapi: '/api/v1/openapi.json' });
  }
  if (at('POST', '/api/integrations/clients')) {
    requirePermission(user, 'integration.manage');
    return json(res, createApiClient(user, await readBody(req)), 201);
  }
  if ((m = at('DELETE', /^\/api\/integrations\/clients\/([^/]+)$/))) {
    requirePermission(user, 'integration.manage');
    return json(res, { client: revokeApiClient(user, m[0]) });
  }
  if (at('GET', '/api/audit/verify')) {
    requirePermission(user, 'audit.view');
    return json(res, verifyAuditChain());
  }

  if (at('GET', '/api/audit')) {
    requirePermission(user, 'audit.view');
    return json(res, queryAudit(p));
  }
  if (at('GET', '/api/validation')) {
    requirePermission(user, 'admin.view');
    return json(res, runConsistencyChecks(store));
  }

  /* ------------------------------------------------------------- exports */
  if (pathname.startsWith('/api/export/') && pathname !== '/api/export/manifest') {
    recordAudit({ user, action: 'data.exported', entity: 'export', entityId: pathname.slice('/api/export/'.length), newValue: { filters: Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'dl')) } });
  }
  if (at('GET', '/api/export/cases.csv')) return exportCases(res, scopeFilter(user, p));
  if (at('GET', '/api/export/projects.csv')) return exportProjects(res, user, p);
  if (at('GET', '/api/export/dataset.csv')) return streamFile(req, res, path.join(DATA, 'land_acquisition_synthetic_350k.csv'), 'text/csv; charset=utf-8', 'land_acquisition_synthetic_350k.csv');
  if (at('GET', '/api/export/dataset.pdf')) return streamFile(req, res, path.join(DATA, 'land_acquisition_synthetic_350k.pdf'), 'application/pdf', 'land_acquisition_synthetic_350k.pdf');
  if (at('GET', '/api/export/manifest')) {
    const files = [
      ['land_acquisition_synthetic_350k.csv', 'Full synthetic corpus (CSV)', '/api/export/dataset.csv'],
      ['land_acquisition_synthetic_350k.pdf', 'Dataset documentation and tabular export (PDF)', '/api/export/dataset.pdf'],
    ].map(([name, label, href]) => {
      const file = path.join(DATA, name);
      const exists = fs.existsSync(file);
      return { name, label, href, available: exists, bytes: exists ? fs.statSync(file).size : 0, generatedAt: exists ? fs.statSync(file).mtime.toISOString() : null };
    });
    return json(res, { files });
  }

  return notFound(res, `No such endpoint: ${req.method} ${pathname}`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const transport = applyTransportHeaders(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(transport.allowed ? 204 : 403);
    return res.end();
  }
  try {
    if (url.pathname.startsWith('/api/v1')) {
      await handleV1(req, res, url, store, { json, readBody });
      return;
    }
    if (url.pathname.startsWith('/api/')) return await handle(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    if (err instanceof ServiceError) {
      if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
      return json(res, { error: err.message, details: err.details ?? undefined }, err.status);
    }
    console.error('[api]', err);
    return json(res, { error: err.message ?? 'Internal error' }, 500);
  }
});

process.on('SIGINT', () => {
  flushState();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flushState();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT} · model ${store.modelVersion ?? 'legacy'}`);
});

// Automated alert scans and escalation; optional automatic retraining once enough outcomes arrive.
if (process.env.LANDPULSE_DISABLE_SCHEDULER !== '1') {
  startScheduler({
    apiClientWebhooks,
    onTick: async () => {
      purgeExpiredSessions();
      const s = getState().learning;
      if (!s.autoRetrain || jobRunning()) return;
      const status = learningStatus(store);
      if (status.live.awaitingRetrain >= s.autoRetrainMinOutcomes) {
        s.lastAutoRetrainAt = new Date().toISOString();
        saveState();
        const system = { id: 'system', name: 'Automatic retraining', role: 'NATIONAL_ADMIN' };
        const r = startRetrain(system, { onSuccess: async () => reloadStore(), triggeredBy: `automatic (${status.live.awaitingRetrain} new outcomes)` });
        recordAudit({ user: null, action: r.started ? 'model.retrain_started' : 'model.retrain_refused', entity: 'model', entityId: r.job.id ?? 'auto', note: `automatic: ${status.live.awaitingRetrain} outcomes awaiting` });
      }
    },
  });
}


export { isoFromDay, allInterventions };
