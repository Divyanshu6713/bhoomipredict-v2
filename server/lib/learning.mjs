/**
 * Continuous learning.
 *
 *   new outcome  (officer records a milestone completion · CSV / API ingestion ·
 *                 simulation release of withheld synthetic outcomes)
 *     → validated against the case (open, not yet recorded, sensible dates)
 *     → appended to data/learning/outcomes.jsonl with the prediction the model
 *       made for that case at the time (prospective evaluation)
 *     → live monitoring: how the deployed model is doing on outcomes it never saw
 *     → drift check: recent population vs the training window (PSI)
 *     → retraining trigger (manual, or automatic once enough outcomes arrive)
 *     → ml/train.py: challenger vs champion on the same latest window
 *     → promoted only if not worse; otherwise rejected and the champion stays
 *     → registry (data/model/registry.json) keeps every version; rollback restores one
 *
 * Nothing here pretends outcomes come from the field: every record carries its
 * source, and simulation releases are labelled as such everywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA, isoFromDay, dayFromISO } from './store.mjs';
import { getState, saveState, recordAudit } from './persistence.mjs';
import { ServiceError } from './projects.mjs';

/** LANDPULSE_LEARNING_DIR isolates test runs from the demo's recorded outcomes. */
export const LEARNING_DIR = process.env.LANDPULSE_LEARNING_DIR ? path.resolve(process.env.LANDPULSE_LEARNING_DIR) : path.join(DATA, 'learning');
export const OUTCOMES_FILE = path.join(LEARNING_DIR, 'outcomes.jsonl');
const FUTURE_FILE = path.join(DATA, 'simulation', 'future_outcomes.csv');
const THRESHOLD_DAYS = 30;

let outcomes = null; // Map caseId → record (latest wins)

function loadOutcomes() {
  if (outcomes) return outcomes;
  outcomes = new Map();
  if (fs.existsSync(OUTCOMES_FILE)) {
    for (const line of fs.readFileSync(OUTCOMES_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.caseId) outcomes.set(r.caseId, r);
      } catch {
        /* torn final line */
      }
    }
  }
  return outcomes;
}

export const outcomeFor = (caseId) => loadOutcomes().get(caseId) ?? null;

