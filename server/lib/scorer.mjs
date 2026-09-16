/**
 * Interactive scorer.
 *
 * The batch pipeline scores the whole corpus with the gradient-boosted ensemble
 * and stores TreeSHAP contributions per case. For an ad-hoc scenario there is no
 * stored row, so scoring runs through the linear surrogate distilled from that
 * ensemble (data/model/surrogate.json). Two properties make this the right tool
 * for what-if work:
 *
 *   - its Shapley values are closed-form: phi_i = coef_i * (x_i - mean_i) / sd_i,
 *     so contributions always sum exactly to the score it reports;
 *   - it is cheap enough to re-score on every slider move.
 *
 * Its agreement with the ensemble is measured, not assumed — see
 * `surrogate.fidelity` in the model card and the caveat shown in the UI.
 *
 * The transforms below mirror `build_matrix` in ml/train.py; the two must be
 * changed together.
 */

import { scoreWithEnsemble } from './ensemble.mjs';

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** Missing-value handling that matches ml/train.py's feature builder. */
const NAN_FILL = {
  comp_pending_frac: 0, // compensation completion is treated as 0% when absent
  rr_pending_frac: 50, // half-complete is the neutral assumption for R&R
};

function featureValue(spec, raw) {
  const v = raw[spec.source];
  switch (spec.op) {
    case 'identity':
      return v === undefined || v === null || v === '' ? NaN : Number(v);
    case 'log1p': {
      const n = v === undefined || v === null || v === '' ? NaN : Number(v);
      return Number.isNaN(n) ? NaN : Math.log1p(Math.max(0, n));
    }
    case 'ratio': {
      const a = Number(v);
      const b = Number(raw[spec.source2]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
      return a / Math.max(1, b);
    }
    case 'pct_gap': {
      const fill = NAN_FILL[spec.name];
      let n = v === undefined || v === null || v === '' ? NaN : Number(v);
      if (Number.isNaN(n) && fill !== undefined) n = fill;
      return Number.isNaN(n) ? NaN : (100 - n) / 100;
    }
    case 'rr_pending': {
      const required = Number(raw[spec.source2]);
      if (!required) return 0;
      let n = v === undefined || v === null || v === '' ? NaN : Number(v);
      if (Number.isNaN(n)) n = NAN_FILL.rr_pending_frac;
      return (100 - n) / 100;
    }
    case 'onehot':
      return String(raw[spec.source] ?? '(missing)') === spec.category ? 1 : 0;
    default:
      return NaN;
  }
}

/**
 * Score one record.
 * @param surrogate parsed data/model/surrogate.json
 * @param raw       record keyed by corpus column name
 */
export function scoreRecord(surrogate, raw) {
  const features = surrogate.features;
  let z = surrogate.intercept;
  const delay = surrogate.delay ?? null;
  let slip = delay ? delay.intercept : 0;
  const groups = new Map();
  const detail = [];

  for (let j = 0; j < features.length; j++) {
    const spec = features[j];
    let x = featureValue(spec, raw);
    let imputed = false;
    if (!Number.isFinite(x)) {
      x = spec.median;
      imputed = true;
    }
    const standardised = (x - spec.mean) / (spec.std || 1);
    const contribution = spec.coef * standardised;
    z += contribution;
    if (delay) slip += (delay.coef[j] ?? 0) * standardised;
    if (Math.abs(contribution) < 1e-9) continue;
    const group = spec.group ?? 'Other';
    groups.set(group, (groups.get(group) ?? 0) + contribution);
    detail.push({
      feature: spec.name,
      label: spec.label ?? spec.name,
      group,
      value: Number(x.toFixed(4)),
      contribution: Number(contribution.toFixed(4)),
      imputed,
    });
  }

  const probability = sigmoid(z);
  // Expected slip = P(delayed) x conditional slip days, mirroring ml/train.py.
  const conditionalSlip = delay ? Math.min(delay.cap ?? 400, Math.max(delay.floor ?? 31, slip)) : null;
  const bands = surrogate.riskBands;
  const band = probability >= bands.critical ? 'Critical' : probability >= bands.high ? 'High' : probability >= bands.medium ? 'Medium' : 'Low';

  const positive = Array.from(groups.entries()).filter(([, v]) => v > 0);
  const negative = Array.from(groups.entries()).filter(([, v]) => v < 0);
  const positiveMass = positive.reduce((s, [, v]) => s + v, 0) || 1;

  return {
    probability: Number(probability.toFixed(4)),
    // Clamped off the endpoints for the same reason as stored scores: a
    // predicted probability is never a certainty, and 0% or 100% reads as one.
    riskScore: Math.min(99, Math.max(1, Math.round(probability * 100))),
    riskBand: band,
    logOdds: Number(z.toFixed(4)),
    predictedDelayDays: conditionalSlip === null ? null : Math.round(probability * conditionalSlip),
    conditionalDelayDays: conditionalSlip === null ? null : Math.round(conditionalSlip),
    increasing: positive
      .sort((a, b) => b[1] - a[1])
      .map(([group, value]) => ({
        group,
        value: Number(value.toFixed(4)),
        share: Number((value / positiveMass).toFixed(4)),
      })),
    reducing: negative
      .sort((a, b) => a[1] - b[1])
      .map(([group, value]) => ({ group, value: Number(value.toFixed(4)) })),
    features: detail.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 18),
    imputedFields: detail.filter((d) => d.imputed).length,
    scorer: 'linear surrogate distilled from the deployed ensemble',
    fidelity: surrogate.fidelity,
  };
}

