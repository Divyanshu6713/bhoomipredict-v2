/**
 * In-memory columnar store for the acquisition corpus.
 *
 * `cases.bin` is one typed-array block per column, so the whole 350,000-row
 * corpus costs a single sequential read at boot and every later query is a
 * scan over primitive arrays — no per-row objects are created except for the
 * page the caller actually asked for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskToCodes } from '../domain/registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
export const DATA = path.join(ROOT, 'data');

const TYPES = {
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
};

const MS_DAY = 86400000;
export const isoFromDay = (day) => new Date(day * MS_DAY).toISOString().slice(0, 10);
export const dayFromISO = (iso) =>
  Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_DAY);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function loadStore() {
  const t0 = Date.now();
  const storeDir = path.join(DATA, 'store');
  const apiDir = path.join(DATA, 'api');

  const meta = readJson(path.join(storeDir, 'cases.meta.json'));
  const buf = fs.readFileSync(path.join(storeDir, 'cases.bin'));

  const col = {};
  for (const c of meta.layout) {
    const T = TYPES[c.dtype];
    col[c.name] = new T(buf.buffer, buf.byteOffset + c.offset, c.bytes / T.BYTES_PER_ELEMENT);
  }
  const shapIdx = meta.shapAvailable
    ? new Int16Array(buf.buffer, buf.byteOffset + meta.shapIdxOffset, meta.rows * meta.shapK)
    : null;
  const shapVal = meta.shapAvailable
    ? new Float32Array(buf.buffer, buf.byteOffset + meta.shapValOffset, meta.rows * meta.shapK)
    : null;

  const summary = readJson(path.join(apiDir, 'summary.json'));
  const registry = readJson(path.join(apiDir, 'projects.json'));
  const geo = readJson(path.join(apiDir, 'geo.json'));
  const model = readJson(path.join(apiDir, 'model.json'));
  const surrogate = readJson(path.join(DATA, 'model', 'surrogate.json'));

  const projects = registry.projects;
  const projectById = new Map(projects.map((p, i) => [p.id, i]));

  /* Cases are written project by project, so each project owns one contiguous
   * row range. Range scans make the common filters (project, state, authority,
   * type, priority) cheap regardless of corpus size. */
  const ranges = new Int32Array(projects.length * 2);
  {
    let cursor = 0;
    for (let i = 0; i < projects.length; i++) {
      ranges[i * 2] = cursor;
      cursor += projects[i].totalParcels;
      ranges[i * 2 + 1] = cursor;
    }
    if (cursor !== meta.rows) {
      throw new Error(`project row ranges cover ${cursor} rows, store has ${meta.rows}`);
    }
  }

  const featureSpec = surrogate.features ?? [];
  const districtTable = meta.districtTable;
  const districtByKey = new Map(districtTable.map((d, i) => [d.key, i]));

  const stageIndex = new Map(meta.stages.map((s, i) => [s, i]));

  const store = {
    meta,
    col,
    shapIdx,
    shapVal,
    shapK: meta.shapK,
    rows: meta.rows,
    today: meta.today,
    todayDay: meta.todayDay,
    bandNames: meta.bandNames,
    riskBands: meta.riskBands,
    stages: meta.stages,
    stageIndex,
    dicts: meta.dicts,
    districtTable,
    districtByKey,
    projects,
    projectById,
    ranges,
    summary,
    geo,
    model,
    surrogate,
    featureSpec,
    loadMs: 0,
    bytes: buf.byteLength,
  };
  store.loadMs = Date.now() - t0;
  return store;
}

/* ------------------------------------------------------------ materialising */

const LETTER = (code) => (code ? String.fromCharCode(code) : '');

/** The band a probability falls into, using the deployed cut-offs. */
export function bandOf(store, p) {
  const b = store.riskBands;
  return p >= b.critical ? 3 : p >= b.high ? 2 : p >= b.medium ? 1 : 0;
}

