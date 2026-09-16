/**
 * Project service — the single source of project truth for every endpoint.
 *
 *   corpus registry (data/api/projects.json)
 *     + recorded edits and stage advances   (runtime state)
 *     + projects added through the form or CSV upload
 *     − soft-deleted projects
 *   ─────────────────────────────────────────────
 *   effective projects → dependency network → lifecycle → risk → rules
 *
 * Dashboard, registry, GIS, scenario seeding, interventions, alerts, profile
 * and reports all read `effectiveProjects()`. None of them recompute status,
 * risk bands or owners on their own.
 *
 * Risk basis
 *   ensemble            corpus project, unedited: mean deployed-model probability
 *                       over the open cases of the current stage
 *   ensemble+adjustment corpus project with recorded edits: the ensemble figure
 *                       moved by the ensemble's estimate of the edit (difference
 *                       in log-odds between the edited and original profile)
 *   ensemble-profile    project added without case records: the deployed ensemble
 *                       scored on the project-level profile
 */
import {
  LIFECYCLE_STAGES,
  PROJECT_TYPES,
  buildDependencyNetwork,
  coordinationScore,
  DEPENDENCY_CODES,
} from '../domain/registry.mjs';
import { deriveLifecycle, dayFromISO, isoFromDay } from '../domain/lifecycle.mjs';
import { evaluateProject } from '../domain/rules.mjs';
import { validateProject } from '../domain/validation.mjs';
import { scoreModel } from './scorer.mjs';
import { forecastProject } from './forecast.mjs';
import { attachImpact } from './impact.mjs';
import { getState, saveState, recordAudit } from './persistence.mjs';
import { districtIndex } from '../domain/geography.mjs';

const STAGE_DAYS = [45, 75, 60, 90, 70, 110, 80, 120, 35];
const STAGE_SLIP = [0.1, 0.22, 0.15, 0.38, 0.27, 0.44, 0.31, 0.35, 0.08];
const BANDS = ['Low', 'Medium', 'High', 'Critical'];

let store = null;
let cache = null;
let version = 0;

export function attachStore(s) {
  store = s;
  cache = null;
  caseSamples = null;
}

/** Invalidate derived projects after any state change. */
export const touchProjects = () => {
  version++;
  cache = null;
};

/** Project risk is an aggregate (expected share of open parcels that slip), so it uses the project bands. */
const bandOfProb = (p) => {
  const b = store.projectRiskBands;
  return p >= b.critical ? 'Critical' : p >= b.high ? 'High' : p >= b.medium ? 'Medium' : 'Low';
};
const logit = (p) => Math.log(Math.max(1e-6, Math.min(1 - 1e-6, p)) / (1 - Math.max(1e-6, Math.min(1 - 1e-6, p))));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/* --------------------------------------------------------- case samples */

let caseSamples = null;

/** The worst open cases per project for the categories rules cite. Real rows, computed once per store. */
function samplesFor(projectIdx) {
  if (!caseSamples) caseSamples = new Map();
  if (caseSamples.has(projectIdx)) return caseSamples.get(projectIdx);
  const c = store.col;
  const start = store.ranges[projectIdx * 2];
  const end = store.ranges[projectIdx * 2 + 1];
  const open = [];
  for (let row = start; row < end; row++) if (c.observed[row] === 0) open.push(row);
  const top = (pred, key) =>
    open
      .filter(pred)
      .sort(key)
      .slice(0, 3)
      .map((row) => `LAC-${500000 + row}`);
  const out = {
    compensation: top((r) => c.stageIdx[r] >= 5 && c.compCompletion[r] < 60, (a, b) => c.compCompletion[a] - c.compCompletion[b] || c.score[b] - c.score[a]),
    legal: top((r) => c.legalCases[r] > 0, (a, b) => c.legalCases[b] - c.legalCases[a] || c.score[b] - c.score[a]),
    documentation: top((r) => c.docComplete[r] >= 0 && c.docComplete[r] < 70, (a, b) => c.docComplete[a] - c.docComplete[b]),
  };
  caseSamples.set(projectIdx, out);
  return out;
}

/* ------------------------------------------------------------ profiles */

