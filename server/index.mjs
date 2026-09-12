/**
 * BhoomiPredict API.
 *
 * A dependency-free Node HTTP service over the columnar case store. It exists so
 * that filtering, sorting, paging and aggregation of the 350,000-case corpus
 * happen server-side: the browser only ever receives the page or the aggregate
 * it asked for, never the corpus.
 *
 *   node server/index.mjs            # port 5179, or PORT / BP_API_PORT
 *
 * In production it also serves the built front end from dist/, so one process
 * runs the whole platform.
 */
import http from 'node:http';
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
} from './lib/query.mjs';
import { scoreRecord, predictionSpec, defaultRecord, recordFromCase } from './lib/scorer.mjs';
import { interventionFor } from './lib/interventions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.BP_API_PORT ?? process.env.PORT ?? 5179);

const store = loadStore();
console.log(
  `[api] store loaded: ${store.rows.toLocaleString('en-IN')} cases · ${(store.bytes / 1048576).toFixed(1)} MB · ` +
    `${store.projects.length} projects · ${store.loadMs}ms`,
);

/* ------------------------------------------------------------------ helpers */

const json = (res, body, status = 200, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
};

const notFound = (res, message = 'Not found') => json(res, { error: message }, 404);

const paramsOf = (url) => Object.fromEntries(url.searchParams.entries());

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });

/* --------------------------------------------------------------- endpoints */

function projectDetail(id) {
  const idx = store.projectById.get(id);
  if (idx === undefined) return null;
  const project = store.projects[idx];
  const start = store.ranges[idx * 2];
  const end = store.ranges[idx * 2 + 1];
  const c = store.col;

  // Case-level rollups for this project, computed on its own contiguous range.
  let open = 0;
  let observed = 0;
  let delayed = 0;
  let areaOpen = 0;
  let compSum = 0;
  let qualitySum = 0;
  let inactivitySum = 0;
  let legalCases = 0;
  let legalParcels = 0;
  let familiesSum = 0;
  const band = [0, 0, 0, 0];
  const worst = [];

  for (let row = start; row < end; row++) {
    compSum += c.compCompletion[row];
    qualitySum += c.quality[row];
    inactivitySum += c.inactivity[row];
    legalCases += c.legalCases[row];
    legalParcels += c.legalDispute[row];
    if (c.families[row] > 0) familiesSum += c.families[row];
    if (c.observed[row] === 1) {
      observed++;
      if (c.delayed[row] === 1) delayed++;
    } else {
      open++;
      areaOpen += c.areaHa[row];
      band[c.riskBand[row]]++;
      worst.push(row);
    }
  }
  worst.sort((a, b) => c.score[b] - c.score[a]);

  const topCases = worst.slice(0, 8).map((row) => caseAt(store, row, { withContributors: true }));
  const total = end - start;

  return {
    project: {
      ...project,
      compensationCompletionPct: Number((compSum / Math.max(1, total)).toFixed(1)),
      dataQuality: Math.round(qualitySum / Math.max(1, total)),
      avgInactivityDays: Number((inactivitySum / Math.max(1, total)).toFixed(1)),
      legalCases,
      legalDisputeParcels: legalParcels,
      affectedFamilies: familiesSum,
      openCases: open,
      observedCases: observed,
      observedDelayRate: observed ? Number((delayed / observed).toFixed(4)) : 0,
      openAreaHa: Number(areaOpen.toFixed(1)),
      riskMix: { Low: band[0], Medium: band[1], High: band[2], Critical: band[3] },
      highRiskCases: band[2] + band[3],
      criticalCases: band[3],
    },
    topCases,
    intervention: interventionFor(project.contributors[0]?.group ?? 'Other'),
    contributors: project.contributors,
    stageRisk: project.stageRisk,
    riskHistory: project.riskHistory.map((value, i) => ({
      month: isoFromDay(store.todayDay - (11 - i) * 30).slice(0, 7),
      riskScore: value,
    })),
  };
}

function summaryPayload() {
  return {
    ...store.summary,
    store: { rows: store.rows, bytes: store.bytes, loadMs: store.loadMs },
  };
}

