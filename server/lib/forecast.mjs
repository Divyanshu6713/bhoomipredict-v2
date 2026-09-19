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
 * For the CURRENT stage both numbers come from the deployed model: the chance
 * of a >30-day slip is the project's delay probability, and the slip if late is
 * the model's conditional slip. The project stores the model's expected slip
 * E = mean(p·c) and probability P = mean(p) over the open parcels, so the slip
 * if late is exactly E / P (= Σp·c / Σp). The stage's historical late-slip
 * distribution only supplies the SHAPE of the draws, rescaled to that mean.
 * Later stages use their observed history, as before.
 *
 * A seeded Monte Carlo (2,000 runs) then draws "late or not" and the slip days
 * for every remaining stage and chains them on the planned durations, giving
 * P50 / P80 completion dates per stage and the probability the project misses
 * its sanctioned target. It is an estimate built on the model and on history,
 * not a statutory schedule.
 *
 * Definitions used in the output (one meaning each, everywhere):
 *   delayProbability  chance the stage ends more than 30 days late (the input, not a sample count)
 *   delayIfLateDays   mean slip in the outcomes that are late
 *   expectedSlipDays  delayProbability × delayIfLateDays — the model's own definition of expected slip
 *   p50 / p80         median / 80th-percentile finish date over the simulated schedules
 *   daysVsTarget      p50 − sanctioned target, in calendar days (negative = ahead)
 *
 * `headline` is the single source for the project's risk card: every number on
 * it is read from here, so they agree by construction.
 */
import { dayFromISO, isoFromDay } from '../domain/lifecycle.mjs';
import { DELAY_THRESHOLD_DAYS, riskScoreOf } from '../domain/risk.mjs';

export const FORECAST_SETTINGS = { runs: 2000, effectDecay: 0.8, effectClamp: 2.5, delayThresholdDays: DELAY_THRESHOLD_DAYS };

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
const meanOf = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

/**
 * Rescale a late-slip quantile shape so that, after flooring at `floor`, its
 * mean is exactly `target` days (bisection on the scale factor, which the
 * floored mean is monotone in).
 */
function fitLateShape(q, floor, target) {
  const shape = q && q.length ? q : [target];
  const meanAt = (s) => meanOf(shape.map((v) => Math.max(floor, v * s)));
  if (meanAt(0) >= target) return shape.map(() => floor);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40 && meanAt(hi) < target; i++) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (meanAt(mid) < target) lo = mid;
    else hi = mid;
  }
  return shape.map((v) => Math.max(floor, v * hi));
}

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

  // Slip-if-late draws per stage. Current stage: the model's conditional slip
  // (expected slip ÷ probability), floored at the days already overdue.
  const lateFloor = threshold + 1;
  const modelProb = p.delayProbability ?? null;
  const modelSlip = p.modelExpectedDelayDays ?? p.predictedDelayDays ?? null;
  const modelIfLate = modelProb > 0 && modelSlip > 0 ? Math.max(lateFloor, modelSlip / modelProb) : null;
  const lateDraws = stages.map((_, k) => {
    if (k < cur) return null;
    const hist = stats[k].lateSlip;
    if (k === cur && modelIfLate !== null) return fitLateShape(hist, lateFloor, modelIfLate).map((v) => Math.max(v, overdue));
    const base = hist && hist.length ? hist.map((v) => Math.max(lateFloor, v)) : [lateFloor];
    return k === cur ? base.map((v) => Math.max(v, overdue)) : base;
  });
  const ifLate = lateDraws.map((q) => (q ? meanOf(q) : null));

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
      let slip = isLate ? drawFrom(lateDraws[k], rng) : Math.min(threshold, drawFrom(stats[k].onTimeSlip, rng));
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
    return {
      stage: s.name,
      index: k,
      phase: k === cur ? 'current' : 'future',
      delayProbability: Number(probs[k].toFixed(3)),
      modelProbability: Number(probs[k].toFixed(3)),
      simulatedLateShare: Number((lateCount[k] / runs).toFixed(3)),
      basis: k === cur ? (alreadyLate ? 'deadline already passed by more than 30 days' : 'deployed model (current-stage risk and expected slip)') : 'stage delay rate adjusted by this project’s risk',
      historicalDelayRate: Number(stats[k].delayRate.toFixed(3)),
      delayIfLateDays: Math.round(ifLate[k]),
      expectedSlipDays: Math.round(probs[k] * ifLate[k]),
      plannedCompletion: isoFromDay(Math.round(plannedEnd)),
      p50Completion: isoFromDay(Math.round(pct(ends[k], 0.5))),
      p80Completion: isoFromDay(Math.round(pct(ends[k], 0.8))),
    };
  });

  const last = ends[n - 1];
  const p50Day = Math.round(pct(last, 0.5));
  const daysVsTarget = p50Day - target;
  const current = out[cur];
  return {
    method: 'Monte Carlo over remaining stages: current-stage model risk + observed stage delay rates and slip distributions, adjusted by the project effect',
    runs,
    projectEffectLogOdds: Number(effect.toFixed(3)),
    effectDecay: FORECAST_SETTINGS.effectDecay,
    stages: out,
    completion: {
      targetCompletionDate: p.targetCompletionDate,
      p50: isoFromDay(p50Day),
      p80: isoFromDay(Math.round(pct(last, 0.8))),
      probabilityMissTarget: Number((miss / runs).toFixed(3)),
      daysVsTarget,
      p50OverrunDays: Math.max(0, daysVsTarget),
    },
    headline: {
      stage: curStage.name,
      stageDeadline: curStage.expectedCompletion ?? curStage.plannedCompletion,
      overdueDays: overdue,
      stepAlreadyLate: alreadyLate,
      probability: modelProb ?? baseRate,
      riskScore: riskScoreOf(modelProb ?? baseRate),
      expectedDelayDays: current.expectedSlipDays,
      delayIfLateDays: current.delayIfLateDays,
      modelExpectedDelayDays: modelSlip,
      targetCompletionDate: p.targetCompletionDate,
      forecastCompletion: isoFromDay(p50Day),
      daysVsTarget,
    },
    caveat: 'An estimate combining the model with historical stage behaviour in the corpus; later stages carry more uncertainty than the current one.',
  };
}
