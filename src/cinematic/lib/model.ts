/**
 * Demonstration scoring model.
 *
 * A small logistic model with hand-set coefficients, scored in the browser on
 * synthetic cases. It exists to demonstrate the workflow — risk score,
 * per-feature contributions, what-if response — not to claim predictive
 * accuracy. Contributions are exact for a linear logit model:
 * φ_j = β_j · (x_j − E[x_j]) in log-odds, which is what SHAP returns for it.
 * They describe what drove the model's output, not what caused a delay.
 */
import type { Parcel, World } from './world';
import { TODAY, stageAt, lastActionBefore } from './world';
import { COMPLETE, STAGES } from './stages';
import { sigmoid, logit, clamp } from './rng';

export const MODEL_VERSION = 'demo-logit 0.4 (synthetic)';

export type FeatureKey =
  | 'comp'
  | 'owner'
  | 'legal'
  | 'idle'
  | 'rr'
  | 'notif'
  | 'objections'
  | 'response'
  | 'hist'
  | 'area'
  | 'families'
  | 'ptype';

export interface FeatureDef {
  key: FeatureKey;
  label: string; // neutral name
  input: string; // SIH input it represents
  beta: number;
}

export const FEATURES: FeatureDef[] = [
  { key: 'comp', label: 'Compensation pending', input: 'Compensation status', beta: 1.55 },
  { key: 'owner', label: 'Ownership records unresolved', input: 'Ownership / land records', beta: 2.3 },
  { key: 'legal', label: 'Active legal case', input: 'Legal disputes', beta: 1.0 },
  { key: 'idle', label: 'Time since last recorded action', input: 'Approval timelines', beta: 0.42 },
  { key: 'rr', label: 'R&R pending', input: 'R&R progress', beta: 0.85 },
  { key: 'notif', label: 'Notification / approval delay', input: 'Approval timelines', beta: 0.3 },
  { key: 'objections', label: 'Objections filed', input: 'Stakeholder responsiveness', beta: 0.22 },
  { key: 'response', label: 'Low stakeholder responsiveness', input: 'Stakeholder responsiveness', beta: 1.1 },
  { key: 'hist', label: 'Area historical performance', input: 'Historical performance', beta: 0.9 },
  { key: 'area', label: 'Land area', input: 'Land area', beta: 0.18 },
  { key: 'families', label: 'Affected families', input: 'Affected families', beta: 0.2 },
  { key: 'ptype', label: 'Project type (highway)', input: 'Project type', beta: 0.6 },
];

export const FEATURE_BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f])) as Record<FeatureKey, FeatureDef>;

/** What-if overrides a visitor can toggle. */
export interface Overrides {
  comp?: boolean; // resolved
  owner?: boolean; // resolved
  legal?: boolean; // closed
  idle?: boolean; // recent action recorded
}

export interface FeatureRow {
  key: FeatureKey;
  label: string;
  x: number;
  display: string;
  contribution: number; // log-odds
  imputed: boolean;
}

export interface Score {
  p: number;
  logit: number;
  base: number;
  other: number;
  rows: FeatureRow[];
  stage: number;
  nextMilestone: string | null;
  compStatus: string;
  idleDays: number;
}

const MISSING_MAP: Record<string, FeatureKey> = { rr: 'rr', response: 'response', notif: 'notif' };

export function compStatusAt(stage: number) {
  if (stage < 5) return { x: 0, label: 'Not due yet' };
  if (stage <= 6) return { x: 1, label: 'Pending — not initiated' };
  if (stage === 7) return { x: 0.5, label: 'Payment in process' };
  return { x: 0, label: 'Disbursed' };
}

export function rawFeatures(p: Parcel, day: number, o: Overrides = {}) {
  const a = p.acq!;
  const stage = stageAt(p, day);
  const comp = compStatusAt(stage);
  const ownerShare = day < a.entries[8] && a.owners ? a.unresolved / a.owners : 0;
  const legalActive = a.legal && day >= a.entries[3] && day < a.entries[9];
  const idleDays = Math.max(0, day - lastActionBefore(p, day));
  let rr = 0;
  if (a.families > 0) {
    const s = a.entries[9];
    const e = a.entries[10];
    const prog = day < s ? a.rrStart : day >= e ? 1 : a.rrStart + (1 - a.rrStart) * ((day - s) / Math.max(1, e - s));
    rr = (1 - prog) * Math.min(1, a.families / 3);
  }
  const x: Record<FeatureKey, number> = {
    comp: o.comp ? 0 : comp.x,
    owner: o.owner ? 0 : ownerShare,
    legal: o.legal ? 0 : legalActive ? 1 : 0,
    idle: Math.min(6, (o.idle ? 5 : idleDays) / 30),
    rr,
    notif: day >= a.entries[3] ? a.notifDelay / 30 : 0,
    objections: day >= a.entries[4] ? a.objections : 0,
    response: 1 - a.responsiveness,
    hist: a.histDelay,
    area: Math.log(1 + p.areaHa),
    families: a.families / 4,
    ptype: 1,
  };
  const display: Record<FeatureKey, string> = {
    comp: o.comp ? 'Resolved (what-if)' : comp.label,
    owner: o.owner
      ? 'Resolved (what-if)'
      : ownerShare > 0
        ? `${a.unresolved}/${a.owners} records unresolved`
        : `${a.owners}/${a.owners} records reconciled`,
    legal: o.legal ? 'Closed (what-if)' : legalActive ? 'Active case' : a.legal ? 'Case closed' : 'None recorded',
    idle: o.idle ? '5 days (what-if)' : `${Math.round(idleDays)} days`,
    rr: a.families ? `${Math.round((1 - (rr / Math.min(1, a.families / 3) || 0)) * 100)}% complete` : 'No families affected',
    notif: day >= a.entries[3] ? `${Math.round(a.notifDelay)} days` : 'Not notified yet',
    objections: day >= a.entries[4] ? `${a.objections} filed` : '—',
    response: a.responsiveness > 0.66 ? 'High' : a.responsiveness > 0.4 ? 'Moderate' : 'Low',
    hist: a.histDelay > 0.5 ? 'Slower than median' : 'Near median',
    area: `${p.areaHa.toFixed(2)} ha`,
    families: `${a.families}`,
    ptype: 'Highway (same for every parcel here)',
  };
  return { x, display, stage, idleDays, compLabel: o.comp ? 'Resolved (what-if)' : comp.label };
}