function projectList(p) {
  const risk = p.risk ? p.risk.split(',') : null;
  const stages = p.stage ? p.stage.split(',') : null;
  const states = p.state ? p.state.split(',') : null;
  const types = p.projectType ? p.projectType.split(',') : null;
  const authorities = p.authority ? p.authority.split(',') : null;
  const priorities = p.priority ? p.priority.split(',') : null;
  const districts = p.district ? p.district.split(',') : null;
  const q = p.q ? p.q.trim().toLowerCase() : null;
  const statusFilter = p.status ? p.status.split(',') : null;

  let rows = store.projects.filter((pr) => {
    if (risk && !risk.includes(pr.riskBand)) return false;
    if (stages && !stages.includes(pr.currentStage)) return false;
    if (states && !states.includes(pr.state)) return false;
    if (types && !types.includes(pr.type)) return false;
    if (authorities && !authorities.includes(pr.authority)) return false;
    if (priorities && !priorities.includes(pr.priority)) return false;
    if (districts && !pr.districts.some((d) => districts.includes(d))) return false;
    if (statusFilter) {
      const milestoneStatus = pr.stages[pr.currentStageIndex].status;
      if (!statusFilter.includes(milestoneStatus)) return false;
    }
    if (q && !`${pr.name} ${pr.id} ${pr.state} ${pr.authority} ${pr.districts.join(' ')}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  const sort = p.sort ?? 'risk';
  const dir = p.dir === 'asc' ? 1 : -1;
  const key = {
    risk: (x) => x.riskScore,
    progress: (x) => x.progressPct,
    parcels: (x) => x.totalParcels,
    open: (x) => x.openCases,
    highRisk: (x) => x.highRiskCases,
    deadline: (x) => -new Date(x.milestoneDeadline).getTime(),
    name: (x) => x.name,
    area: (x) => x.landRequirementHa,
    families: (x) => x.affectedFamilies,
    quality: (x) => x.dataQuality,
  }[sort] ?? ((x) => x.riskScore);

  rows = [...rows].sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    if (typeof av === 'string') return av.localeCompare(bv) * -dir;
    return (av - bv) * dir;
  });

  const pageSize = Math.min(100, Math.max(1, Number(p.pageSize ?? 20)));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Number(p.page ?? 1)), pages);

  return {
    total: rows.length,
    page,
    pages,
    pageSize,
    aggregate: {
      openCases: rows.reduce((s, r) => s + r.openCases, 0),
      totalParcels: rows.reduce((s, r) => s + r.totalParcels, 0),
      highRiskCases: rows.reduce((s, r) => s + r.highRiskCases, 0),
      landRequirementHa: Math.round(rows.reduce((s, r) => s + r.landRequirementHa, 0)),
      affectedFamilies: rows.reduce((s, r) => s + r.affectedFamilies, 0),
      avgRisk: rows.length ? Math.round(rows.reduce((s, r) => s + r.riskScore, 0) / rows.length) : 0,
      delayedMilestones: rows.filter((r) => r.stages[r.currentStageIndex].daysRemaining < 0).length,
      riskMix: ['Low', 'Medium', 'High', 'Critical'].reduce((acc, b) => {
        acc[b] = rows.filter((r) => r.riskBand === b).length;
        return acc;
      }, {}),
    },
    projects: rows.slice((page - 1) * pageSize, page * pageSize).map((pr) => ({
      id: pr.id,
      name: pr.name,
      type: pr.type,
      state: pr.state,
      districts: pr.districts,
      authority: pr.authority,
      priority: pr.priority,
      currentStage: pr.currentStage,
      currentStageIndex: pr.currentStageIndex,
      currentMilestone: pr.currentMilestone,
      milestoneDeadline: pr.milestoneDeadline,
      milestoneStatus: pr.stages[pr.currentStageIndex].status,
      daysRemaining: pr.stages[pr.currentStageIndex].daysRemaining,
      progressPct: pr.progressPct,
      totalParcels: pr.totalParcels,
      openCases: pr.openCases,
      highRiskCases: pr.highRiskCases,
      criticalCases: pr.criticalCases,
      landRequirementHa: pr.landRequirementHa,
      affectedFamilies: pr.affectedFamilies,
      compensationStatus: pr.compensationStatus,
      compensationCompletionPct: pr.compensationCompletionPct,
      possessionStatus: pr.possessionStatus,
      rrStatus: pr.rrStatus,
      legalCases: pr.legalCases,
      dominantOwnership: pr.dominantOwnership,
      stakeholderResponsiveness: pr.stakeholderResponsiveness,
      riskScore: pr.riskScore,
      riskBand: pr.riskBand,
      delayProbability: pr.delayProbability,
      riskBasis: pr.riskBasis,
      dataQuality: pr.dataQuality,
      topContributor: pr.contributors[0]?.group ?? null,
      budgetCr: pr.budgetCr,
      startDate: pr.startDate,
      targetCompletionDate: pr.targetCompletionDate,
    })),
  };
}

function facets() {
  const uniq = (fn) => Array.from(new Set(store.projects.map(fn))).sort();
  return {
    states: uniq((p) => p.state),
    projectTypes: uniq((p) => p.type),
    authorities: uniq((p) => p.authority),
    priorities: uniq((p) => p.priority),
    stages: store.stages,
    riskBands: store.bandNames,
    ownership: store.dicts.ownership,
    compensationStatuses: store.dicts.compStatus,
    landTypes: store.dicts.landType,
    districts: store.districtTable.map((d) => ({ state: d.state, district: d.district, key: d.key })),
    milestoneStatuses: ['In Progress', 'Delayed', 'Completed', 'Pending'],
    today: store.today,
  };
}

/** CSV of whatever the current filter selects, streamed straight from the store. */
function exportCases(res, p) {
  const limit = Math.min(50000, Math.max(1, Number(p.limit ?? 20000)));
  const { total, rows } = queryCaseRows(store, p, limit);
  const head = [
    'case_id', 'parcel_id', 'project_id', 'project_name', 'state', 'district', 'village',
    'current_stage', 'milestone', 'milestone_due_date', 'days_to_milestone', 'land_area_ha',
    'ownership_complexity', 'affected_families', 'compensation_status',
    'compensation_completion_percentage', 'legal_dispute', 'legal_case_count', 'inactivity_days',
    'document_completeness', 'data_quality_score', 'predicted_delay_risk_percent', 'risk_band',
    'top_predictive_contributor', 'recommended_review', 'label_observed', 'observed_outcome',
  ];
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="bhoomipredict-cases-${store.today}.csv"`,
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
        c.caseId, c.parcelId, c.projectId, c.projectName, c.state, c.district, c.village,
        c.stage, c.milestone, c.milestoneDueDate, c.daysToMilestone, c.areaHa,
        c.ownership, c.affectedFamilies, c.compensationStatus, c.compensationCompletionPct,
        c.legalDispute ? 1 : 0, c.legalCases, c.inactivityDays, c.documentCompleteness,
        c.dataQuality, c.riskScore, c.riskBand, top, top ? interventionFor(top).action : '',
        c.labelObserved ? 1 : 0, c.outcome,
      ].map(q).join(',');
    });
    res.write(`${lines.join('\n')}\n`);
  }
  res.end();
}

