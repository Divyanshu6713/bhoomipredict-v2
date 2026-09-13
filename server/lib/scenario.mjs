/**
 * Scenario scoring.
 *
 * A scenario is a project context (state, district, project type, subtype,
 * acquiring body, stage, land flags) plus the signals a reviewer wants to test.
 * The context goes through the authority registry first, so the dependency
 * network — and with it the model inputs it drives — is always the one that
 * applies to that type in that state and district:
 *
 *   context → dependency network → authority_dependency_count,
 *             pending_dependency_actions, department_coordination_score,
 *             district / authority historical delay rates, framework
 *           → surrogate of the deployed ensemble → probability, band,
 *             expected slip days, closed-form contributions
 *           → rules → recommendations with named owners
 *
 * Each dependency reports why it exists, who owns it, which stages it gates,
 * whether an action is pending, and its exact contribution to the score
 * (the surrogate is linear, so a pending action adds exactly coef/sd log-odds).
 */
import { PROJECT_TYPES, LIFECYCLE_STAGES, authorityOptions, buildDependencyNetwork, coordinationScore } from '../domain/registry.mjs';
import { districtIndex, resolveDistrict } from '../domain/geography.mjs';
import { evaluateScenario } from '../domain/rules.mjs';
import { scoreRecord, defaultRecord } from './scorer.mjs';
import { ServiceError, projectRecord, getProject } from './projects.mjs';
import { dayFromISO, isoFromDay } from '../domain/lifecycle.mjs';

const STAGE_SLIP = { 'Land Identification': 0.1, 'Survey & Verification': 0.22, Notification: 0.15, 'Objection / Claims': 0.38, Valuation: 0.27, Compensation: 0.44, Possession: 0.31, 'Rehabilitation & Resettlement': 0.35, Closure: 0.08 };
const STAGE_DAYS = { 'Land Identification': 45, 'Survey & Verification': 75, Notification: 60, 'Objection / Claims': 90, Valuation: 70, Compensation: 110, Possession: 80, 'Rehabilitation & Resettlement': 120, Closure: 35 };

export function scenarioOptions(store, { state, district, projectType, subtype }) {
  const idx = districtIndex();
  const states = Array.from(idx.byState.keys()).sort();
  const out = {
    states,
    projectTypes: Object.entries(PROJECT_TYPES).map(([name, t]) => ({ name, subtypes: t.subtypes, linear: t.linear })),
    stages: LIFECYCLE_STAGES,
    corpusStates: Array.from(new Set(store.projects.map((p) => p.state))).sort(),
  };
  if (state && idx.byState.has(state)) {
    out.districts = idx.byState
      .get(state)
      .map((d) => ({ district: d.district, subDistricts: d.subDistricts, inCorpus: store.districtTable.some((x) => x.state === state && x.district === d.district) }))
      .sort((a, b) => a.district.localeCompare(b.district));
  }
  if (state && district && projectType && PROJECT_TYPES[projectType]) {
    out.authorityOptions = authorityOptions({ projectType, subtype, state, district });
  }
  return out;
}