export function caseAt(store, row, { withContributors = false } = {}) {
  const c = store.col;
  const pIdx = c.projectIdx[row];
  const project = store.projects[pIdx];
  const dk = store.districtTable[c.districtIdx[row]];
  const observed = c.observed[row] === 1;
  const due = c.dueDay[row];

  const out = {
    caseId: `LAC-${500000 + row}`,
    row,
    parcelId: `${project.stateCode}-${dk.district.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')}-${10000 + (row % 89999)}`,
    projectId: project.id,
    projectName: project.name,
    projectType: project.type,
    projectSubtype: project.subtype ?? null,
    framework: project.framework?.short ?? null,
    authority: project.authority,
    priority: project.priority,
    state: project.state,
    district: dk.district,
    tehsil: store.dicts.tehsil[c.tehsilIdx[row]],
    subDistrictLabel: project.subDistrictLabel ?? 'Tehsil',
    village: store.dicts.village[c.villageIdx[row]],
    surveyNumber: `${c.surveyNum[row]}/${c.surveyDen[row]}${LETTER(c.surveySuffix[row])}`,
    lat: Number(c.lat[row].toFixed(5)),
    lon: Number(c.lon[row].toFixed(5)),
    stage: store.stages[c.stageIdx[row]],
    stageIndex: c.stageIdx[row],
    landType: store.dicts.landType[c.landTypeIdx[row]],
    areaHa: Number(c.areaHa[row].toFixed(3)),
    ownership: store.dicts.ownership[c.ownershipIdx[row]],
    owners: c.owners[row] < 0 ? null : c.owners[row],
    affectedFamilies: c.families[row] < 0 ? null : c.families[row],
    compensationStatus: store.dicts.compStatus[c.compStatusIdx[row]],
    compensationBand: c.compBandIdx[row] === 255 ? null : store.dicts.compBand[c.compBandIdx[row]],
    compensationCompletionPct: c.compCompletion[row],
    compensationPendingDays: c.compPendingDays[row],
    legalDispute: c.legalDispute[row] === 1,
    legalCases: c.legalCases[row],
    disputeComplexity: store.dicts.dispute[c.disputeIdx[row]],
    rrRequired: c.rrRequired[row] === 1,
    rrProgressPct: c.rrProgress[row] < 0 ? null : c.rrProgress[row],
    rehabilitationCases: c.rehabCases[row],
    rrStatus: store.dicts.rrStatus[c.rrStatusIdx[row]],
    stakeholderResponsiveness: c.respIdx[row] === 255 ? null : store.dicts.responsiveness[c.respIdx[row]],
    departmentResponseDays: c.deptDays[row] < 0 ? null : c.deptDays[row],
    documentCompleteness: c.docComplete[row] < 0 ? null : c.docComplete[row],
    verificationStatus: store.dicts.verification[c.verifIdx[row]],
    approvalStatus: store.dicts.approval[c.approvalIdx[row]],
    inactivityDays: c.inactivity[row],
    possessionStatus: store.dicts.possession[c.possessionIdx[row]],
    historicalStageDelayRate: c.histStageRate[row] / 1000,
    districtDelayRate: dk ? dk.historicalDelayRate ?? dk.observedDelayRate : null,
    districtObservedDelayRate: dk ? dk.observedDelayRate : null,
    dependencyCount: c.depCount ? c.depCount[row] : null,
    pendingDependencies: c.pendingMask ? maskToCodes(c.pendingMask[row]) : [],
    approvalDelayDays: c.approvalDelay ? c.approvalDelay[row] : null,
    coordinationScore: project.coordinationScore ?? null,
    predictedDelayDays: c.predDelay ? Math.round(c.predDelay[row]) : null,
    authorityDelayRate: project.authorityDelayRate,
    stageStartDate: isoFromDay(c.stageStartDay[row]),
    expectedStageDays: c.expectedDays[row],
    elapsedStageDays: c.elapsedDays[row],
    milestoneDueDate: isoFromDay(due),
    milestone: project.stages[c.stageIdx[row]]?.milestone ?? null,
    assessmentDate: isoFromDay(c.assessDay[row]),
    daysToMilestone: due - store.todayDay,
    labelObserved: observed,
    outcome: observed ? (c.delayed[row] === 1 ? 'Delayed' : 'On time') : 'Pending',
    actualDelayDays: c.actualDelay[row] === -9999 ? null : c.actualDelay[row],
    truthBand: c.truthBand[row] < 0 ? null : store.bandNames[c.truthBand[row]],
    delayProbability: Number(c.score[row].toFixed(4)),
    // Displayed risk is clamped off the endpoints: a predicted probability is
    // never a certainty, and a score of 0 or 100 would read as one.
    riskScore: Math.min(99, Math.max(1, Math.round(c.score[row] * 100))),
    riskBand: store.bandNames[c.riskBand[row]],
    dataQuality: c.quality[row],
  };

  if (withContributors) out.contributors = contributorsFor(store, row);
  return out;
}