/** Stream a data file, gzipped when the client accepts it. */
function streamFile(req, res, filePath, contentType, downloadName) {
  if (!fs.existsSync(filePath)) return notFound(res, `${path.basename(filePath)} has not been generated yet`);
  const stat = fs.statSync(filePath);
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && contentType.startsWith('text');
  const headers = {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${downloadName}"`,
    'Cache-Control': 'no-store',
    'X-Uncompressed-Length': String(stat.size),
  };
  if (acceptsGzip) headers['Content-Encoding'] = 'gzip';
  else headers['Content-Length'] = String(stat.size);
  res.writeHead(200, headers);
  const stream = fs.createReadStream(filePath);
  if (acceptsGzip) stream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
  else stream.pipe(res);
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
    return json(
      res,
      {
        error: 'Front end bundle not found',
        hint: 'Run "npm run build" for production, or "npm run dev" which serves the app from Vite.',
      },
      404,
    );
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;
  const p = paramsOf(url);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (pathname === '/api/health') {
      return json(res, {
        ok: true,
        rows: store.rows,
        projects: store.projects.length,
        today: store.today,
        storeBytes: store.bytes,
        shap: store.meta.shapAvailable,
        uptimeSeconds: Math.round(process.uptime()),
      });
    }

    if (pathname === '/api/summary') return json(res, summaryPayload());
    if (pathname === '/api/facets') return json(res, facets());
    if (pathname === '/api/geo') return json(res, store.geo);
    if (pathname === '/api/model') return json(res, store.model);

    if (pathname === '/api/projects') return json(res, projectList(p));

    const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(pathname);
    if (projectMatch) {
      const detail = projectDetail(decodeURIComponent(projectMatch[1]));
      return detail ? json(res, detail) : notFound(res, 'Project not found');
    }

    const projectCases = /^\/api\/projects\/([^/]+)\/cases$/.exec(pathname);
    if (projectCases) {
      const id = decodeURIComponent(projectCases[1]);
      if (!store.projectById.has(id)) return notFound(res, 'Project not found');
      return json(res, queryCases(store, { ...p, projectId: id }));
    }

    if (pathname === '/api/cases') return json(res, queryCases(store, p));

    const caseMatch = /^\/api\/cases\/([^/]+)$/.exec(pathname);
    if (caseMatch) {
      const id = decodeURIComponent(caseMatch[1]);
      const m = /^LAC-(\d+)$/i.exec(id);
      const row = m ? Number(m[1]) - 500000 : -1;
      if (!(row >= 0 && row < store.rows)) return notFound(res, 'Case not found');
      const detail = caseAt(store, row, { withContributors: true });
      const top = detail.contributors.find((x) => x.value > 0)?.group ?? 'Other';
      return json(res, {
        case: { ...detail, featureContributions: featureContributionsFor(store, row) },
        project: store.projects[store.col.projectIdx[row]],
        intervention: interventionFor(top),
        explanation: {
          basis: store.meta.shapAvailable ? 'TreeSHAP on the deployed ensemble' : 'linear surrogate',
          unit: 'log-odds contribution to the predicted risk',
          baseValue: store.model.metrics.shap?.baseValue ?? null,
          caveat:
            'These factors contributed most to the model’s prediction for this case. They are not a finding that any factor caused a delay.',
        },
      });
    }

    if (pathname === '/api/queue') return json(res, queryQueue(store, p));
    if (pathname === '/api/map/points') return json(res, queryMapPoints(store, p));
    if (pathname === '/api/breakdown') return json(res, queryBreakdown(store, p));
    if (pathname === '/api/contributors') return json(res, queryContributors(store, p));

    if (pathname === '/api/predict/spec') {
      return json(res, { ...predictionSpec(store), defaults: defaultRecord(store) });
    }

    if (pathname === '/api/predict/case') {
      const m = /^LAC-(\d+)$/i.exec(p.caseId ?? '');
      const row = m ? Number(m[1]) - 500000 : -1;
      if (!(row >= 0 && row < store.rows)) return notFound(res, 'Case not found');
      const record = recordFromCase(store, row);
      return json(res, {
        record,
        ensemble: {
          probability: Number(store.col.score[row].toFixed(4)),
          riskScore: Math.min(99, Math.max(1, Math.round(store.col.score[row] * 100))),
          contributors: contributorsFor(store, row),
        },
        surrogate: scoreRecord(store.surrogate, record),
      });
    }

    if (pathname === '/api/predict' && req.method === 'POST') {
      const body = await readBody(req);
      const record = { ...defaultRecord(store), ...(body.record ?? body) };
      const result = scoreRecord(store.surrogate, record);
      const baseline = body.baseline ? scoreRecord(store.surrogate, { ...defaultRecord(store), ...body.baseline }) : null;
      return json(res, {
        record,
        result,
        baseline,
        delta: baseline
          ? {
              probability: Number((result.probability - baseline.probability).toFixed(4)),
              // Taken from the probabilities rather than the displayed scores, so a
              // saturated case that genuinely moved does not report a flat zero.
              riskScore: Number(((result.probability - baseline.probability) * 100).toFixed(1)),
            }
          : null,
        intervention: interventionFor(result.increasing[0]?.group ?? 'Other'),
      });
    }

    if (pathname === '/api/export/cases.csv') return exportCases(res, p);
    if (pathname === '/api/export/dataset.csv') {
      return streamFile(
        req,
        res,
        path.join(DATA, 'land_acquisition_synthetic_350k.csv'),
        'text/csv; charset=utf-8',
        'land_acquisition_synthetic_350k.csv',
      );
    }
    if (pathname === '/api/export/dataset.pdf') {
      return streamFile(
        req,
        res,
        path.join(DATA, 'land_acquisition_synthetic_350k.pdf'),
        'application/pdf',
        'land_acquisition_synthetic_350k.pdf',
      );
    }
    if (pathname === '/api/export/manifest') {
      const files = [
        ['land_acquisition_synthetic_350k.csv', 'Full synthetic corpus (CSV)', '/api/export/dataset.csv'],
        ['land_acquisition_synthetic_350k.pdf', 'Dataset documentation and tabular export (PDF)', '/api/export/dataset.pdf'],
      ].map(([name, label, href]) => {
        const file = path.join(DATA, name);
        const exists = fs.existsSync(file);
        return {
          name,
          label,
          href,
          available: exists,
          bytes: exists ? fs.statSync(file).size : 0,
          generatedAt: exists ? fs.statSync(file).mtime.toISOString() : null,
        };
      });
      return json(res, { files });
    }

    if (pathname.startsWith('/api/')) return notFound(res, `No such endpoint: ${pathname}`);

    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[api]', err);
    return json(res, { error: err.message ?? 'Internal error' }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