/**
 * Score a record with the deployed model. The exported ensemble is the default;
 * the linear reference is used only when no ensemble has been published (a
 * corpus built by an older pipeline), and the result says which one scored it.
 * @param opts.level 'case' (default) or 'project' — which band cut-offs apply
 */
export function scoreModel(store, raw, { explain = true, level = 'case' } = {}) {
  const bands = level === 'project' ? store.projectRiskBands : store.riskBands;
  if (store.ensemble) return scoreWithEnsemble(store.ensemble, raw, { explain, bands });
  const r = scoreRecord(store.surrogate, raw);
  const p = r.probability;
  return { ...r, riskBand: p >= bands.critical ? 'Critical' : p >= bands.high ? 'High' : p >= bands.medium ? 'Medium' : 'Low', modelVersion: null };
}

/**
 * Input contract for the interactive form: every field the surrogate reads,
 * with its options and a sensible default, derived from the model artefacts so
 * the form can never drift from the model.
 */
export function predictionSpec(store) {
  const surrogate = store.surrogate;
  const byName = new Map(surrogate.features.map((f) => [f.name, f]));
  const numericFields = [];
  const seen = new Set();

  const RANGES = {
    land_area_ha: [0.05, 15, 0.05, 'ha'],
    expected_stage_days: [14, 260, 1, 'days'],
    elapsed_stage_days: [1, 400, 1, 'days'],
    affected_families: [0, 20, 1, ''],
    number_of_owners: [1, 30, 1, ''],
    compensation_pending_days: [0, 520, 5, 'days'],
    compensation_completion_percentage: [0, 100, 1, '%'],
    legal_case_count: [0, 12, 1, ''],
    rr_progress_percentage: [0, 100, 1, '%'],
    rehabilitation_cases: [0, 20, 1, ''],
    department_response_days: [3, 120, 1, 'days'],
    document_completeness: [10, 100, 1, '%'],
    inactivity_days: [0, 400, 5, 'days'],
    historical_stage_delay_rate: [0.02, 0.88, 0.01, ''],
    authority_dependency_count: [4, 20, 1, ''],
    pending_dependency_actions: [0, 8, 1, ''],
    approval_delay_days: [0, 365, 5, 'days'],
    department_coordination_score: [20, 98, 1, '/100'],
    district_historical_delay_rate: [0.13, 0.61, 0.01, ''],
    authority_historical_delay_rate: [0.17, 0.53, 0.01, ''],
    project_land_requirement_ha: [50, 6000, 10, 'ha'],
  };

  for (const [name, [min, max, step, unit]] of Object.entries(RANGES)) {
    const spec = byName.get(name);
    if (!spec || seen.has(name)) continue;
    seen.add(name);
    numericFields.push({
      field: name,
      label: spec.label ?? name,
      group: spec.group ?? 'Other',
      min,
      max,
      step,
      unit,
      default: Number(Number(spec.median).toFixed(step < 1 ? 2 : 0)),
    });
  }

  const categorical = [];
  const catSources = new Map();
  for (const f of surrogate.features) {
    if (f.op !== 'onehot') continue;
    if (!catSources.has(f.source)) catSources.set(f.source, []);
    catSources.get(f.source).push(f.category);
  }
  for (const [source, values] of catSources) {
    const all = surrogate.categories?.[source] ?? values;
    categorical.push({
      field: source,
      label: source.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase()),
      options: all.filter((v) => v !== '(missing)'),
      default: all[0] === '(missing)' ? all[1] : all[0],
    });
  }

  const binary = ['legal_dispute', 'rr_required']
    .filter((n) => byName.has(n))
    .map((n) => ({ field: n, label: n.replace(/_/g, ' '), default: 0 }));

  return {
    numeric: numericFields,
    categorical,
    binary,
    hidden: ['latitude', 'longitude'],
    riskBands: surrogate.riskBands,
    fidelity: surrogate.fidelity,
    modelVersion: store.ensemble?.version ?? null,
    note: store.ensemble
      ? 'Scenarios are scored by the deployed gradient-boosted ensemble itself (exported trees), with exact TreeSHAP explanations.'
      : 'No exported ensemble is published; scenarios fall back to the linear reference model.',
  };
}