function resolveContext(store, ctx = {}) {
  const errors = [];
  const idx = districtIndex();
  const state = Array.from(idx.byState.keys()).find((s) => s.toLowerCase() === String(ctx.state ?? '').toLowerCase());
  if (!state) errors.push({ field: 'state', message: `Unknown state "${ctx.state ?? ''}".` });
  const d = state ? resolveDistrict(state, String(ctx.district ?? '')) : null;
  if (state && !d) errors.push({ field: 'district', message: `"${ctx.district ?? ''}" is not a district of ${state}.` });
  const type = PROJECT_TYPES[ctx.projectType];
  if (!type) errors.push({ field: 'projectType', message: `Unknown project type "${ctx.projectType ?? ''}".` });
  const subtype = type ? (type.subtypes.includes(ctx.subtype) ? ctx.subtype : type.subtypes[0]) : null;
  if (type && ctx.subtype && !type.subtypes.includes(ctx.subtype)) errors.push({ field: 'subtype', message: `"${ctx.subtype}" is not a subtype of ${ctx.projectType}.` });
  const stage = LIFECYCLE_STAGES.includes(ctx.stage) ? ctx.stage : null;
  if (!stage) errors.push({ field: 'stage', message: `Unknown stage "${ctx.stage ?? ''}".` });
  let primary = null;
  if (state && d && type) {
    const options = authorityOptions({ projectType: ctx.projectType, subtype, state, district: d.district });
    if (ctx.primaryAuthority && !options.includes(ctx.primaryAuthority)) {
      errors.push({
        field: 'primaryAuthority',
        message: `"${ctx.primaryAuthority}" is not an eligible acquiring body for a ${ctx.projectType} project in ${d.district}, ${state}. Eligible: ${options.join('; ')}.`,
      });
    }
    primary = options.includes(ctx.primaryAuthority) ? ctx.primaryAuthority : options[0];
  }
  if (errors.length) throw new ServiceError('Scenario context is not valid', 422, errors);
  const subDistrict = d.subDistricts.includes(ctx.subDistrict) ? ctx.subDistrict : d.subDistricts[0] ?? null;
  const districtRow = store.districtTable.find((x) => x.state === state && x.district === d.district);
  const inState = store.districtTable.filter((x) => x.state === state);
  const districtRate = districtRow
    ? districtRow.historicalDelayRate ?? districtRow.observedDelayRate
    : inState.length
      ? inState.reduce((a, x) => a + (x.historicalDelayRate ?? x.observedDelayRate), 0) / inState.length
      : 0.33;
  const authorityProject = store.projects.find((p) => p.authority === primary);
  return {
    state,
    district: d.district,
    subDistrict,
    projectType: ctx.projectType,
    subtype,
    stage,
    primaryAuthority: primary,
    affectedFamilies: Math.max(0, Number(ctx.affectedFamilies ?? 1) || 0),
    flags: {
      forestLand: Boolean(ctx.flags?.forestLand),
      crossesRailway: Boolean(ctx.flags?.crossesRailway),
      crossesHighway: Boolean(ctx.flags?.crossesHighway),
      consolidationOpen: Boolean(ctx.flags?.consolidationOpen),
    },
    districtRate: Number(districtRate.toFixed(3)),
    districtRateBasis: districtRow ? 'district history in the corpus' : 'state average (district not in the corpus)',
    authorityRate: authorityProject ? authorityProject.authorityDelayRate : 0.33,
    authorityRateBasis: authorityProject ? 'authority history in the corpus' : 'portfolio median (authority not in the corpus)',
    centroid: d.centroid,
  };
}

function featureSpec(store, name) {
  return store.surrogate.features.find((f) => f.name === name) ?? null;
}

/** Build the full model record for a resolved context and user signals. */
function assemble(store, context, network, pendingCodes, signals, seedRecord) {
  const base = { ...defaultRecord(store), ...(seedRecord ?? {}) };
  const relevant = new Set(network.nodes.filter((n) => n.stages.includes(context.stage)).map((n) => n.code));
  const pending = pendingCodes.filter((c) => relevant.has(c));
  const coordination = coordinationScore(network, context.authorityRate);
  const record = {
    ...base,
    ...signals,
    state: context.state,
    project_type: context.projectType,
    authority: context.primaryAuthority,
    current_stage: context.stage,
    district_historical_delay_rate: context.districtRate,
    authority_historical_delay_rate: context.authorityRate,
    authority_dependency_count: network.dependencyCount,
    pending_dependency_actions: pending.length,
    department_coordination_score: coordination,
    historical_stage_delay_rate: STAGE_SLIP[context.stage],
    latitude: context.centroid[1],
    longitude: context.centroid[0],
  };
  if (signals.expected_stage_days === undefined && seedRecord?.current_stage !== context.stage) record.expected_stage_days = STAGE_DAYS[context.stage];
  // Stage-consistent defaults: no award before Valuation, no possession before Possession.
  const si = LIFECYCLE_STAGES.indexOf(context.stage);
  if (si < 4) {
    record.compensation_completion_percentage = 0;
    record.compensation_status = 'Not Initiated';
    record.compensation_pending_days = 0;
  }
  if (si < 5) record.possession_status = 'Not Initiated';
  return { record, pending, relevant, coordination };
}