const disputeFromRate = (perParcel) => (perParcel <= 0 ? 'None' : perParcel < 0.25 ? 'Low' : perParcel < 0.6 ? 'Moderate' : 'High');

/**
 * Project-level profile in the model's feature vocabulary. Parcel-level
 * counts are expressed per parcel so the profile sits on the same scale as the
 * case records the surrogate was fitted on.
 */
export function projectRecord(p) {
  const cur = p.stages[p.currentStageIndex];
  const parcels = Math.max(1, p.totalParcels);
  const openCur = cur?.openCases ?? 0;
  const pendingCur = openCur
    ? (p.network?.nodes ?? []).reduce((s, n) => s + (n.pendingCurrentStage ?? 0), 0) / openCur
    : p.pendingDependencyActions ?? 0;
  const approval = p.stageDependency?.[p.currentStageIndex]?.approvalDelayMean ?? p.approvalDelayDays ?? 0;
  const doc = p.avgDocumentCompleteness ?? 70;
  const legalPerParcel = (p.legalCases ?? 0) / parcels;
  return {
    land_area_ha: p.parcelAreaHa ? p.parcelAreaHa / parcels : p.landRequirementHa / parcels,
    expected_stage_days: cur?.plannedDays ?? STAGE_DAYS[p.currentStageIndex],
    elapsed_stage_days: Math.max(1, Math.min(400, cur?.daysElapsed || 1)),
    affected_families: (p.affectedFamilies ?? 0) / parcels,
    number_of_owners: '',
    compensation_pending_days: '',
    compensation_completion_percentage: p.compensationCompletionPct ?? 0,
    legal_case_count: legalPerParcel,
    rr_progress_percentage: p.rrProgressPct ?? '',
    rehabilitation_cases: (p.rrCases ?? 0) / parcels,
    department_response_days: '',
    document_completeness: doc,
    inactivity_days: p.avgInactivityDays ?? '',
    historical_stage_delay_rate: STAGE_SLIP[p.currentStageIndex],
    district_historical_delay_rate: p.districtDelayRate ?? 0.33,
    authority_historical_delay_rate: p.authorityDelayRate ?? 0.33,
    authority_dependency_count: p.network?.dependencyCount ?? '',
    pending_dependency_actions: pendingCur,
    approval_delay_days: approval,
    department_coordination_score: p.coordinationScore ?? '',
    project_land_requirement_ha: p.landRequirementHa,
    latitude: p.lat,
    longitude: p.lon,
    state: p.state,
    project_type: p.type,
    authority: p.authority,
    project_priority: p.priority,
    land_type: 'Dry Agricultural',
    current_stage: p.currentStage,
    ownership_complexity: p.dominantOwnership ?? 'Joint',
    compensation_status: p.compensationStatus ?? 'Not Initiated',
    dispute_complexity: disputeFromRate(legalPerParcel),
    stakeholder_responsiveness: p.stakeholderResponsiveness ?? 'Moderate',
    verification_status: doc > 82 ? 'Verified' : doc > 55 ? 'In Progress' : 'Pending',
    approval_status: approval > 0 ? 'Under Review' : 'Approved',
    possession_status: p.possessionStatus ?? 'Not Initiated',
    rr_status: p.rrStatus ?? 'Not Applicable',
    legal_dispute: (p.legalDisputeParcels ?? 0) / parcels,
    rr_required: (p.rrRequiredParcels ?? 0) / parcels,
  };
}

const compensationStatusOf = (pct) => (pct > 92 ? 'Paid' : pct > 55 ? 'Partially Paid' : pct > 18 ? 'Awarded' : pct > 3 ? 'Assessed' : 'Not Initiated');
const possessionStatusOf = (pct, stageIdx) => (pct > 90 ? 'Complete' : pct > 25 ? 'Partial' : stageIdx >= 6 ? 'Notice Issued' : 'Not Initiated');

function authorityRateFor(name) {
  const hit = store.projects.find((p) => p.authority === name);
  return hit ? hit.authorityDelayRate : 0.33;
}

