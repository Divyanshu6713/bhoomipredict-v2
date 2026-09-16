/**
 * Stage-wise delay forecast.
 *
 * The classifier predicts the milestone a parcel is working towards now. A
 * project also needs the stages it has not reached, so this module combines
 * three things, each visible in the output:
 *
 *   1. the model's delay risk for the current stage (the project's headline);
 *   2. each stage's observed delay rate and slip-days distribution, measured
 *      from the labelled cases in the store (recomputed after every retrain,
 *      so newly recorded outcomes move it);
 *   3. a project effect — how much riskier this project is than a typical case
 *      at its current stage, in log-odds — carried into later stages with a
 *      decay, because friction in a district or authority tends to persist.
 *
 *   p(stage k late) = sigmoid( logit(stage delay rate k) + effect × decay^(k − current) )
 *
 * A seeded Monte Carlo (2,000 runs) then draws "late or not" and the slip days
 * for every remaining stage and chains them on the planned durations, giving
 * P50 / P80 completion dates per stage and the probability the project misses
 * its sanctioned target. It is an estimate built on the model and on history,
 * not a statutory schedule.
 */
import { dayFromISO, isoFromDay } from '../domain/lifecycle.mjs';

export const FORECAST_SETTINGS = { runs: 2000, effectDecay: 0.8, effectClamp: 2.5, delayThresholdDays: 30 };

const logit = (p) => {
  const q = Math.min(1 - 1e-4, Math.max(1e-4, p));
  return Math.log(q / (1 - q));
};
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hashOf = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const quantiles = (values, n = 51) => {
  if (!values.length) return null;
  const sorted = Float64Array.from(values).sort();
  return Array.from({ length: n }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor((i / (n - 1)) * (sorted.length - 1)))]);
};
const drawFrom = (q, rng) => (q ? q[Math.floor(rng() * q.length)] : 0);

let statsCache = null;

/** Observed delay behaviour per stage, from the labelled cases in the store. */
export function stageStatistics(store) {
  if (statsCache && statsCache.store === store) return statsCache.stats;
  const c = store.col;
  const k = store.stages.length;
  const late = Array.from({ length: k }, () => []);
  const onTime = Array.from({ length: k }, () => []);
  const observed = new Uint32Array(k);
  const delayed = new Uint32Array(k);
  for (let row = 0; row < store.rows; row++) {
    if (c.observed[row] !== 1) continue;
    const s = c.stageIdx[row];
    observed[s]++;
    const d = c.actualDelay[row];
    if (c.delayed[row] === 1) {
      delayed[s]++;
      if (d !== -9999) late[s].push(d);
    } else if (d !== -9999) {
      onTime[s].push(d);
    }
  }
  const stats = store.stages.map((stage, i) => ({
    stage,
    observedCases: observed[i],
    delayRate: observed[i] ? delayed[i] / observed[i] : 0.3,
    lateSlip: quantiles(late[i]),
    onTimeSlip: quantiles(onTime[i]),
    medianLateSlip: late[i].length ? quantiles(late[i], 3)[1] : null,
  }));
  statsCache = { store, stats };
  return stats;
}

/**
 * Forecast the remaining lifecycle of one effective project.
 * @param p effective project (stages with plannedDays / expectedCompletion, delayProbability)
 */