function describeNetwork(store, network, context, pending, relevant, result) {
  const pendSpec = featureSpec(store, 'pending_dependency_actions');
  const countSpec = featureSpec(store, 'authority_dependency_count');
  const perPending = pendSpec ? pendSpec.coef / (pendSpec.std || 1) : 0;
  const perNode = countSpec ? countSpec.coef / (countSpec.std || 1) : 0;
  const p = result.probability;
  const toPoints = (logOdds) => Number((p * (1 - p) * logOdds * 100).toFixed(2));
  return network.nodes.map((n) => {
    const isPending = pending.includes(n.code);
    return {
      ...n,
      relevantToStage: relevant.has(n.code),
      pending: isPending,
      influence: {
        presenceLogOdds: Number(perNode.toFixed(4)),
        pendingLogOdds: isPending ? Number(perPending.toFixed(4)) : 0,
        pointsIfPending: toPoints(perPending),
        currentPoints: toPoints(perNode + (isPending ? perPending : 0)),
      },
      explanation: `${n.why} ${
        relevant.has(n.code)
          ? isPending
            ? `An action is pending at ${context.stage}: ${n.pendingActionText.toLowerCase()}. Each pending department action adds ${perPending >= 0 ? '+' : ''}${perPending.toFixed(2)} log-odds (about ${toPoints(perPending)} percentage points here).`
            : `It gates ${context.stage}; no action is marked pending.`
          : `It does not gate ${context.stage}, so it cannot hold this stage.`
      }`,
    };
  });
}

/**
 * Score a scenario (and optionally a baseline) and return everything the
 * Scenario Scoring screen shows.
 */
export function scoreScenario(store, body) {
  const context = resolveContext(store, body.context);
  const network = buildDependencyNetwork({ ...context, primaryAuthority: context.primaryAuthority });
  let seedRecord = null;
  let seedProject = null;
  if (body.seedProjectId) {
    seedProject = getProject(body.seedProjectId);
    if (seedProject) seedRecord = projectRecord(seedProject);
  }
  const pendingCodes = Array.isArray(body.pending) ? body.pending.map(String) : [];
  const signals = sanitizeSignals(body.signals ?? {});
  const { record, pending, relevant, coordination } = assemble(store, context, network, pendingCodes, signals, seedRecord);
  const result = scoreRecord(store.surrogate, record);

  let baseline = null;
  let delta = null;
  if (body.baseline) {
    const bctx = resolveContext(store, body.baseline.context ?? body.context);
    const bnet = buildDependencyNetwork({ ...bctx });
    const b = assemble(store, bctx, bnet, Array.isArray(body.baseline.pending) ? body.baseline.pending : [], sanitizeSignals(body.baseline.signals ?? {}), seedRecord);
    baseline = scoreRecord(store.surrogate, b.record);
    delta = {
      probability: Number((result.probability - baseline.probability).toFixed(4)),
      riskScore: Number(((result.probability - baseline.probability) * 100).toFixed(1)),
      predictedDelayDays: (result.predictedDelayDays ?? 0) - (baseline.predictedDelayDays ?? 0),
      dependencyCount: network.dependencyCount - bnet.dependencyCount,
      addedDependencies: network.nodes.filter((n) => !bnet.nodes.some((m) => m.code === n.code && m.name === n.name)).map((n) => n.name),
      removedDependencies: bnet.nodes.filter((n) => !network.nodes.some((m) => m.code === n.code && m.name === n.name)).map((n) => n.name),
    };
  }

  const nodes = describeNetwork(store, network, context, pending, relevant, result);
  const stageIndex = LIFECYCLE_STAGES.indexOf(context.stage);
  const today = store.today;

  // The scenario expressed as a project so the same rules produce the recommendations.
  const pseudo = {
    id: 'SCENARIO',
    name: 'Scenario',
    type: context.projectType,
    state: context.state,
    district: context.district,
    districts: [context.district],
    authority: context.primaryAuthority,
    currentStage: context.stage,
    currentStageIndex: stageIndex,
    riskScore: result.riskScore,
    riskBand: result.riskBand,
    delayProbability: result.probability,
    predictedDelayDays: result.predictedDelayDays,
    totalParcels: 100,
    legalCases: Math.round(Number(record.legal_case_count || 0) * 100),
    legalDisputeParcels: Math.round(Number(record.legal_dispute || 0) * 100),
    compensationCompletionPct: Number(record.compensation_completion_percentage || 0),
    avgDocumentCompleteness: Number(record.document_completeness || 0),
    approvalDelayDays: Number(record.approval_delay_days || 0),
    rrRequiredParcels: Number(record.rr_required || 0) > 0 ? 1 : 0,
    rrProgressPct: Number(record.rr_progress_percentage || 0),
    rrCases: Number(record.rehabilitation_cases || 0),
    stakeholderResponsiveness: record.stakeholder_responsiveness,
    possessionCompletionPct: record.possession_status === 'Complete' ? 100 : record.possession_status === 'Partial' ? 50 : 0,
    coordinationScore: coordination,
    targetCompletionDate: isoFromDay(dayFromISO(today) + 400),
    network: { ...network, nodes: nodes.map((n) => ({ ...n, pendingShareCurrentStage: n.pending ? 1 : 0, pendingCurrentStage: n.pending ? 1 : 0 })) },
    stages: LIFECYCLE_STAGES.map((name, i) => ({ name, status: i === stageIndex ? 'IN_PROGRESS' : i < stageIndex ? 'COMPLETED' : 'PENDING', openCases: 0, blockedBy: [] })),
    lifecycle: { residualBacklog: 0, timelineOverrunDays: 0 },
    contributors: result.increasing.map((g) => ({ group: g.group, value: g.value, share: g.share })),
  };

  return {
    context,
    framework: network.framework,
    stateProfile: network.stateProfile,
    authorityOptions: network.authorityOptions,
    dependencies: {
      count: network.dependencyCount,
      pendingCount: pending.length,
      relevantCount: relevant.size,
      coordinationScore: coordination,
      nodes,
      ignoredPending: pendingCodes.filter((c) => !relevant.has(c)),
      note: network.note,
    },
    milestone: network.milestones[context.stage],
    record,
    result,
    baseline,
    delta,
    recommendations: evaluateScenario(pseudo),
    seedProject: seedProject ? { id: seedProject.id, name: seedProject.name, riskScore: seedProject.riskScore, riskBasis: seedProject.riskBasis } : null,
  };
}