function districtRateFor(state, district) {
  const d = store.districtTable.find((x) => x.state === state && x.district === district);
  if (d) return d.historicalDelayRate ?? d.observedDelayRate;
  const inState = store.districtTable.filter((x) => x.state === state);
  if (inState.length) return inState.reduce((s, x) => s + (x.historicalDelayRate ?? x.observedDelayRate), 0) / inState.length;
  return 0.33;
}

/** Lifecycle progress: completed stages plus the share of planned time used in the current one. */
const progressOf = (p) => {
  const cur = p.stages[p.currentStageIndex];
  return Number((((p.currentStageIndex + Math.min(1, (cur.daysElapsed ?? 0) / Math.max(1, cur.plannedDays))) / LIFECYCLE_STAGES.length) * 100).toFixed(1));
};

/* ----------------------------------------------------------- stage plans */

/** Stage schedule for a project that has no generated timeline (form / CSV). */
function planStages(p) {
  const size = Math.max(0.72, Math.min(1.85, 0.72 + Math.log10(Math.max(1, p.totalParcels) / 180) * 0.55));
  const start = dayFromISO(p.startDate);
  const target = dayFromISO(p.targetCompletionDate);
  const raw = STAGE_DAYS.map((d) => d * size);
  const total = raw.reduce((a, b) => a + b, 0);
  const fit = (target - start) / total; // stretch the plan to the sanctioned window
  const planned = raw.map((d) => Math.max(10, Math.round(d * fit)));
  let cursor = start;
  return LIFECYCLE_STAGES.map((name, i) => {
    const s0 = cursor;
    cursor += planned[i];
    const done = i < p.currentStageIndex;
    return {
      name,
      index: i,
      plannedStart: isoFromDay(s0),
      baselineCompletion: isoFromDay(s0 + planned[i]),
      expectedCompletion: isoFromDay(s0 + planned[i]),
      actualStart: i <= p.currentStageIndex ? isoFromDay(s0) : null,
      actualCompletion: done ? isoFromDay(s0 + planned[i]) : null,
      slipDays: 0,
      plannedDays: planned[i],
      openCases: 0,
      totalCases: 0,
      milestone: null,
    };
  });
}

/* --------------------------------------------------------- materialising */

const CONTEXT_FIELDS = ['type', 'subtype', 'state', 'district', 'subDistrict', 'authority', 'affectedFamilies', 'forestLand', 'crossesRailway', 'crossesHighway', 'consolidationOpen'];
const MODEL_FIELDS = ['compensationCompletionPct', 'possessionCompletionPct', 'rrProgressPct', 'avgDocumentCompleteness', 'legalCases', 'legalDisputeParcels', 'stakeholderResponsiveness', 'approvalDelayDays', 'priority', 'affectedFamilies', 'dominantOwnership', ...CONTEXT_FIELDS];

function applyStageAdvances(p, advances = []) {
  for (const adv of advances) {
    const i = p.currentStageIndex;
    if (i >= LIFECYCLE_STAGES.length - 1) break;
    const stages = p.stages.map((s) => ({ ...s }));
    stages[i].actualCompletion = adv.completedOn;
    stages[i].slipDays = dayFromISO(adv.completedOn) - dayFromISO(stages[i].expectedCompletion);
    const nextStart = dayFromISO(adv.completedOn);
    stages[i + 1].actualStart = adv.completedOn;
    stages[i + 1].expectedCompletion = isoFromDay(nextStart + stages[i + 1].plannedDays);
    // Later stages keep their durations but shift behind the new frontier.
    let cursor = nextStart + stages[i + 1].plannedDays;
    for (let k = i + 2; k < stages.length; k++) {
      stages[k].expectedCompletion = isoFromDay(cursor + stages[k].plannedDays);
      cursor += stages[k].plannedDays;
    }
    p.stages = stages;
    p.currentStageIndex = i + 1;
    p.currentStage = LIFECYCLE_STAGES[i + 1];
  }
}