/** Defaults for any field the caller leaves out. */
export function defaultRecord(store) {
  const spec = predictionSpec(store);
  const raw = {};
  for (const f of spec.numeric) raw[f.field] = f.default;
  for (const f of spec.categorical) raw[f.field] = f.default;
  for (const f of spec.binary) raw[f.field] = f.default;
  raw.latitude = 23.5;
  raw.longitude = 78.5;
  return raw;
}

/** Turn a stored case back into a scorer input, for what-if on a real record. */
export function recordFromCase(store, row) {
  const c = store.col;
  const project = store.projects[c.projectIdx[row]];
  const district = store.districtTable[c.districtIdx[row]];
  return {
    land_area_ha: c.areaHa[row],
    expected_stage_days: c.expectedDays[row],
    elapsed_stage_days: c.elapsedDays[row],
    affected_families: c.families[row] < 0 ? '' : c.families[row],
    number_of_owners: c.owners[row] < 0 ? '' : c.owners[row],
    compensation_pending_days: c.compPendingDays[row],
    compensation_completion_percentage: c.compCompletion[row],
    legal_case_count: c.legalCases[row],
    rr_progress_percentage: c.rrProgress[row] < 0 ? '' : c.rrProgress[row],
    rehabilitation_cases: c.rehabCases[row],
    department_response_days: c.deptDays[row] < 0 ? '' : c.deptDays[row],
    document_completeness: c.docComplete[row] < 0 ? '' : c.docComplete[row],
    inactivity_days: c.inactivity[row],
    historical_stage_delay_rate: c.histStageRate[row] / 1000,
    district_historical_delay_rate: district.historicalDelayRate ?? district.observedDelayRate,
    authority_dependency_count: c.depCount?.[row] ?? '',
    pending_dependency_actions: c.pendingCount?.[row] ?? '',
    approval_delay_days: c.approvalDelay?.[row] ?? '',
    department_coordination_score: project.coordinationScore ?? '',
    authority_historical_delay_rate: project.authorityDelayRate,
    project_land_requirement_ha: project.landRequirementHa,
    latitude: c.lat[row],
    longitude: c.lon[row],
    state: project.state,
    project_type: project.type,
    authority: project.authority,
    project_priority: project.priority,
    land_type: store.dicts.landType[c.landTypeIdx[row]],
    current_stage: store.stages[c.stageIdx[row]],
    ownership_complexity: store.dicts.ownership[c.ownershipIdx[row]],
    compensation_status: store.dicts.compStatus[c.compStatusIdx[row]],
    dispute_complexity: store.dicts.dispute[c.disputeIdx[row]],
    stakeholder_responsiveness: c.respIdx[row] === 255 ? '' : store.dicts.responsiveness[c.respIdx[row]],
    verification_status: store.dicts.verification[c.verifIdx[row]],
    approval_status: store.dicts.approval[c.approvalIdx[row]],
    possession_status: store.dicts.possession[c.possessionIdx[row]],
    rr_status: store.dicts.rrStatus[c.rrStatusIdx[row]],
    legal_dispute: c.legalDispute[row],
    rr_required: c.rrRequired[row],
  };
}
