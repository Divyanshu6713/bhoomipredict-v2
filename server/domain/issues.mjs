/**
 * Land-acquisition issue taxonomy.
 *
 * A delay is rarely one thing. This module names the recurring causes —
 * ownership disputes, compensation, documentation, approvals, litigation,
 * notifications, objections, R&R, forest / environment clearance, utility
 * shifting, encumbrances, mutation, survey, multiple authorities, slow
 * processes, coordination, right of way, interface approvals and municipal
 * processes — and ties each one to evidence the platform actually holds:
 *
 *   dependency codes      from the authority registry network (and whether an action is pending)
 *   model signals         fields in the model's record vocabulary (same names for cases, projects, scenarios)
 *   framework and stage   from the acquisition framework and lifecycle
 *
 * Applicability is decided per project context, so a road project is never
 * shown right-of-way issues and a transmission line is never shown urban
 * local body processes. Thresholds come from the rule configuration so an
 * issue flagged here agrees with the recommendation engine.
 *
 * Where no signal exists in the current data (encroachments, encumbrances)
 * the issue says so and names the integration that would supply it, instead
 * of guessing.
 */
import { FRAMEWORKS, LIFECYCLE_STAGES, PROJECT_TYPES, dependencyRule } from './registry.mjs';
import { RULE_THRESHOLDS as T } from './rules.mjs';

export const ISSUE_STATUS = {
  active: { label: 'Active bottleneck', rank: 3 },
  watch: { label: 'Watch', rank: 2 },
  clear: { label: 'No current signal', rank: 1 },
  not_captured: { label: 'Not captured in current data', rank: 0 },
};

const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const pct = (v) => `${Math.round(v)}%`;

/** Helpers over a context: nodes present / pending, stage position. */
function helpers(ctx) {
  const has = (code) => ctx.nodes.some((n) => n.code === code);
  const pending = (code) => ctx.nodes.some((n) => n.code === code && n.pending);
  const nodeName = (code) => ctx.nodes.find((n) => n.code === code)?.name ?? null;
  const at = (stage) => ctx.stageIndex === LIFECYCLE_STAGES.indexOf(stage);
  const before = (stage) => ctx.stageIndex < LIFECYCLE_STAGES.indexOf(stage);
  return { has, pending, nodeName, at, before, r: ctx.record };
}

/**
 * Each issue: label, description, the dependency codes that own it, whether
 * it applies to a context, and how its status is read from the evidence.
 */