function withNetwork(p, baseNetwork) {
  const network = buildDependencyNetwork({
    projectType: p.type,
    subtype: p.subtype,
    state: p.state,
    district: p.district,
    subDistrict: p.subDistrict,
    primaryAuthority: p.authority,
    affectedFamilies: p.affectedFamilies ?? 0,
    flags: {
      forestLand: Boolean(p.flags?.forestLand),
      crossesRailway: Boolean(p.flags?.crossesRailway),
      crossesHighway: Boolean(p.flags?.crossesHighway),
      consolidationOpen: Boolean(p.flags?.consolidationOpen),
    },
  });
  // Pending counts come from case data; carry them across for dependencies that still apply.
  const pendingByCode = new Map((baseNetwork?.nodes ?? []).map((n) => [n.code, n]));
  network.nodes = network.nodes.map((n) => {
    const prev = pendingByCode.get(n.code);
    return {
      ...n,
      pendingOpenCases: prev?.pendingOpenCases ?? 0,
      pendingCurrentStage: prev?.pendingCurrentStage ?? 0,
      pendingShareCurrentStage: prev?.pendingShareCurrentStage ?? 0,
    };
  });
  const { milestones, ...rest } = network;
  return { network: rest, milestones };
}

function materialiseCorpus(base, override) {
  const p = structuredClone(base);
  p.source = 'corpus';
  const fields = override?.fields ?? {};
  const contextChanged = CONTEXT_FIELDS.some((k) => fields[k] !== undefined && fields[k] !== (k in p.flags ? p.flags[k] : p[k]));
  for (const [k, v] of Object.entries(fields)) {
    if (['forestLand', 'crossesRailway', 'crossesHighway', 'consolidationOpen'].includes(k)) p.flags = { ...p.flags, [k]: v };
    else p[k] = v;
  }
  if (fields.district && !p.districts.includes(fields.district)) p.districts = [fields.district, ...p.districts];
  if (contextChanged) {
    const { network, milestones } = withNetwork(p, base.network);
    p.network = network;
    p.framework = network.framework;
    p.subDistrictLabel = network.stateProfile.subDistrictLabel;
    p.stages = p.stages.map((s) => ({ ...s, milestone: milestones[s.name] }));
    p.authorityDelayRate = fields.authority ? authorityRateFor(p.authority) : p.authorityDelayRate;
    p.districtDelayRate = fields.district || fields.state ? districtRateFor(p.state, p.district) : p.districtDelayRate;
  }
  p.coordinationScore = coordinationScore(p.network, p.authorityDelayRate);
  applyStageAdvances(p, override?.stageAdvances);
  // A stage advance switches on the progress measures that become due, from the case records.
  if (p.currentStageIndex >= 5 && base.currentStageIndex < 5 && fields.compensationCompletionPct === undefined && base.dueProgressRaw) {
    p.compensationCompletionPct = base.dueProgressRaw.compensation;
  }
  if (p.currentStageIndex >= 6 && base.currentStageIndex < 6 && base.dueProgressRaw) {
    if (fields.possessionCompletionPct === undefined) p.possessionCompletionPct = base.dueProgressRaw.possession;
    if (fields.rrProgressPct === undefined && p.rrRequiredParcels) p.rrProgressPct = base.dueProgressRaw.rr ?? 0;
  }
  if (fields.compensationCompletionPct !== undefined || p.compensationCompletionPct !== base.compensationCompletionPct) p.compensationStatus = compensationStatusOf(p.compensationCompletionPct);
  if (fields.possessionCompletionPct !== undefined || p.possessionCompletionPct !== base.possessionCompletionPct) p.possessionStatus = possessionStatusOf(p.possessionCompletionPct, p.currentStageIndex);
  p.currentStage = LIFECYCLE_STAGES[p.currentStageIndex];

  const life = deriveLifecycle(p, { todayDay: store.todayDay, stageRisk: p.stageRisk, stageDependency: p.stageDependency });
  p.stages = life.stages;
  p.lifecycle = { ...life, stages: undefined };
  p.currentMilestone = p.stages[p.currentStageIndex].milestone;
  p.milestoneDeadline = p.stages[p.currentStageIndex].expectedCompletion;
  p.progressPct = progressOf(p);

  const edited = Object.keys(fields).some((k) => MODEL_FIELDS.includes(k)) || (override?.stageAdvances?.length ?? 0) > 0;
  if (edited) {
    // Move the ensemble figure by the model's estimate of what changed.
    const before = scoreModel(store, projectRecord(base), { explain: false, level: 'project' });
    const after = scoreModel(store, projectRecord(p), { explain: false, level: 'project' });
    const prob = sigmoid(logit(base.delayProbability) + (after.logOdds - before.logOdds));
    p.previousEnsembleRisk = base.riskScore;
    p.delayProbability = Number(prob.toFixed(4));
    p.riskScore = Math.min(99, Math.max(1, Math.round(prob * 100)));
    p.riskBand = bandOfProb(prob);
    p.predictedDelayDays = Math.max(0, Math.round((base.predictedDelayDays ?? 0) + ((after.predictedDelayDays ?? 0) - (before.predictedDelayDays ?? 0))));
    p.riskBasis = 'ensemble+adjustment';
    p.adjustment = {
      profileBefore: before.riskScore,
      profileAfter: after.riskScore,
      logOddsDelta: Number((after.logOdds - before.logOdds).toFixed(4)),
      changedFields: Object.keys(fields),
      stageAdvances: override?.stageAdvances?.length ?? 0,
    };
  } else {
    p.riskBasis = 'ensemble';
  }
  return p;
}