/** Background values (dataset means at the snapshot) and intercept. */
export const MODEL = {
  mu: {} as Record<FeatureKey, number>,
  b0: 0,
  ready: false,
};

export function score(p: Parcel, day = TODAY, o: Overrides = {}): Score | null {
  if (!p.acq) return null;
  const stage = stageAt(p, day);
  const f = rawFeatures(p, day, o);
  if (stage >= COMPLETE) {
    return {
      p: 0,
      logit: -Infinity,
      base: 0,
      other: 0,
      rows: [],
      stage,
      nextMilestone: null,
      compStatus: f.compLabel,
      idleDays: f.idleDays,
    };
  }
  const missing = new Set(p.acq.missing.map((m) => MISSING_MAP[m]));
  let base = MODEL.b0;
  let sum = 0;
  const rows: FeatureRow[] = FEATURES.map((d) => {
    const mu = MODEL.mu[d.key];
    base += d.beta * mu;
    const imputed = missing.has(d.key);
    const x = imputed ? mu : f.x[d.key];
    const c = d.beta * (x - mu);
    sum += c;
    return {
      key: d.key,
      label: d.label,
      x,
      display: imputed ? 'Missing — imputed' : f.display[d.key],
      contribution: c,
      imputed,
    };
  });
  const z = base + sum + p.acq.eps;
  let next: string | null = null;
  for (let k = stage + 1; k <= 12; k++) {
    if (k === 12) {
      next = 'Handover complete';
      break;
    }
    if (p.acq.entries[k + 1] > p.acq.entries[k]) {
      next = STAGES[k];
      break;
    }
  }
  return {
    p: sigmoid(z),
    logit: z,
    base,
    other: p.acq.eps,
    rows: rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    stage,
    nextMilestone: next,
    compStatus: f.compLabel,
    idleDays: f.idleDays,
  };
}

export const BANDS = { medium: 0.3, high: 0.55 };
export type Band = 'low' | 'medium' | 'high';
export const bandOf = (p: number): Band => (p >= BANDS.high ? 'high' : p >= BANDS.medium ? 'medium' : 'low');

/** Fit the background and intercept to the synthetic snapshot, then pin the scripted demo cases. */
export function calibrate(world: World) {
  const active = world.row.filter((p) => stageAt(p, TODAY) < COMPLETE);
  const keys = FEATURES.map((f) => f.key);
  const mu = Object.fromEntries(keys.map((k) => [k, 0])) as Record<FeatureKey, number>;
  for (const p of active) {
    const { x } = rawFeatures(p, TODAY);
    for (const k of keys) mu[k] += x[k] / active.length;
  }
  MODEL.mu = mu;
  // Intercept chosen so ~15% of open cases fall in the high band at the snapshot.
  const s = active
    .map((p) => {
      const { x } = rawFeatures(p, TODAY);
      return FEATURES.reduce((acc, f) => acc + f.beta * (x[f.key] - mu[f.key]), 0) + p.acq!.eps;
    })
    .sort((a, b) => a - b);
  const q85 = s[Math.floor(s.length * 0.85)];
  const baseNoB0 = FEATURES.reduce((acc, f) => acc + f.beta * mu[f.key], 0);
  MODEL.b0 = logit(BANDS.high) - q85 - baseNoB0;
  MODEL.ready = true;

  // Scripted cases land exactly on the numbers used throughout the story.
  for (const [id, target] of [
    [world.heroId, 0.82],
    [world.hero2Id, 0.82],
  ] as const) {
    const p = world.byId.get(id)!;
    p.acq!.eps = 0;
    const sc = score(p, TODAY)!;
    p.acq!.eps = clamp(logit(target) - sc.logit, -3, 3);
  }
}