export function forecastProject(store, p) {
  const stats = stageStatistics(store);
  const today = store.todayDay;
  const cur = p.currentStageIndex;
  const stages = p.stages;
  const n = stages.length;
  const threshold = FORECAST_SETTINGS.delayThresholdDays;

  const baseRate = stats[cur]?.delayRate ?? 0.3;
  const effect = Math.max(-FORECAST_SETTINGS.effectClamp, Math.min(FORECAST_SETTINGS.effectClamp, logit(p.delayProbability ?? baseRate) - logit(baseRate)));
  const curStage = stages[cur];
  const deadline = dayFromISO(curStage.expectedCompletion ?? curStage.plannedCompletion);
  const overdue = Math.max(0, today - deadline);
  const alreadyLate = overdue > threshold;

  const probs = stages.map((_, k) => {
    if (k < cur) return null;
    if (k === cur) return alreadyLate ? 1 : p.delayProbability ?? baseRate;
    return sigmoid(logit(stats[k].delayRate) + effect * FORECAST_SETTINGS.effectDecay ** (k - cur));
  });

  const runs = FORECAST_SETTINGS.runs;
  const rng = mulberry32(hashOf(`${p.id}|${p.delayProbability}|${cur}|${store.modelVersion ?? ''}`));
  const ends = Array.from({ length: n }, () => new Float64Array(runs));
  const slips = Array.from({ length: n }, () => new Float64Array(runs));
  const lateCount = new Uint32Array(n);
  const target = dayFromISO(p.targetCompletionDate);
  let miss = 0;

  for (let r = 0; r < runs; r++) {
    let cursor = today;
    for (let k = cur; k < n; k++) {
      const isLate = k === cur && alreadyLate ? true : rng() < probs[k];
      let slip = isLate ? Math.max(threshold + 1, drawFrom(stats[k].lateSlip, rng)) : Math.min(threshold, drawFrom(stats[k].onTimeSlip, rng));
      let end;
      if (k === cur) {
        slip = Math.max(slip, overdue);
        end = Math.max(today + 1, deadline + slip);
      } else {
        end = cursor + stages[k].plannedDays + slip;
      }
      if (isLate) lateCount[k]++;
      ends[k][r] = end;
      slips[k][r] = slip;
      cursor = end;
    }
    if (cursor > target) miss++;
  }

  const pct = (arr, q) => {
    const sorted = Float64Array.from(arr).sort();
    return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  };
  let plannedCursor = Math.max(today, deadline);
  const out = stages.map((s, k) => {
    if (k < cur) {
      return { stage: s.name, index: k, phase: 'completed', actualCompletion: s.actualCompletion ?? null, delayProbability: null };
    }
    const plannedEnd = k === cur ? deadline : (plannedCursor += s.plannedDays);
    const mean = slips[k].reduce((a, b) => a + b, 0) / runs;
    return {
      stage: s.name,
      index: k,
      phase: k === cur ? 'current' : 'future',
      delayProbability: Number((lateCount[k] / runs).toFixed(3)),
      modelProbability: Number(probs[k].toFixed(3)),
      basis: k === cur ? (alreadyLate ? 'deadline already passed by more than 30 days' : 'deployed model (current-stage risk)') : 'stage delay rate adjusted by this project’s risk',
      historicalDelayRate: Number(stats[k].delayRate.toFixed(3)),
      expectedSlipDays: Math.round(mean),
      plannedCompletion: isoFromDay(Math.round(plannedEnd)),
      p50Completion: isoFromDay(Math.round(pct(ends[k], 0.5))),
      p80Completion: isoFromDay(Math.round(pct(ends[k], 0.8))),
    };
  });

  const last = ends[n - 1];
  return {
    method: 'Monte Carlo over remaining stages: current-stage model risk + observed stage delay rates and slip distributions, adjusted by the project effect',
    runs,
    projectEffectLogOdds: Number(effect.toFixed(3)),
    effectDecay: FORECAST_SETTINGS.effectDecay,
    stages: out,
    completion: {
      targetCompletionDate: p.targetCompletionDate,
      p50: isoFromDay(Math.round(pct(last, 0.5))),
      p80: isoFromDay(Math.round(pct(last, 0.8))),
      probabilityMissTarget: Number((miss / runs).toFixed(3)),
      p50OverrunDays: Math.max(0, Math.round(pct(last, 0.5) - target)),
    },
    caveat: 'An estimate combining the model with historical stage behaviour in the corpus; later stages carry more uncertainty than the current one.',
  };
}