function materialiseUser(raw) {
  const p = {
    ...raw,
    source: raw.source ?? 'user',
    zone: raw.zone ?? null,
    districts: [raw.district],
    subDistricts: raw.subDistrict ? [raw.subDistrict] : [],
    flags: { forestLand: Boolean(raw.forestLand), crossesRailway: Boolean(raw.crossesRailway), crossesHighway: Boolean(raw.crossesHighway), consolidationOpen: false },
    currentStageIndex: LIFECYCLE_STAGES.indexOf(raw.currentStage),
    openCases: 0,
    observedCases: 0,
    observedDelayRate: 0,
    highRiskCases: 0,
    criticalCases: 0,
    riskMix: { Low: 0, Medium: 0, High: 0, Critical: 0 },
    legalDisputeParcels: raw.legalDisputeParcels ?? Math.min(raw.totalParcels, raw.legalCases ?? 0),
    rrRequiredParcels: raw.rrProgressPct > 0 || raw.affectedFamilies > 0 ? Math.round(raw.totalParcels * 0.2) : 0,
    rrCases: Math.round((raw.affectedFamilies ?? 0) * 0.6),
    avgInactivityDays: null,
    dataQuality: null,
    stageRisk: LIFECYCLE_STAGES.map((s, i) => ({ stage: s, index: i, openCases: 0, riskScore: null, band: null, mix: [0, 0, 0, 0], basis: 'no-open-cases' })),
    stageDependency: null,
    contributors: [],
    riskTrend: [],
    budgetCr: raw.budgetCr ?? null,
    parcelAreaHa: null,
  };
  p.stages = planStages(p);
  p.districtDelayRate = districtRateFor(p.state, p.district);
  p.authorityDelayRate = authorityRateFor(p.authority);
  const { network, milestones } = withNetwork(p, null);
  p.network = network;
  p.framework = network.framework;
  p.subDistrictLabel = network.stateProfile.subDistrictLabel;
  p.stages = p.stages.map((s) => ({ ...s, milestone: milestones[s.name] }));
  p.coordinationScore = coordinationScore(network, p.authorityDelayRate);
  p.compensationStatus = compensationStatusOf(p.compensationCompletionPct ?? 0);
  p.possessionStatus = possessionStatusOf(p.possessionCompletionPct ?? 0, p.currentStageIndex);
  p.rrStatus = p.rrRequiredParcels === 0 ? 'Not Applicable' : p.rrProgressPct > 95 ? 'Complete' : p.rrProgressPct > 5 ? 'In Progress' : 'Not Started';
  applyStageAdvances(p, raw.stageAdvances);
  p.currentStage = LIFECYCLE_STAGES[p.currentStageIndex];

  const life = deriveLifecycle(p, { todayDay: store.todayDay, stageRisk: p.stageRisk, stageDependency: [] });
  p.stages = life.stages.map((s) => ({
    ...s,
    explanation: `${s.explanation} No case-level records are attached to this project, so case backlog is not tracked.`,
  }));
  p.lifecycle = { ...life, stages: undefined };
  p.currentMilestone = p.stages[p.currentStageIndex].milestone;
  p.milestoneDeadline = p.stages[p.currentStageIndex].expectedCompletion;
  p.progressPct = progressOf(p);

  const scored = scoreModel(store, projectRecord(p), { level: 'project' });
  p.delayProbability = scored.probability;
  p.riskScore = scored.riskScore;
  p.riskBand = scored.riskBand;
  p.predictedDelayDays = scored.predictedDelayDays ?? 0;
  p.riskBasis = store.ensemble ? 'ensemble-profile' : 'surrogate';
  p.contributors = scored.increasing.slice(0, 6).map((g) => ({ group: g.group, value: g.value, share: g.share }));
  p.contributorBasis = store.ensemble ? 'treeshap-profile' : 'surrogate';
  p.topContributor = p.contributors[0]?.group ?? null;
  return p;
}