export const ISSUES = [
  {
    id: 'ownership_disputes',
    label: 'Land ownership disputes',
    group: 'Title & records',
    description: 'Disputed or fragmented title, multiple co-owners and heirs, and contested claims to the parcel.',
    owners: ['LAND_RECORDS', 'SUB_DIVISION'],
    evaluate(ctx) {
      const { r } = helpers(ctx);
      const own = r.ownership_complexity;
      const dispute = r.dispute_complexity;
      const evidence = [`Ownership: ${own ?? 'not recorded'}`, `Dispute complexity: ${dispute ?? 'not recorded'}`];
      if (own === 'Disputed' || (own === 'Fragmented' && dispute === 'High')) return { status: 'active', evidence };
      if (own === 'Fragmented' || dispute === 'High') return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'compensation',
    label: 'Compensation issues',
    group: 'Compensation & R&R',
    description: 'Award determination, fund deposit, treasury release and disbursement to entitled persons.',
    owners: ['LA_OFFICER', 'TREASURY', 'PRIMARY'],
    evaluate(ctx) {
      const { r, before, pending } = helpers(ctx);
      const done = num(r.compensation_completion_percentage);
      const days = num(r.compensation_pending_days);
      if (before('Valuation')) return { status: 'clear', evidence: [`Not yet due at ${ctx.stage}; the award follows valuation.`] };
      const evidence = [done !== null ? `Disbursement ${pct(done)}` : 'Disbursement not recorded', ...(days !== null ? [`Pending ${Math.round(days)} days`] : []), ...(pending('TREASURY') ? ['Treasury / fund release pending'] : [])];
      if (ctx.stageIndex >= LIFECYCLE_STAGES.indexOf('Compensation') && done !== null && done < T.compensationStageCriticalPct) return { status: 'active', evidence };
      if (pending('TREASURY') || (days !== null && days > 120)) return { status: 'active', evidence };
      if ((ctx.stageIndex >= LIFECYCLE_STAGES.indexOf('Compensation') && done !== null && done < T.compensationStageMinPct) || (days !== null && days > 60)) return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'documentation',
    label: 'Incomplete documentation',
    group: 'Title & records',
    description: 'Missing or unverified records, surveys, consent and valuation papers on the acquisition file.',
    owners: ['LAND_RECORDS', 'LA_OFFICER'],
    evaluate(ctx) {
      const { r } = helpers(ctx);
      const doc = num(r.document_completeness);
      const evidence = [doc !== null ? `Documentation ${pct(doc)} complete` : 'Documentation completeness not recorded', `Verification: ${r.verification_status ?? 'not recorded'}`];
      if (doc !== null && doc < T.documentationHighPct) return { status: 'active', evidence };
      if ((doc !== null && doc < T.documentationMinPct) || r.verification_status === 'Pending') return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'approvals',
    label: 'Administrative approvals',
    group: 'Approvals & clearances',
    description: 'Sanctions, draft notification approvals and appraisals waiting with a competent authority.',
    owners: ['CENTRAL_SANCTION', 'DISTRICT_HEAD'],
    evaluate(ctx) {
      const { r, pending, has } = helpers(ctx);
      const days = num(r.approval_delay_days);
      const evidence = [days !== null ? `Approvals outstanding ${Math.round(days)} days` : 'Approval delay not recorded', `Approval status: ${r.approval_status ?? 'not recorded'}`, ...(has('CENTRAL_SANCTION') ? [`Central sanction ${pending('CENTRAL_SANCTION') ? 'pending' : 'not pending'}`] : [])];
      if (pending('CENTRAL_SANCTION') || (days !== null && days >= T.approvalDelayHighDays)) return { status: 'active', evidence };
      if (days !== null && days >= T.approvalDelayDays) return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'litigation',
    label: 'Legal disputes & court cases',
    group: 'Legal',
    description: 'Writ petitions, references on compensation and stay orders before courts or the dispute forum.',
    owners: ['DISPUTE_FORUM'],
    evaluate(ctx) {
      const { r, pending, nodeName } = helpers(ctx);
      const perParcel = num(r.legal_case_count);
      const evidence = [perParcel !== null ? `${(perParcel * 100).toFixed(0)} cases per 100 parcels` : 'Case count not recorded', `Forum: ${nodeName('DISPUTE_FORUM') ?? 'as per framework'}`];
      if ((perParcel !== null && perParcel * 100 >= T.legalCasesHighPer100Parcels) || pending('DISPUTE_FORUM')) return { status: 'active', evidence };
      if (perParcel !== null && perParcel * 100 >= T.legalCasesPer100Parcels) return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'notifications',
    label: 'Acquisition notifications',
    group: 'Statutory process',
    description: 'Preliminary and final notifications, gazette publication and the statutory time limits they start.',
    owners: ['LA_OFFICER', 'CENTRAL_SANCTION', 'DISTRICT_HEAD'],
    evaluate(ctx) {
      const { at, before, pending } = helpers(ctx);
      const milestone = FRAMEWORKS[ctx.framework.id]?.milestones.Notification;
      if (!before('Notification') && !at('Notification')) return { status: 'clear', evidence: [`Notification stage completed (${milestone}).`] };
      const blocking = ['CENTRAL_SANCTION', 'LA_OFFICER', 'DISTRICT_HEAD'].filter(pending);
      const evidence = [`Milestone: ${milestone}`, ...(blocking.length ? [`Pending with: ${blocking.map((c) => ctx.nodes.find((n) => n.code === c).name).join('; ')}`] : [])];
      if (at('Notification') && blocking.length) return { status: 'active', evidence };
      return { status: at('Notification') ? 'watch' : 'clear', evidence };
    },
  },
  {
    id: 'objections',
    label: 'Objections & claims',
    group: 'Statutory process',
    description: 'Hearing and disposal of objections and claims from interested persons.',
    owners: ['LA_OFFICER', 'SUB_DIVISION'],
    evaluate(ctx) {
      const { r, at, before, pending } = helpers(ctx);
      if (before('Objection / Claims')) return { status: 'clear', evidence: ['Objection window not yet open.'] };
      const evidence = [`Stakeholder responsiveness: ${r.stakeholder_responsiveness ?? 'not recorded'}`];
      if (at('Objection / Claims') && (pending('LA_OFFICER') || pending('SUB_DIVISION'))) return { status: 'active', evidence: [...evidence, 'Hearings or field verification pending'] };
      if (at('Objection / Claims') || r.stakeholder_responsiveness === 'Low') return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'rehabilitation',
    label: 'Rehabilitation & resettlement',
    group: 'Compensation & R&R',
    description: 'R&R entitlements, resettlement sites and delivery to affected families before possession.',
    owners: ['RR_ADMIN'],
    applies: (ctx) => ctx.nodes.some((n) => n.code === 'RR_ADMIN'),
    notApplicable: 'No R&R obligation in this context (no affected families, or acquisition is by right of way / right of user).',
    evaluate(ctx) {
      const { r, pending, before } = helpers(ctx);
      const progress = num(r.rr_progress_percentage);
      const evidence = [progress !== null ? `R&R progress ${pct(progress)}` : 'R&R progress not recorded', `R&R status: ${r.rr_status ?? 'not recorded'}`];
      if (pending('RR_ADMIN')) return { status: 'active', evidence: [...evidence, 'R&R administrator action pending'] };
      if (before('Compensation')) return { status: 'clear', evidence: ['R&R delivery follows the award.'] };
      if (progress !== null && progress < T.rrHighProgressPct) return { status: 'active', evidence };
      if (progress !== null && progress < T.rrMinProgressPct) return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'forest_environment',
    label: 'Forest & environment clearances',
    group: 'Approvals & clearances',
    description: 'Forest diversion (Stage-I / Stage-II), Social Impact Assessment and environmental appraisal.',
    owners: ['FOREST', 'SIA_UNIT'],
    applies: (ctx) => ctx.nodes.some((n) => n.code === 'FOREST' || n.code === 'SIA_UNIT'),
    notApplicable: 'No recorded forest land and the framework does not require a Social Impact Assessment.',
    evaluate(ctx) {
      const { has, pending } = helpers(ctx);
      const parts = [has('FOREST') && 'forest clearance', has('SIA_UNIT') && 'Social Impact Assessment'].filter(Boolean);
      const evidence = [`Required: ${parts.join(' and ')}`];
      if (pending('FOREST') || pending('SIA_UNIT')) return { status: 'active', evidence: [...evidence, 'Clearance action pending'] };
      if (has('FOREST') && ctx.stageIndex < LIFECYCLE_STAGES.indexOf('Possession')) return { status: 'watch', evidence: [...evidence, 'Forest clearance must precede possession'] };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'utility_shifting',
    label: 'Utility shifting',
    group: 'Site readiness',
    description: 'Electricity, water, telecom and other utilities on the alignment that must move before handover.',
    owners: ['UTILITIES'],
    applies: (ctx) => ctx.nodes.some((n) => n.code === 'UTILITIES'),
    notApplicable: 'Utility shifting is not a dependency for this project type.',
    evaluate(ctx) {
      const { pending, before } = helpers(ctx);
      if (pending('UTILITIES')) return { status: 'active', evidence: ['Utility shifting estimates or works pending'] };
      if (!before('Possession')) return { status: 'watch', evidence: ['Site handover requires utilities cleared'] };
      return { status: 'clear', evidence: ['Becomes critical at possession.'] };
    },
  },
  {
    id: 'encumbrances',
    label: 'Encroachments & encumbrances',
    group: 'Site readiness',
    description: 'Encroachments on the alignment, mortgages, liens and other encumbrances on title.',
    owners: ['LAND_RECORDS', 'REGISTRATION'],
    evaluate() {
      return {
        status: 'not_captured',
        evidence: ['No encroachment or encumbrance signal in the current data. Integration-ready: registration and land-records providers would supply it.'],
      };
    },
  },
  {
    id: 'mutation_records',
    label: 'Mutation & record-of-rights issues',
    group: 'Title & records',
    description: 'Record-of-rights reconciliation, mutation in favour of the requiring body and consolidation proceedings.',
    owners: ['LAND_RECORDS', 'REGISTRATION', 'CONSOLIDATION'],
    evaluate(ctx) {
      const { r, pending, has } = helpers(ctx);
      const blocking = ['LAND_RECORDS', 'REGISTRATION', 'CONSOLIDATION'].filter(pending);
      const evidence = [`Verification: ${r.verification_status ?? 'not recorded'}`, ...(has('CONSOLIDATION') ? ['Consolidation proceedings open'] : []), ...(blocking.length ? [`Pending: ${blocking.map((c) => ctx.nodes.find((n) => n.code === c).role).join('; ')}`] : [])];
      if (blocking.length) return { status: 'active', evidence };
      if (r.verification_status === 'Pending' || has('CONSOLIDATION')) return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'survey',
    label: 'Survey & measurement issues',
    group: 'Title & records',
    description: 'Joint measurement survey, sub-division of holdings and boundary demarcation.',
    owners: ['LAND_RECORDS', 'SUB_DIVISION'],
    evaluate(ctx) {
      const { at, before, pending } = helpers(ctx);
      if (!before('Survey & Verification') && !at('Survey & Verification')) return { status: 'clear', evidence: ['Survey stage completed.'] };
      if (pending('LAND_RECORDS') || pending('SUB_DIVISION')) return { status: 'active', evidence: ['Joint measurement or sub-division survey pending'] };
      return { status: at('Survey & Verification') ? 'watch' : 'clear', evidence: ['Survey is on the critical path at this stage.'] };
    },
  },
  {
    id: 'multiple_authorities',
    label: 'Multiple authorities',
    group: 'Coordination',
    description: 'Many departments and levels of government, each able to hold a stage.',
    owners: ['DISTRICT_HEAD'],
    evaluate(ctx) {
      const { r } = helpers(ctx);
      const count = ctx.nodes.length;
      const central = ctx.nodes.filter((n) => n.level === 'central').length;
      const pendingCount = ctx.nodes.filter((n) => n.pending).length;
      const evidence = [`${count} bodies in the network (${central} central)`, `${pendingCount} with an action pending`];
      if (pendingCount >= T.coordinationPendingDepartments) return { status: 'active', evidence };
      if (pendingCount >= 2 || count >= 15 || central >= 3) return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'process_delays',
    label: 'Delayed government processes',
    group: 'Coordination',
    description: 'Slow departmental response and dormant files between actions.',
    owners: ['DISTRICT_HEAD', 'LA_OFFICER'],
    evaluate(ctx) {
      const { r } = helpers(ctx);
      const response = num(r.department_response_days);
      const idle = num(r.inactivity_days);
      const evidence = [response !== null ? `Departmental response ${Math.round(response)} days` : 'Response time not recorded', idle !== null ? `${Math.round(idle)} days since last action` : 'Inactivity not recorded'];
      if ((response !== null && response > 60) || (idle !== null && idle > 150)) return { status: 'active', evidence };
      if ((response !== null && response > 40) || (idle !== null && idle > 90)) return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'coordination',
    label: 'Inter-department coordination',
    group: 'Coordination',
    description: 'Hand-offs between the requiring body, revenue administration and supporting departments.',
    owners: ['DISTRICT_HEAD', 'PRIMARY'],
    evaluate(ctx) {
      const { r } = helpers(ctx);
      const score = num(r.department_coordination_score);
      const evidence = [score !== null ? `Coordination score ${Math.round(score)}/100` : 'Coordination score not recorded'];
      if (score !== null && score < T.coordinationMinScore) return { status: 'active', evidence };
      if (score !== null && score < T.coordinationMinScore + 10) return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'right_of_way',
    label: 'Right of way / right of user',
    group: 'Statutory process',
    description: 'Corridor access where land is not acquired: tower-base and corridor compensation, or right of user for pipelines.',
    owners: ['DISTRICT_HEAD', 'PRIMARY'],
    applies: (ctx) => ctx.framework.mode !== 'ownership',
    notApplicable: 'Land is acquired in ownership under this framework, not by right of way.',
    evaluate(ctx) {
      const { pending, r } = helpers(ctx);
      const evidence = [`Framework: ${ctx.framework.short}`, `Stakeholder responsiveness: ${r.stakeholder_responsiveness ?? 'not recorded'}`];
      if (pending('DISTRICT_HEAD') || pending('LA_OFFICER')) return { status: 'active', evidence: [...evidence, 'Right-of-way orders pending'] };
      if (r.stakeholder_responsiveness === 'Low') return { status: 'watch', evidence };
      return { status: 'clear', evidence };
    },
  },
  {
    id: 'interface_approvals',
    label: 'Interface approvals',
    group: 'Approvals & clearances',
    description: 'Railway and highway crossings, and civil aviation site and height clearances.',
    owners: ['RAILWAY_INTERFACE', 'HIGHWAY_INTERFACE', 'AVIATION'],
    applies: (ctx) => ctx.nodes.some((n) => ['RAILWAY_INTERFACE', 'HIGHWAY_INTERFACE', 'AVIATION'].includes(n.code)),
    notApplicable: 'No railway, highway or aviation interface in this context.',
    evaluate(ctx) {
      const codes = ['RAILWAY_INTERFACE', 'HIGHWAY_INTERFACE', 'AVIATION'];
      const present = ctx.nodes.filter((n) => codes.includes(n.code));
      const pendingNodes = present.filter((n) => n.pending);
      const evidence = present.map((n) => `${n.role}${n.pending ? ' — pending' : ''}`);
      if (pendingNodes.length) return { status: 'active', evidence };
      return { status: ctx.stageIndex <= LIFECYCLE_STAGES.indexOf('Notification') ? 'watch' : 'clear', evidence };
    },
  },
  {
    id: 'urban_local_body',
    label: 'Municipal / urban local body processes',
    group: 'Approvals & clearances',
    description: 'Building permissions, TDR claims and municipal dues on urban parcels.',
    owners: ['URBAN_LOCAL_BODY'],
    applies: (ctx) => ctx.nodes.some((n) => n.code === 'URBAN_LOCAL_BODY'),
    notApplicable: 'Not an urban project; no urban local body in the network.',
    evaluate(ctx) {
      const { pending } = helpers(ctx);
      if (pending('URBAN_LOCAL_BODY')) return { status: 'active', evidence: ['Municipal NOC, TDR or building permission pending'] };
      return { status: 'watch', evidence: ['Urban parcels carry TDR and municipal claims.'] };
    },
  },
];

export const ISSUE_BY_ID = new Map(ISSUES.map((i) => [i.id, i]));

/**
 * Issues each project type is most exposed to, in priority order, and a
 * plain statement of its typical dependencies. Other applicable issues are
 * still evaluated; these lead.
 */
export const PROJECT_TYPE_ISSUES = {
  'National Highway': { core: ['compensation', 'utility_shifting', 'encumbrances', 'litigation', 'ownership_disputes', 'forest_environment', 'notifications'], typical: 'NHAI / MoRTH, competent authority (CALA), land ownership, compensation, utility shifting, encroachments, forest clearance where applicable, litigation, village and revenue administration.' },
  Expressway: { core: ['compensation', 'ownership_disputes', 'utility_shifting', 'encumbrances', 'litigation', 'interface_approvals'], typical: 'Expressway authority or NHAI, revenue administration, land ownership, compensation, utility shifting, crossings, litigation.' },
  Railway: { core: ['compensation', 'rehabilitation', 'utility_shifting', 'ownership_disputes', 'litigation', 'forest_environment'], typical: 'Ministry of Railways / zonal railway or rail corporation, land parcels, compensation, R&R, utility and structure relocation, forest issues, litigation.' },
  'Metro Rail': { core: ['urban_local_body', 'rehabilitation', 'encumbrances', 'utility_shifting', 'compensation', 'litigation'], typical: 'Metro rail corporation, development authority and urban local body, TDR, R&R of structures, utility shifting, litigation.' },
  'Urban Infrastructure': { core: ['urban_local_body', 'encumbrances', 'rehabilitation', 'ownership_disputes', 'utility_shifting', 'compensation'], typical: 'Urban local body, development authority, municipal processes, land ownership, encroachment, rehabilitation.' },
  Irrigation: { core: ['rehabilitation', 'compensation', 'forest_environment', 'survey', 'ownership_disputes', 'mutation_records'], typical: 'Water resources / irrigation department or nigam, canal and reservoir land, submergence, R&R, compensation, environmental and forest issues.' },
  'Power Transmission': { core: ['right_of_way', 'compensation', 'forest_environment', 'interface_approvals', 'objections', 'coordination'], typical: 'Transmission utility and power authority, right of way, tower-base compensation, forest clearance where relevant, crossings and utility coordination.' },
  'Renewable Energy': { core: ['ownership_disputes', 'mutation_records', 'compensation', 'documentation', 'forest_environment', 'approvals'], typical: 'Renewable energy agency or park developer, land aggregation, title and mutation, compensation, clearances where applicable.' },
  Pipeline: { core: ['right_of_way', 'compensation', 'interface_approvals', 'objections', 'forest_environment'], typical: 'Pipeline operator and competent authority, right of user, crop compensation, railway / highway crossings, forest where applicable.' },
  Industrial: { core: ['compensation', 'rehabilitation', 'ownership_disputes', 'objections', 'litigation', 'documentation'], typical: 'Industrial development corporation / board, land ownership, compensation or consent awards, R&R, objections and litigation.' },
  Airport: { core: ['interface_approvals', 'rehabilitation', 'compensation', 'utility_shifting', 'encumbrances', 'approvals'], typical: 'Airport developer or AAI, Ministry of Civil Aviation site clearance, height clearances, compensation, R&R, utility shifting.' },
};

/**
 * Evaluate the issue profile for a context.
 *
 *   projectType, stage   project context
 *   framework            { id, short, mode }
 *   nodes                dependency nodes, each with `pending` (boolean)
 *   record               model-vocabulary signals
 */
export function issueProfile({ projectType, stage, framework, nodes, record }) {
  const ctx = {
    projectType,
    stage,
    stageIndex: LIFECYCLE_STAGES.indexOf(stage),
    framework,
    nodes: nodes.map((n) => ({ code: n.code, name: n.name, role: n.role, level: n.level, pending: Boolean(n.pending) })),
    record: record ?? {},
  };
  const core = PROJECT_TYPE_ISSUES[projectType]?.core ?? [];
  const applicable = [];
  const excluded = [];
  for (const issue of ISSUES) {
    if (issue.applies && !issue.applies(ctx)) {
      excluded.push({ id: issue.id, label: issue.label, reason: issue.notApplicable });
      continue;
    }
    const { status, evidence } = issue.evaluate(ctx);
    const owners = issue.owners.map((code) => ctx.nodes.find((n) => n.code === code)).filter(Boolean).map((n) => ({ code: n.code, name: n.name, pending: n.pending }));
    applicable.push({
      id: issue.id,
      label: issue.label,
      group: issue.group,
      description: issue.description,
      core: core.includes(issue.id),
      status,
      statusLabel: ISSUE_STATUS[status].label,
      evidence,
      owners,
    });
  }
  const coreRank = (i) => (i.core ? core.indexOf(i.id) : 100);
  applicable.sort((a, b) => ISSUE_STATUS[b.status].rank - ISSUE_STATUS[a.status].rank || coreRank(a) - coreRank(b));
  const count = (s) => applicable.filter((i) => i.status === s).length;
  return {
    projectType,
    typicalDependencies: PROJECT_TYPE_ISSUES[projectType]?.typical ?? null,
    summary: { active: count('active'), watch: count('watch'), clear: count('clear'), notCaptured: count('not_captured'), excluded: excluded.length },
    issues: applicable,
    excluded,
    basis: 'Rule-based reading of registry dependencies, pending department actions and model signals. It describes where the acquisition is exposed; it is not a finding of cause.',
  };
}

/** Issue profile of a project object (effective project). */
export function projectIssueProfile(project, record) {
  return issueProfile({
    projectType: project.type,
    stage: project.currentStage,
    framework: project.framework ?? { id: 'RFCTLARR', short: 'RFCTLARR Act, 2013', mode: 'ownership' },
    nodes: (project.network?.nodes ?? []).map((n) => ({ ...n, pending: (n.pendingShareCurrentStage ?? 0) >= T.dependencyPendingShare })),
    record,
  });
}

/**
 * Static exposure of each project type to each issue, from the dependency
 * rules and frameworks alone: core, possible (depends on the context) or
 * never applicable.
 */
export function typeIssueMatrix() {
  const codeNever = (type, code) => dependencyRule(type, code).length === 0;
  return Object.entries(PROJECT_TYPES).map(([name, t]) => {
    const modes = new Set(t.subtypes.flatMap((subtype) => ['Karnataka', 'Maharashtra', 'Rajasthan'].map((state) => FRAMEWORKS[t.framework({ subtype, state, primary: '' })].mode)));
    const core = PROJECT_TYPE_ISSUES[name]?.core ?? [];
    return {
      projectType: name,
      sector: t.sector,
      typicalDependencies: PROJECT_TYPE_ISSUES[name]?.typical ?? null,
      issues: ISSUES.map((issue) => {
        let exposure = core.includes(issue.id) ? 'core' : 'possible';
        if (issue.id === 'right_of_way' && !Array.from(modes).some((m) => m !== 'ownership')) exposure = 'never';
        if (issue.applies && issue.id !== 'right_of_way' && issue.id !== 'rehabilitation' && issue.id !== 'forest_environment' && issue.owners.every((code) => codeNever(name, code))) exposure = 'never';
        return { id: issue.id, label: issue.label, exposure };
      }),
    };
  });
}

export const issueCatalogue = () => ISSUES.map(({ id, label, group, description, owners, notApplicable }) => ({ id, label, group, description, owners, conditional: Boolean(notApplicable) }));