function appendOutcomes(records) {
  if (!records.length) return;
  fs.mkdirSync(LEARNING_DIR, { recursive: true });
  fs.appendFileSync(OUTCOMES_FILE, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const map = loadOutcomes();
  for (const r of records) map.set(r.caseId, r);
}

const rowOf = (store, caseId) => {
  const m = /^LAC-(\d+)$/i.exec(String(caseId ?? '').trim());
  const row = m ? Number(m[1]) - 500000 : -1;
  return row >= 0 && row < store.rows ? row : -1;
};

/** The date outcomes may be recorded up to: the snapshot, or the advanced simulation clock. */
export const effectiveToday = (store) => getState().learning.simulationDate ?? store.today;

function buildOutcome(store, row, { delayed, actualDelayDays, completedOn = null, source, user, note = null }) {
  const c = store.col;
  return {
    caseId: `LAC-${500000 + row}`,
    projectId: store.projects[c.projectIdx[row]].id,
    stage: store.stages[c.stageIdx[row]],
    milestoneDueDate: isoFromDay(c.dueDay[row]),
    completedOn,
    actualDelayDays: actualDelayDays === null || actualDelayDays === undefined ? null : Math.round(actualDelayDays),
    delayed: Boolean(delayed),
    source,
    note,
    recordedAt: new Date().toISOString(),
    recordedBy: user ? { id: user.id, name: user.name, role: user.role } : { id: 'system', name: 'System' },
    // What the deployed model predicted for this case before the outcome was known.
    predictedProbability: Number(c.score[row].toFixed(4)),
    predictedBand: store.bandNames[c.riskBand[row]],
    modelVersion: store.modelVersion,
  };
}

/**
 * Validate one outcome against the store. Returns { record } or { error }.
 * input: { caseId, completedOn } or { caseId, delayed, actualDelayDays }
 */
function validateOutcome(store, input, { source, user, today }) {
  const row = rowOf(store, input.caseId);
  if (row < 0) return { error: `Unknown case "${input.caseId ?? ''}"` };
  const c = store.col;
  const caseId = `LAC-${500000 + row}`;
  if (c.observed[row] === 1) return { error: `${caseId} already has a recorded outcome in the corpus` };
  if (loadOutcomes().has(caseId)) return { error: `${caseId} already has a newly recorded outcome` };
  const due = c.dueDay[row];
  const todayDay = dayFromISO(today);
  if (input.completedOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.completedOn)) return { error: `${caseId}: completedOn must be YYYY-MM-DD` };
    const done = dayFromISO(input.completedOn);
    if (done < c.stageStartDay[row]) return { error: `${caseId}: completion is before the stage started (${isoFromDay(c.stageStartDay[row])})` };
    if (done > todayDay) return { error: `${caseId}: completion date is after ${today}` };
    const slip = done - due;
    return { record: buildOutcome(store, row, { delayed: slip > THRESHOLD_DAYS, actualDelayDays: slip, completedOn: input.completedOn, source, user, note: input.note ?? null }) };
  }
  if (input.stillPendingOn) {
    // A milestone still not achieved more than 30 days after its due date is a known delay.
    const on = dayFromISO(input.stillPendingOn);
    if (on > todayDay) return { error: `${caseId}: stillPendingOn is after ${today}` };
    if (on - due <= THRESHOLD_DAYS) return { error: `${caseId}: a pending milestone is a known delay only once it is more than ${THRESHOLD_DAYS} days past its due date (${isoFromDay(due)})` };
    return { record: buildOutcome(store, row, { delayed: true, actualDelayDays: null, source, user, note: input.note ?? `Still pending on ${input.stillPendingOn}` }) };
  }
  if (input.delayed !== undefined) {
    const knowable = due + THRESHOLD_DAYS + 1;
    if (knowable > todayDay && source !== 'simulation') return { error: `${caseId}: the outcome is not knowable before ${isoFromDay(knowable)}` };
    const d = input.actualDelayDays === '' || input.actualDelayDays === undefined ? null : Number(input.actualDelayDays);
    const delayed = input.delayed === true || input.delayed === 1 || input.delayed === '1' || input.delayed === 'true';
    if (d !== null && Number.isFinite(d) && delayed !== d > THRESHOLD_DAYS) return { error: `${caseId}: delayed=${delayed} contradicts actualDelayDays=${d}` };
    return { record: buildOutcome(store, row, { delayed, actualDelayDays: Number.isFinite(d) ? d : null, source, user }) };
  }
  return { error: `${caseId}: provide completedOn, stillPendingOn, or delayed (+ actualDelayDays)` };
}

export function recordOutcome(store, user, input, source = 'officer') {
  const today = effectiveToday(store);
  const { record, error } = validateOutcome(store, input, { source, user, today });
  if (error) throw new ServiceError(error, 422);
  appendOutcomes([record]);
  recordAudit({ user, action: 'learning.outcome_recorded', entity: 'case', entityId: record.caseId, newValue: { delayed: record.delayed, actualDelayDays: record.actualDelayDays, source, predictedProbability: record.predictedProbability } });
  return record;
}

/** Bulk ingestion (CSV text or JSON rows). Validate-all first; commit only when asked. */
export function ingestOutcomes(store, user, rows, { commit, source }) {
  const today = effectiveToday(store);
  const accepted = [];
  const errors = [];
  const seen = new Set();
  rows.slice(0, 20000).forEach((r, i) => {
    const input = {
      caseId: r.caseId ?? r.case_id,
      completedOn: r.completedOn ?? r.completed_on ?? undefined,
      stillPendingOn: r.stillPendingOn ?? r.still_pending_on ?? undefined,
      delayed: r.delayed ?? r.next_milestone_delayed,
      actualDelayDays: r.actualDelayDays ?? r.actual_stage_delay_days,
    };
    if (input.completedOn === '') input.completedOn = undefined;
    if (input.stillPendingOn === '') input.stillPendingOn = undefined;
    if (input.delayed === '') input.delayed = undefined;
    if (seen.has(String(input.caseId).toUpperCase())) {
      errors.push({ row: i + 1, error: `${input.caseId}: duplicated in this upload` });
      return;
    }
    seen.add(String(input.caseId).toUpperCase());
    const { record, error } = validateOutcome(store, input, { source, user, today });
    if (error) errors.push({ row: i + 1, error });
    else accepted.push(record);
  });
  const summary = { rows: rows.length, valid: accepted.length, invalid: errors.length, delayed: accepted.filter((r) => r.delayed).length, committed: false };
  if (commit && accepted.length && !errors.length) {
    appendOutcomes(accepted);
    summary.committed = true;
    recordAudit({ user, action: 'learning.outcomes_ingested', entity: 'learning', entityId: new Date().toISOString(), newValue: { ...summary, source } });
  }
  return { summary, errors: errors.slice(0, 200) };
}