/** Only numeric model fields and known categoricals may be set directly. */
function sanitizeSignals(signals) {
  const allowedNumeric = [
    'land_area_ha', 'expected_stage_days', 'elapsed_stage_days', 'affected_families', 'number_of_owners',
    'compensation_pending_days', 'compensation_completion_percentage', 'legal_case_count', 'rr_progress_percentage',
    'rehabilitation_cases', 'department_response_days', 'document_completeness', 'inactivity_days', 'approval_delay_days',
    'project_land_requirement_ha', 'legal_dispute', 'rr_required',
  ];
  const allowedCategorical = ['project_priority', 'land_type', 'ownership_complexity', 'compensation_status', 'dispute_complexity', 'stakeholder_responsiveness', 'verification_status', 'approval_status', 'possession_status', 'rr_status'];
  const out = {};
  for (const [k, v] of Object.entries(signals)) {
    if (allowedNumeric.includes(k) && Number.isFinite(Number(v))) out[k] = Number(v);
    else if (allowedCategorical.includes(k) && typeof v === 'string') out[k] = v;
  }
  return out;
}

/** Context and signals that reproduce an existing project, for seeding the screen. */
export function scenarioSeedForProject(p) {
  const record = projectRecord(p);
  return {
    context: {
      state: p.state,
      district: p.district,
      subDistrict: p.subDistrict,
      projectType: p.type,
      subtype: p.subtype,
      primaryAuthority: p.authority,
      stage: p.currentStage,
      affectedFamilies: p.affectedFamilies,
      flags: p.flags,
    },
    pending: p.network.nodes.filter((n) => (n.pendingShareCurrentStage ?? 0) >= 0.3).map((n) => n.code),
    signals: Object.fromEntries(
      Object.entries(record).filter(([k, v]) => v !== '' && !['state', 'project_type', 'authority', 'current_stage', 'latitude', 'longitude', 'authority_dependency_count', 'pending_dependency_actions', 'department_coordination_score', 'district_historical_delay_rate', 'authority_historical_delay_rate', 'historical_stage_delay_rate'].includes(k)),
    ),
  };
}