/* ------------------------------------------------------------ snapshots */

function snapshot(state, p) {
  const list = state.riskSnapshots[p.id] ?? [];
  const modelVersion = store.model?.metrics?.generatedAt ?? null;
  const last = list[list.length - 1];
  let changed = false;
  if (!last || last.riskScore !== p.riskScore || last.modelVersion !== modelVersion) {
    list.push({ at: new Date().toISOString(), riskScore: p.riskScore, band: p.riskBand, basis: p.riskBasis, modelVersion });
    if (list.length > 24) list.splice(0, list.length - 24);
    state.riskSnapshots[p.id] = list;
    changed = true;
  }
  const previous = list.length >= 2 ? list[list.length - 2].riskScore : null;
  return { previous, changed, history: list };
}

/* ------------------------------------------------------------- public API */

export function effectiveProjects() {
  if (cache && cache.version === version && cache.store === store) return cache;
  const state = getState();
  const list = [];
  let snapshotsChanged = false;
  const docsRejected = new Map();
  for (const d of Object.values(state.documents)) {
    if (d.status === 'REJECTED' && !d.deleted) docsRejected.set(d.projectId, (docsRejected.get(d.projectId) ?? 0) + 1);
  }

  store.projects.forEach((base, idx) => {
    if (state.deletedProjects[base.id]) return;
    const p = materialiseCorpus(base, state.projectOverrides[base.id]);
    p.storeIndex = idx;
    list.push(p);
  });
  for (const raw of Object.values(state.userProjects)) {
    if (state.deletedProjects[raw.id]) continue;
    list.push(materialiseUser(raw));
  }

  for (const p of list) {
    const snap = snapshot(state, p);
    snapshotsChanged ||= snap.changed;
    p.riskSnapshots = snap.history;
    const recommendations = evaluateProject(p, {
      previousRisk: snap.previous,
      rejectedDocuments: docsRejected.get(p.id) ?? 0,
      caseSamples: p.storeIndex !== undefined ? samplesFor(p.storeIndex) : undefined,
      bands: store.projectRiskBands,
    });
    p.recommendations = attachImpact(p, recommendations, projectRecord(p), (r) => scoreModel(store, r, { explain: false, level: 'project' }));
    p.forecast = forecastProject(store, p);
  }
  if (snapshotsChanged) saveState();

  cache = { version, store, list, byId: new Map(list.map((p) => [p.id, p])) };
  return cache;
}

export const getProject = (id) => effectiveProjects().byId.get(id) ?? null;