export function parseOutcomeCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

/* ------------------------------------------------------------- simulation */

/**
 * Advance the simulation clock and release the withheld synthetic outcomes
 * that would have become knowable by then — the stand-in for new data arriving
 * from the field. The corpus snapshot date itself does not move.
 */
export function advanceSimulation(store, user, days) {
  const n = Math.round(Number(days));
  if (!(n >= 1 && n <= 365)) throw new ServiceError('days must be between 1 and 365', 422);
  if (!fs.existsSync(FUTURE_FILE)) throw new ServiceError('No withheld outcomes file (data/simulation/future_outcomes.csv). Re-run npm run data:generate.', 409);
  const state = getState();
  const from = effectiveToday(store);
  const to = isoFromDay(dayFromISO(from) + n);
  const toDay = dayFromISO(to);
  const lines = fs.readFileSync(FUTURE_FILE, 'utf8').split('\n');
  const released = [];
  const existing = loadOutcomes();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const [caseId, , knowable, delayed, days2] = line.split(',');
    if (dayFromISO(knowable) > toDay || existing.has(caseId)) continue;
    const row = rowOf(store, caseId);
    if (row < 0 || store.col.observed[row] === 1) continue;
    released.push(buildOutcome(store, row, { delayed: delayed === '1', actualDelayDays: Number(days2), source: 'simulation', user, note: `Released by advancing the simulation clock to ${to}` }));
  }
  appendOutcomes(released);
  state.learning.simulationBase ??= store.today;
  state.learning.simulationDate = to;
  saveState();
  recordAudit({ user, action: 'learning.simulation_advanced', entity: 'learning', entityId: to, oldValue: { simulationDate: from }, newValue: { simulationDate: to, released: released.length } });
  return { from, to, released: released.length, delayed: released.filter((r) => r.delayed).length };
}

/* ------------------------------------------------------------- monitoring */