/** Raw per-feature SHAP contributions stored for this case. */
export function featureContributionsFor(store, row) {
  if (!store.shapIdx) return [];
  const k = store.shapK;
  const out = [];
  for (let i = 0; i < k; i++) {
    const f = store.featureSpec[store.shapIdx[row * k + i]];
    if (!f) continue;
    const v = store.shapVal[row * k + i];
    out.push({
      feature: f.name,
      label: f.label ?? f.name,
      group: f.group ?? 'Other',
      value: Number(v.toFixed(4)),
      direction: v >= 0 ? 'increases' : 'reduces',
    });
  }
  return out;
}

/**
 * Per-case SHAP contributions collapsed to display groups. Several one-hot
 * columns can belong to one operational factor (compensation status and
 * compensation completion, say), and a reviewer needs the factor, not the
 * encoding.
 */
export function contributorsFor(store, row, limit = 6) {
  const raw = featureContributionsFor(store, row);
  if (!raw.length) return [];
  const grouped = new Map();
  for (const r of raw) {
    const entry = grouped.get(r.group) ?? { group: r.group, value: 0, features: [] };
    entry.value += r.value;
    entry.features.push(r.label);
    grouped.set(r.group, entry);
  }
  const rows = Array.from(grouped.values()).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const mass = rows.reduce((s, o) => s + Math.abs(o.value), 0) || 1;
  return rows.slice(0, limit).map((o) => ({
    group: o.group,
    label: o.group,
    features: o.features,
    value: Number(o.value.toFixed(4)),
    direction: o.value >= 0 ? 'increases' : 'reduces',
    share: Number((Math.abs(o.value) / mass).toFixed(4)),
  }));
}

/** Compact record used by list and map endpoints. */
export function caseRowLite(store, row) {
  const c = store.col;
  const project = store.projects[c.projectIdx[row]];
  const dk = store.districtTable[c.districtIdx[row]];
  return {
    caseId: `LAC-${500000 + row}`,
    row,
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    district: dk.district,
    village: store.dicts.village[c.villageIdx[row]],
    stage: store.stages[c.stageIdx[row]],
    areaHa: Number(c.areaHa[row].toFixed(2)),
    ownership: store.dicts.ownership[c.ownershipIdx[row]],
    compensationStatus: store.dicts.compStatus[c.compStatusIdx[row]],
    compensationCompletionPct: c.compCompletion[row],
    legalDispute: c.legalDispute[row] === 1,
    legalCases: c.legalCases[row],
    inactivityDays: c.inactivity[row],
    milestoneDueDate: isoFromDay(c.dueDay[row]),
    daysToMilestone: c.dueDay[row] - store.todayDay,
    riskScore: Math.min(99, Math.max(1, Math.round(c.score[row] * 100))),
    riskBand: store.bandNames[c.riskBand[row]],
    dataQuality: c.quality[row],
    predictedDelayDays: c.predDelay ? Math.round(c.predDelay[row]) : null,
    pendingDependencyCount: c.pendingCount ? c.pendingCount[row] : null,
    labelObserved: c.observed[row] === 1,
    outcome: c.observed[row] === 1 ? (c.delayed[row] === 1 ? 'Delayed' : 'On time') : 'Pending',
  };
}