/** The Step-2 project schema, as every list and export returns it. */
export function projectSummary(p) {
  const current = p.stages[p.currentStageIndex];
  return {
    id: p.id,
    project_id: p.id,
    name: p.name,
    type: p.type,
    subtype: p.subtype,
    framework: p.framework?.short ?? null,
    state: p.state,
    district: p.district,
    districts: p.districts,
    subDistrict: p.subDistrict,
    subDistrictLabel: p.subDistrictLabel,
    landRequirementHa: p.landRequirementHa,
    totalParcels: p.totalParcels,
    affectedFamilies: p.affectedFamilies,
    currentStage: p.currentStage,
    currentStageIndex: p.currentStageIndex,
    stageStatus: current.status,
    startDate: p.startDate,
    targetCompletionDate: p.targetCompletionDate,
    currentMilestone: p.currentMilestone,
    milestoneDeadline: p.milestoneDeadline,
    daysRemaining: current.daysRemaining,
    delayDays: current.delayDays,
    compensationStatus: p.compensationStatus,
    compensationCompletionPct: p.compensationCompletionPct,
    possessionStatus: p.possessionStatus,
    possessionCompletionPct: p.possessionCompletionPct ?? null,
    rrStatus: p.rrStatus,
    rrProgressPct: p.rrProgressPct ?? null,
    notificationStatus: p.lifecycle.notificationStatus,
    documentationCompleteness: p.avgDocumentCompleteness,
    legalDispute: (p.legalCases ?? 0) > 0,
    legalCases: p.legalCases,
    ownershipComplexity: p.dominantOwnership,
    stakeholderResponsiveness: p.stakeholderResponsiveness,
    approvalDelayDays: Math.round(p.stageDependency?.[p.currentStageIndex]?.approvalDelayMean ?? p.approvalDelayDays ?? 0),
    coordinationScore: p.coordinationScore,
    districtDelayRate: p.districtDelayRate,
    riskScore: p.riskScore,
    delayProbability: p.delayProbability,
    riskBand: p.riskBand,
    riskBasis: p.riskBasis,
    predictedDelayDays: p.predictedDelayDays ?? null,
    lat: p.lat,
    lon: p.lon,
    authority: p.authority,
    primaryAuthority: p.authority,
    responsibleDepartment: p.network.nodes.find((n) => n.code === 'LA_OFFICER')?.name ?? null,
    supportingDepartments: p.network.nodes.filter((n) => !['PRIMARY', 'LA_OFFICER'].includes(n.code)).map((n) => n.name),
    dependencyCount: p.network.dependencyCount,
    priority: p.priority,
    progressPct: p.progressPct,
    openCases: p.openCases,
    highRiskCases: p.highRiskCases,
    criticalCases: p.criticalCases,
    residualBacklog: p.lifecycle.residualBacklog,
    isDelayed: p.lifecycle.isDelayed,
    isBlocked: p.lifecycle.isBlocked,
    timelineOverrunDays: p.lifecycle.timelineOverrunDays,
    topContributor: p.topContributor ?? p.contributors?.[0]?.group ?? null,
    actionCount: p.recommendations.filter((r) => r.intervention && r.severity !== 'Low').length,
    dataQuality: p.dataQuality ?? null,
    budgetCr: p.budgetCr ?? null,
    source: p.source,
    dataSource: 'SYNTHETIC DEMO DATA',
  };
}

/* ------------------------------------------------------------------ writes */

export class ServiceError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function nextUserProjectId(state) {
  state.counters.project = (state.counters.project ?? 0) + 1;
  return `LAP-U${String(state.counters.project).padStart(4, '0')}`;
}

export function createProject(user, input, { source = 'form' } = {}) {
  const { value, errors } = validateProject(input, { from: 'key' });
  if (errors.length) throw new ServiceError('Project failed validation', 422, errors);
  const state = getState();
  const id = nextUserProjectId(state);
  const record = { ...value, id, source: source === 'csv' ? 'upload' : 'user', createdAt: new Date().toISOString(), createdBy: user.id };
  record.subDistrict ||= districtIndex().byKey.get(`${record.state}|${record.district}`)?.subDistricts[0] ?? null;
  state.userProjects[id] = record;
  saveState();
  touchProjects();
  recordAudit({ user, action: source === 'csv' ? 'project.uploaded' : 'project.created', entity: 'project', entityId: id, newValue: record });
  return getProject(id);
}

const EDITABLE = ['name', 'subtype', 'authority', 'priority', 'stakeholderResponsiveness', 'startDate', 'targetCompletionDate', 'compensationCompletionPct', 'possessionCompletionPct', 'rrProgressPct', 'avgDocumentCompleteness', 'legalCases', 'affectedFamilies', 'approvalDelayDays', 'dominantOwnership', 'forestLand', 'crossesRailway', 'crossesHighway', 'lat', 'lon', 'district', 'subDistrict'];