function auc(scores, labels) {
  const pos = labels.reduce((a, b) => a + b, 0);
  const neg = labels.length - pos;
  if (!pos || !neg) return null;
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
  let rankSum = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (labels[idx[k]]) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** How the deployed model did on outcomes it had not seen when it predicted them. */
export function liveMonitoring(store) {
  const champion = store.modelVersion;
  const all = Array.from(loadOutcomes().values());
  const threshold = store.model?.metrics?.operatingThreshold ?? store.ensemble?.operatingThreshold ?? 0.35;
  const summarise = (rows) => {
    if (!rows.length) return { outcomes: 0 };
    const y = rows.map((r) => (r.delayed ? 1 : 0));
    const p = rows.map((r) => r.predictedProbability);
    let tp = 0, fp = 0, fn = 0, brier = 0;
    rows.forEach((r, i) => {
      const flag = p[i] >= threshold;
      if (flag && y[i]) tp++;
      else if (flag) fp++;
      else if (y[i]) fn++;
      brier += (p[i] - y[i]) ** 2;
    });
    const bins = Array.from({ length: 5 }, (_, b) => {
      const inBin = rows.filter((r) => Math.min(4, Math.floor(r.predictedProbability * 5)) === b);
      return { bin: `${b * 20}–${(b + 1) * 20}%`, count: inBin.length, predicted: inBin.length ? Number((inBin.reduce((a, r) => a + r.predictedProbability, 0) / inBin.length).toFixed(3)) : null, observed: inBin.length ? Number((inBin.filter((r) => r.delayed).length / inBin.length).toFixed(3)) : null };
    });
    const a = auc(p, y);
    return {
      outcomes: rows.length,
      delayedRate: Number((y.reduce((s, v) => s + v, 0) / rows.length).toFixed(4)),
      meanPredicted: Number((p.reduce((s, v) => s + v, 0) / rows.length).toFixed(4)),
      rocAuc: a === null ? null : Number(a.toFixed(4)),
      precision: tp + fp ? Number((tp / (tp + fp)).toFixed(4)) : null,
      recall: tp + fn ? Number((tp / (tp + fn)).toFixed(4)) : null,
      brier: Number((brier / rows.length).toFixed(4)),
      calibration: bins,
    };
  };
  const bySource = {};
  for (const r of all) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  const test = store.model?.metrics?.models?.gradient_boosting?.test ?? null;
  const since = all.filter((r) => r.modelVersion === champion);
  const live = summarise(all);
  const drop = test && live.rocAuc !== null ? Number((test.rocAuc - live.rocAuc).toFixed(4)) : null;
  return {
    operatingThreshold: threshold,
    championVersion: champion,
    all: live,
    predictedByChampion: summarise(since),
    bySource,
    offlineTest: test ? { rocAuc: test.rocAuc, prAuc: test.prAuc, brier: test.brier } : null,
    rocAucDropVsTest: drop,
    appliedToChampion: store.meta.outcomesApplied ?? 0,
    awaitingRetrain: all.length - (store.meta.outcomesApplied ?? 0),
    note: 'Each outcome is scored with the probability the deployed model gave that case before the outcome was recorded, so these figures are prospective.',
  };
}

/* ------------------------------------------------------------------- drift */

const DRIFT_FEATURES = [
  ['inactivity', 'Days since last recorded action'],
  ['docComplete', 'Document completeness %'],
  ['compCompletion', 'Compensation completion %'],
  ['legalCases', 'Open legal cases'],
  ['approvalDelay', 'Approval delay (days)'],
  ['pendingCount', 'Pending department actions'],
  ['deptDays', 'Departmental response time'],
  ['families', 'Affected families'],
  ['areaHa', 'Parcel area (ha)'],
  ['score', 'Predicted delay probability'],
];

/**
 * Population Stability Index between the training window and the most recent
 * assessments. PSI < 0.10 stable · 0.10–0.25 watch · > 0.25 significant shift.
 */
export function driftReport(store, { recentDays = 120 } = {}) {
  const c = store.col;
  const trainEnd = store.model?.metrics?.split?.train?.to ? dayFromISO(store.model.metrics.split.train.to) : store.todayDay - 365;
  const recentFrom = dayFromISO(effectiveToday(store)) - recentDays;
  const ref = [];
  const cur = [];
  for (let row = 0; row < store.rows; row++) {
    const d = c.assessDay[row];
    if (d <= trainEnd && c.observed[row] === 1) ref.push(row);
    else if (d >= recentFrom) cur.push(row);
  }
  const stageShift = store.stages.map((s, i) => {
    const r = ref.filter((row) => c.stageIdx[row] === i).length / Math.max(1, ref.length);
    const q = cur.filter((row) => c.stageIdx[row] === i).length / Math.max(1, cur.length);
    return { stage: s, reference: Number(r.toFixed(4)), recent: Number(q.toFixed(4)) };
  });
  const psiCat = stageShift.reduce((a, s) => {
    const r = Math.max(1e-4, s.reference);
    const q = Math.max(1e-4, s.recent);
    return a + (q - r) * Math.log(q / r);
  }, 0);
  const features = DRIFT_FEATURES.filter(([key]) => c[key]).map(([key, label]) => {
    const vals = (rows) => rows.map((row) => c[key][row]).filter((v) => v >= 0 && Number.isFinite(v));
    const rv = Float64Array.from(vals(ref)).sort();
    const cv = vals(cur);
    if (!rv.length || !cv.length) return { feature: key, label, psi: null };
    const edges = Array.from({ length: 9 }, (_, i) => rv[Math.floor(((i + 1) / 10) * (rv.length - 1))]);
    const bucket = (v) => {
      let b = 0;
      while (b < 9 && v > edges[b]) b++;
      return b;
    };
    const rc = new Array(10).fill(0);
    const cc = new Array(10).fill(0);
    for (const v of rv) rc[bucket(v)]++;
    for (const v of cv) cc[bucket(v)]++;
    let psi = 0;
    for (let b = 0; b < 10; b++) {
      const r = Math.max(1e-4, rc[b] / rv.length);
      const q = Math.max(1e-4, cc[b] / cv.length);
      psi += (q - r) * Math.log(q / r);
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    return { feature: key, label, psi: Number(psi.toFixed(4)), status: psi > 0.25 ? 'significant' : psi > 0.1 ? 'watch' : 'stable', referenceMean: Number(mean(Array.from(rv)).toFixed(2)), recentMean: Number(mean(cv).toFixed(2)) };
  });
  const worst = features.reduce((a, f) => Math.max(a, f.psi ?? 0), 0);
  return {
    reference: { label: `labelled cases assessed up to ${isoFromDay(trainEnd)} (training window)`, rows: ref.length },
    recent: { label: `cases assessed in the last ${recentDays} days to ${effectiveToday(store)}`, rows: cur.length },
    features,
    stageMix: { psi: Number(psiCat.toFixed(4)), stages: stageShift },
    overall: worst > 0.25 ? 'significant' : worst > 0.1 ? 'watch' : 'stable',
    note: 'Recent assessments include open cases, which sit earlier in their stage than resolved ones; a moderate shift in schedule-related signals is expected from that framing alone.',
  };
}

/* ---------------------------------------------------------------- registry */

export function modelRegistry(store) {
  const file = path.join(DATA, 'model', 'registry.json');
  const reg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { champion: null, versions: [] };
  return {
    champion: reg.champion,
    servingVersion: store.modelVersion,
    versions: [...reg.versions].reverse(),
    gate: store.model?.metrics?.gate ?? null,
  };
}

export function learningStatus(store) {
  const state = getState();
  const live = liveMonitoring(store);
  const reasons = [];
  if (live.awaitingRetrain >= state.learning.autoRetrainMinOutcomes) reasons.push(`${live.awaitingRetrain.toLocaleString('en-IN')} new outcomes are not yet in the model`);
  if (live.rocAucDropVsTest !== null && live.all.outcomes >= 500 && live.rocAucDropVsTest > 0.05) reasons.push(`live ROC-AUC is ${live.rocAucDropVsTest} below the offline test`);
  return {
    snapshotDate: store.today,
    simulationDate: state.learning.simulationDate,
    effectiveDate: effectiveToday(store),
    withheldOutcomesAvailable: fs.existsSync(FUTURE_FILE),
    autoRetrain: state.learning.autoRetrain,
    autoRetrainMinOutcomes: state.learning.autoRetrainMinOutcomes,
    lastAutoRetrainAt: state.learning.lastAutoRetrainAt,
    retrainRecommended: reasons.length > 0,
    retrainReasons: reasons,
    live,
  };
}

export function setLearningSettings(user, patch) {
  const state = getState();
  const before = { ...state.learning };
  if (patch.autoRetrain !== undefined) state.learning.autoRetrain = Boolean(patch.autoRetrain);
  if (patch.autoRetrainMinOutcomes !== undefined) {
    const n = Number(patch.autoRetrainMinOutcomes);
    if (!(n >= 100 && n <= 100000)) throw new ServiceError('autoRetrainMinOutcomes must be between 100 and 100000', 422);
    state.learning.autoRetrainMinOutcomes = Math.round(n);
  }
  saveState();
  recordAudit({ user, action: 'learning.settings_changed', entity: 'learning', entityId: 'settings', oldValue: { autoRetrain: before.autoRetrain, autoRetrainMinOutcomes: before.autoRetrainMinOutcomes }, newValue: { autoRetrain: state.learning.autoRetrain, autoRetrainMinOutcomes: state.learning.autoRetrainMinOutcomes } });
  return state.learning;
}

export const resetOutcomeCache = () => {
  outcomes = null;
};