export function updateProject(user, id, patch) {
  const current = getProject(id);
  if (!current) throw new ServiceError('Project not found', 404);
  const unknown = Object.keys(patch).filter((k) => !EDITABLE.includes(k));
  if (unknown.length) throw new ServiceError(`These fields cannot be edited: ${unknown.join(', ')}`, 422);
  const existing = {
    ...current,
    currentStage: current.currentStage,
    forestLand: current.flags?.forestLand,
    crossesRailway: current.flags?.crossesRailway,
    crossesHighway: current.flags?.crossesHighway,
  };
  const { value, errors } = validateProject(patch, { partial: true, from: 'key', existing });
  if (errors.length) throw new ServiceError('Edit failed validation', 422, errors);
  const state = getState();
  const oldValue = Object.fromEntries(Object.keys(value).map((k) => [k, existing[k] ?? null]));
  if (current.source === 'corpus') {
    const o = state.projectOverrides[id] ?? { fields: {}, stageAdvances: [] };
    o.fields = { ...o.fields, ...value };
    o.updatedAt = new Date().toISOString();
    o.updatedBy = user.id;
    state.projectOverrides[id] = o;
  } else {
    state.userProjects[id] = { ...state.userProjects[id], ...value, updatedAt: new Date().toISOString(), updatedBy: user.id };
  }
  saveState();
  touchProjects();
  const updated = getProject(id);
  recordAudit({
    user,
    action: 'project.edited',
    entity: 'project',
    entityId: id,
    oldValue: { ...oldValue, riskScore: current.riskScore },
    newValue: { ...value, riskScore: updated.riskScore },
  });
  return updated;
}

export function advanceStage(user, id, { completedOn, note } = {}) {
  const current = getProject(id);
  if (!current) throw new ServiceError('Project not found', 404);
  if (current.currentStageIndex >= LIFECYCLE_STAGES.length - 1) throw new ServiceError('The project is already at its final stage.', 409);
  const date = completedOn ?? store.today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ServiceError('completedOn must be YYYY-MM-DD', 422);
  const stage = current.stages[current.currentStageIndex];
  if (date < stage.startDate) throw new ServiceError(`The milestone cannot be completed before the stage started (${stage.startDate}).`, 422);
  if (date > store.today) throw new ServiceError(`The completion date cannot be after the snapshot date (${store.today}).`, 422);
  const state = getState();
  const entry = { completedOn: date, by: user.id, at: new Date().toISOString(), note: note ?? null, stage: stage.name };
  if (current.source === 'corpus') {
    const o = state.projectOverrides[id] ?? { fields: {}, stageAdvances: [] };
    o.stageAdvances = [...(o.stageAdvances ?? []), entry];
    state.projectOverrides[id] = o;
  } else {
    state.userProjects[id].stageAdvances = [...(state.userProjects[id].stageAdvances ?? []), entry];
  }
  saveState();
  touchProjects();
  const updated = getProject(id);
  recordAudit({
    user,
    action: 'project.stage_completed',
    entity: 'project',
    entityId: id,
    oldValue: { currentStage: current.currentStage, stageStatus: stage.status },
    newValue: { completedStage: stage.name, completedOn: date, currentStage: updated.currentStage, residualOpenCases: updated.stages[current.currentStageIndex].openCases },
    note,
  });
  return updated;
}

export function deleteProject(user, id, { reason } = {}) {
  const current = getProject(id);
  if (!current) throw new ServiceError('Project not found', 404);
  const state = getState();
  state.deletedProjects[id] = { at: new Date().toISOString(), by: user.id, reason: reason ?? null, name: current.name };
  saveState();
  touchProjects();
  recordAudit({ user, action: 'project.deleted', entity: 'project', entityId: id, oldValue: { name: current.name, state: current.state }, note: reason ?? 'Soft delete — restorable from the audit screen' });
}

export function restoreProject(user, id) {
  const state = getState();
  if (!state.deletedProjects[id]) throw new ServiceError('Project is not deleted', 404);
  const info = state.deletedProjects[id];
  delete state.deletedProjects[id];
  saveState();
  touchProjects();
  recordAudit({ user, action: 'project.restored', entity: 'project', entityId: id, oldValue: info });
  return getProject(id);
}

export const deletedProjects = () => Object.entries(getState().deletedProjects).map(([id, v]) => ({ id, ...v }));

export { DEPENDENCY_CODES, PROJECT_TYPES, BANDS };
