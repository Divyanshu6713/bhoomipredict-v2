/**
 * Rules engine — one evaluation drives recommendations, interventions and alerts.
 *
 *   project facts (lifecycle, dependencies, compensation, legal, …)
 *        ↓  TRIGGER RULES (thresholds below)
 *   triggers ─→ recommendations (every trigger, with reason, owner, action)
 *            ─→ interventions   (Medium severity and above, with workflow status)
 *            ─→ alerts          (Medium severity and above, plus risk movements)
 *
 * Every rule names the metric it read, the value, the threshold and the
 * responsible authority — resolved from the project's dependency network, so a
 * compensation backlog in Mandya is owned by the Special Land Acquisition
 * Officer, Mandya, and in Kanpur Nagar by the ADM (Land Acquisition).
 * Nothing here is random, and no rule fires without its condition holding.
 */
import { roleForDependency } from './roles.mjs';

/**
 * Trigger thresholds. Configurable; the defaults are calibrated so each rule
 * flags roughly the weakest tenth to fifth of the demonstration portfolio on
 * that measure, rather than firing on every project. A deployment would set
 * them from programme norms.
 */
export const RULE_THRESHOLDS = {
  compensationStageMinPct: 44, // completion across due parcels expected at the Compensation stage
  compensationStageCriticalPct: 38,
  possessionStageMinCompPct: 62, // …and from Possession onwards
  possessionStageCriticalCompPct: 50,
  legalCasesPer100Parcels: 64,
  legalCasesHighPer100Parcels: 70,
  legalDisputeParcelShare: 0.225,
  documentationMinPct: 58,
  documentationHighPct: 50,
  approvalDelayDays: 75,
  approvalDelayHighDays: 100,
  rrMinProgressPct: 53,
  rrHighProgressPct: 40,
  coordinationMinScore: 50,
  coordinationPendingDepartments: 4,
  residualBacklogMin: 60,
  residualBacklogShare: 0.15,
  residualBacklogHighShare: 0.2,
  timelineOverrunDays: 120,
  dependencyPendingShare: 0.36,
  dependencyPendingHighShare: 0.45,
  possessionMinPct: 30,
  riskIncreasePoints: 5,
  deadlineCriticalDays: 90,
  deadlineHighDays: 30,
};

/**
 * Project-type and framework-specific overrides. A threshold that is fair for
 * an ownership acquisition is not fair for a right-of-user pipeline, so the
 * applicable set is resolved per project (framework mode first, then type).
 * Each override carries the reason shown in the Registry.
 */
export const RULE_THRESHOLD_OVERRIDES = [
  {
    match: { frameworkMode: 'right_of_user' },
    thresholds: { compensationStageMinPct: 55, compensationStageCriticalPct: 45, possessionStageMinCompPct: 70, possessionStageCriticalCompPct: 60, legalCasesPer100Parcels: 50, legalCasesHighPer100Parcels: 60 },
    reason: 'Right-of-user corridors (PMP Act) pay damage compensation on a short cycle and rarely attract title litigation, so a lower backlog and fewer cases already indicate trouble.',
  },
  {
    match: { frameworkMode: 'right_of_way' },
    thresholds: { compensationStageMinPct: 50, compensationStageCriticalPct: 42, legalCasesPer100Parcels: 55, legalCasesHighPer100Parcels: 65, dependencyPendingShare: 0.32 },
    reason: 'Transmission right-of-way compensation is tower-footprint and corridor based; payment is expected earlier and utility / clearance dependencies gate the work.',
  },
  {
    match: { projectType: 'Metro Rail' },
    thresholds: { documentationMinPct: 62, documentationHighPct: 55, residualBacklogShare: 0.12 },
    reason: 'Urban parcels carry dense, multi-owner records; documentation gaps block awards sooner than on agricultural land.',
  },
  {
    match: { projectType: 'Irrigation' },
    thresholds: { rrMinProgressPct: 60, rrHighProgressPct: 48 },
    reason: 'Submergence and command-area works displace whole habitations, so R&R lag is escalated earlier.',
  },
  {
    match: { projectType: 'Airport' },
    thresholds: { rrMinProgressPct: 58, timelineOverrunDays: 90 },
    reason: 'Greenfield airports acquire contiguous land pools with resettlement; a short overrun delays the whole construction package.',
  },
];

/** The thresholds that apply to one project: defaults, then framework, then type overrides. */
export function thresholdsFor(project) {
  const mode = project?.framework?.mode ?? project?.network?.framework?.mode ?? null;
  const applied = [];
  let t = { ...RULE_THRESHOLDS };
  for (const o of RULE_THRESHOLD_OVERRIDES) {
    const ok = (!o.match.frameworkMode || o.match.frameworkMode === mode) && (!o.match.projectType || o.match.projectType === project?.type);
    if (ok) {
      t = { ...t, ...o.thresholds };
      applied.push({ match: o.match, reason: o.reason, keys: Object.keys(o.thresholds) });
    }
  }
  return { thresholds: t, applied };
}

const SEVERITY_RANK = { Low: 0, Medium: 1, High: 2, Critical: 3 };
export const severityRank = (s) => SEVERITY_RANK[s] ?? 0;
const PRIORITY = { Critical: 'P1', High: 'P2', Medium: 'P3', Low: 'P4' };
const DUE_DAYS = { Critical: 7, High: 14, Medium: 30, Low: 45 };

/** Model contributor group → the kind of review it prompts. */
const CONTRIBUTOR_ACTION = {
  Compensation: { category: 'compensation', owner: 'LA_OFFICER', action: 'Verify pending compensation parcel by parcel and pre-clear the treasury release' },
  'Legal disputes': { category: 'legal', owner: 'DISPUTE_FORUM', action: 'Seek consolidated early hearings on the open legal cases' },
  'Ownership complexity': { category: 'documentation', owner: 'LAND_RECORDS', action: 'Hold a joint revenue–records title scrutiny camp for fragmented holdings' },
  'Documentation & verification': { category: 'documentation', owner: 'LAND_RECORDS', action: 'Close record-verification and mutation gaps in a time-bound drive' },
  Inactivity: { category: 'schedule', owner: 'LA_OFFICER', action: 'Reopen dormant files and restore a weekly action cadence' },
  'Stage schedule pressure': { category: 'schedule', owner: 'PRIMARY', action: 'Re-sequence the stage plan and add field capacity on the critical path' },
  'Stakeholder responsiveness': { category: 'stakeholder', owner: 'SUB_DIVISION', action: 'Schedule village-level camps and follow up with non-responsive landowners' },
  'Administrative response time': { category: 'coordination', owner: 'DISTRICT_HEAD', action: 'Move files to a tracked workflow with a fixed disposal norm' },
  'Rehabilitation & resettlement': { category: 'rr', owner: 'RR_ADMIN', action: 'Confirm R&R entitlements and resettlement site readiness' },
  'Historical stage performance': { category: 'schedule', owner: 'PRIMARY', action: 'Treat this stage plan as optimistic and review it weekly' },
  'District performance history': { category: 'coordination', owner: 'DISTRICT_HEAD', action: 'Convene a district review of chronic bottlenecks' },
  'Authority performance history': { category: 'coordination', owner: 'PRIMARY', action: 'Raise the project at the implementing authority’s monthly review' },
  'Authority dependencies': { category: 'coordination', owner: 'DISTRICT_HEAD', action: 'Set up a single coordination forum for the departments involved' },
  'Pending department actions': { category: 'dependency', owner: 'DISTRICT_HEAD', action: 'Chase the pending department actions with named owners and dates' },
  'Approval delay': { category: 'approval', owner: 'DISTRICT_HEAD', action: 'Escalate the outstanding approvals and clearances' },
  'Inter-department coordination': { category: 'coordination', owner: 'DISTRICT_HEAD', action: 'Hold a cross-department escalation meeting' },
  Possession: { category: 'possession', owner: 'LA_OFFICER', action: 'Issue possession notices and schedule joint handover' },
  'Affected families': { category: 'stakeholder', owner: 'RR_ADMIN', action: 'Run a consultation round with affected families before the milestone' },
};

const nodeByCode = (project, code) => (project.network?.nodes ?? []).find((n) => n.code === code) ?? null;

function owner(project, code, fallbackCode = 'DISTRICT_HEAD') {
  const node = nodeByCode(project, code) ?? nodeByCode(project, fallbackCode) ?? nodeByCode(project, 'PRIMARY');
  return node
    ? { code: node.code, name: node.name, role: node.role, assignedRole: roleForDependency(node) }
    : { code: fallbackCode, name: 'District administration', role: 'District administration', assignedRole: 'DISTRICT_ADMIN' };
}

const pct = (v) => `${Math.round(v)}%`;

/**
 * Evaluate every rule for one project.
 * @param project effective project (registry fields + lifecycle + network)
 * @param ctx.previousRisk risk score from the previous snapshot, if any
 * @param ctx.rejectedDocuments count of rejected documents on the project
 */
export function evaluateProject(project, ctx = {}) {
  const T = thresholdsFor(project).thresholds;
  const bands = ctx.bands ?? { high: 0.45, critical: 0.6 };
  const out = [];
  const stages = project.stages ?? [];
  const current = stages[project.currentStageIndex] ?? null;
  const stageName = current?.name ?? project.currentStage;

  const push = (t) => {
    const o = t.owner ?? owner(project, 'DISTRICT_HEAD');
    out.push({
      id: `${project.id}:${t.code}${t.suffix ? `:${t.suffix}` : ''}`,
      projectId: project.id,
      projectName: project.name,
      state: project.state,
      district: project.district,
      code: t.code,
      category: t.category,
      severity: t.severity,
      priority: PRIORITY[t.severity],
      title: t.title,
      reason: t.reason,
      trigger: t.trigger,
      stage: t.stage ?? stageName,
      responsibleAuthority: { code: o.code, name: o.name, role: o.role },
      supportingAuthorities: (t.supporting ?? []).map((c) => nodeByCode(project, c)?.name).filter(Boolean),
      assignedRole: t.assignedRole ?? o.assignedRole,
      recommendedAction: t.action,
      expectedOutcome: t.outcome,
      dueInDays: DUE_DAYS[t.severity],
      caseIds: t.caseIds ?? [],
      alert: t.alert !== false,
      intervention: t.intervention !== false,
    });
  };

  /* ----------------------------------------------------------- model risk */
  if (project.riskBand === 'Critical' || project.riskBand === 'High') {
    const critical = project.riskBand === 'Critical';
    push({
      code: critical ? 'CRITICAL_RISK' : 'HIGH_RISK',
      category: 'risk',
      severity: critical ? 'Critical' : 'High',
      title: `${project.riskBand} predicted delay risk on the ${stageName} milestone`,
      reason: `Delay risk ${project.riskScore}: the deployed model expects about ${project.riskScore}% of the open parcels at ${stageName} to miss their milestone by more than 30 days${project.predictedDelayDays ? `, with an expected slip of about ${project.predictedDelayDays} days` : ''}.`,
      trigger: { source: 'model', metric: 'delay_risk', value: project.delayProbability, operator: '>=', threshold: critical ? bands.critical : bands.high },
      owner: owner(project, 'PRIMARY'),
      assignedRole: 'DISTRICT_ADMIN',
      supporting: ['DISTRICT_HEAD', 'LA_OFFICER'],
      action: `Put the project on the weekly district review until risk falls below the ${critical ? 'Critical' : 'High'} band.`,
      outcome: 'Named owners and dates for each leading risk contributor.',
      intervention: critical,
    });
  }

  if (ctx.previousRisk !== undefined && ctx.previousRisk !== null && project.riskScore - ctx.previousRisk >= T.riskIncreasePoints) {
    push({
      code: 'RISK_INCREASE',
      category: 'risk',
      severity: project.riskScore - ctx.previousRisk >= 12 ? 'High' : 'Medium',
      title: `Predicted risk rose ${project.riskScore - ctx.previousRisk} points`,
      reason: `Risk moved from ${ctx.previousRisk}% at the previous assessment to ${project.riskScore}% now.`,
      trigger: { source: 'model', metric: 'risk_score_change', value: project.riskScore - ctx.previousRisk, operator: '>=', threshold: T.riskIncreasePoints },
      owner: owner(project, 'PRIMARY'),
      action: 'Review what changed since the last assessment and confirm the recorded inputs.',
      outcome: 'Change explained or corrected in the record.',
      intervention: false,
    });
  }

  /* ------------------------------------------------------------ lifecycle */
  if (current?.status === 'BLOCKED') {
    const b = current.blockedBy[0];
    push({
      code: 'STAGE_BLOCKED',
      category: 'dependency',
      severity: 'Critical',
      title: `${stageName} blocked by ${b.role.toLowerCase()}`,
      reason: current.explanation,
      trigger: { source: 'lifecycle', metric: 'gating_dependency_pending_share', value: Number(b.share.toFixed(2)), operator: '>=', threshold: 0.4 },
      owner: owner(project, b.code),
      supporting: ['DISTRICT_HEAD'],
      action: `Escalate the pending ${b.role.toLowerCase()} action on ${b.pendingCases.toLocaleString('en-IN')} cases to ${nodeByCode(project, b.code)?.name ?? b.name}.`,
      outcome: 'Gating clearance issued so the stage can proceed.',
    });
  } else if (current?.status === 'DELAYED') {
    const sev = current.delayDays > T.deadlineCriticalDays ? 'Critical' : current.delayDays > T.deadlineHighDays ? 'High' : 'Medium';
    push({
      code: 'DEADLINE_BREACH',
      category: 'schedule',
      severity: sev,
      title: `${stageName} deadline passed ${current.delayDays} days ago`,
      reason: current.explanation,
      trigger: { source: 'lifecycle', metric: 'stage_delay_days', value: current.delayDays, operator: '>', threshold: 0 },
      owner: owner(project, 'DISTRICT_HEAD'),
      supporting: ['LA_OFFICER', 'PRIMARY'],
      action: 'Re-baseline the stage with a dated recovery plan and review it fortnightly.',
      outcome: 'Revised milestone date agreed with the requiring body.',
    });
  }

  const residual = project.lifecycle?.residualBacklog ?? 0;
  if (residual >= Math.max(T.residualBacklogMin, project.totalParcels * T.residualBacklogShare)) {
    const worst = stages.filter((s) => s.status === 'COMPLETED' && s.openCases > 0).sort((a, b) => b.openCases - a.openCases)[0];
    push({
      code: 'CASE_BACKLOG',
      category: 'backlog',
      severity: residual >= project.totalParcels * T.residualBacklogHighShare ? 'High' : 'Medium',
      title: `${residual.toLocaleString('en-IN')} residual cases open in completed stages`,
      reason: `Stages already completed still carry ${residual.toLocaleString('en-IN')} unresolved cases${worst ? ` — the largest share in ${worst.name} (${worst.openCases.toLocaleString('en-IN')} open, ${worst.resolutionPct}% resolved)` : ''}.`,
      trigger: { source: 'lifecycle', metric: 'residual_open_cases', value: residual, operator: '>=', threshold: Math.round(Math.max(T.residualBacklogMin, project.totalParcels * T.residualBacklogShare)) },
      stage: worst?.name,
      owner: owner(project, 'LA_OFFICER'),
      action: 'Run a residual-case disposal drive for the completed stages, oldest cases first.',
      outcome: 'Residual cases resolved or referred to the dispute forum.',
    });
  }

  if ((project.lifecycle?.timelineOverrunDays ?? 0) >= T.timelineOverrunDays) {
    push({
      code: 'TIMELINE_OVERRUN',
      category: 'schedule',
      severity: project.lifecycle.timelineOverrunDays >= 300 ? 'High' : 'Medium',
      title: `Forecast completion ${project.lifecycle.timelineOverrunDays} days beyond target`,
      reason: `At the current working schedule the acquisition completes around ${project.lifecycle.forecastCompletion}, against a sanctioned target of ${project.targetCompletionDate}.`,
      trigger: { source: 'lifecycle', metric: 'timeline_overrun_days', value: project.lifecycle.timelineOverrunDays, operator: '>=', threshold: T.timelineOverrunDays },
      owner: owner(project, 'PRIMARY'),
      action: 'Re-baseline the project timeline and flag the land-availability impact on construction.',
      outcome: 'Approved revised schedule.',
      intervention: false,
    });
  }

  /* --------------------------------------------------------- compensation */
  const ci = project.currentStageIndex;
  // A compensation stage that has only just opened is not a backlog yet.
  const compensationDue = ci >= 6 || (ci === 5 && (current?.status !== 'IN_PROGRESS' || current.daysElapsed >= current.plannedDays * 0.3));
  if (compensationDue) {
    const min = ci === 5 ? T.compensationStageMinPct : T.possessionStageMinCompPct;
    const critical = ci === 5 ? T.compensationStageCriticalPct : T.possessionStageCriticalCompPct;
    if (project.compensationCompletionPct < min) {
      push({
        code: 'COMPENSATION_BACKLOG',
        category: 'compensation',
        severity: project.compensationCompletionPct < critical ? 'Critical' : 'High',
        title: 'Compensation backlog requires intervention',
        reason: `Compensation is ${pct(project.compensationCompletionPct)} complete across parcels due for payment while the project is at ${stageName}; at least ${min}% is expected by this stage.`,
        trigger: { source: 'rule', metric: 'compensation_completion_percentage', value: project.compensationCompletionPct, operator: '<', threshold: min },
        owner: owner(project, 'LA_OFFICER'),
        supporting: ['TREASURY', 'PRIMARY'],
        action: 'Review the disbursement register parcel by parcel, clear bank / title exceptions and pre-position the treasury release.',
        outcome: `Compensation completion above ${min}%.`,
        caseIds: ctx.caseSamples?.compensation,
      });
    }
  }

  /* ---------------------------------------------------------------- legal */
  const legalPer100 = (project.legalCases / Math.max(1, project.totalParcels)) * 100;
  const disputeShare = project.legalDisputeParcels / Math.max(1, project.totalParcels);
  if (legalPer100 >= T.legalCasesPer100Parcels || disputeShare >= T.legalDisputeParcelShare) {
    push({
      code: 'LEGAL_ESCALATION',
      category: 'legal',
      severity: legalPer100 >= T.legalCasesHighPer100Parcels ? 'High' : 'Medium',
      title: 'Escalate legal review',
      reason: `${project.legalCases.toLocaleString('en-IN')} legal cases across ${project.legalDisputeParcels.toLocaleString('en-IN')} parcels (${legalPer100.toFixed(1)} per 100 parcels, ${pct(disputeShare * 100)} of parcels disputed).`,
      trigger: { source: 'rule', metric: 'legal_cases_per_100_parcels', value: Number(legalPer100.toFixed(1)), operator: '>=', threshold: T.legalCasesPer100Parcels },
      owner: owner(project, 'DISPUTE_FORUM', 'LA_OFFICER'),
      assignedRole: 'LEGAL_OFFICER',
      supporting: ['LA_OFFICER'],
      action: 'Prepare a case-wise status note and seek consolidated hearings for parcels with multiple petitions.',
      outcome: 'Hearing calendar fixed for the highest-impact cases.',
      caseIds: ctx.caseSamples?.legal,
    });
  }

  /* -------------------------------------------------------- documentation */
  if (ci <= 5 && project.avgDocumentCompleteness < T.documentationMinPct) {
    push({
      code: 'DOCUMENT_VERIFICATION',
      category: 'documentation',
      severity: project.avgDocumentCompleteness < T.documentationHighPct ? 'High' : 'Medium',
      title: 'Initiate document verification',
      reason: `Average document completeness is ${pct(project.avgDocumentCompleteness)} (threshold ${T.documentationMinPct}%) with the project at ${stageName}.`,
      trigger: { source: 'rule', metric: 'documentation_completeness', value: project.avgDocumentCompleteness, operator: '<', threshold: T.documentationMinPct },
      owner: owner(project, 'LAND_RECORDS'),
      supporting: ['SUB_DIVISION'],
      action: 'Run a time-bound record-of-rights verification drive for incomplete files.',
      outcome: `Document completeness above ${T.documentationMinPct}%.`,
      caseIds: ctx.caseSamples?.documentation,
    });
  }

  if ((ctx.rejectedDocuments ?? 0) > 0) {
    push({
      code: 'DOCUMENT_REJECTED',
      category: 'documentation',
      severity: 'Medium',
      title: `${ctx.rejectedDocuments} document${ctx.rejectedDocuments === 1 ? '' : 's'} rejected on review`,
      reason: 'Documents uploaded to the repository were rejected by a reviewer and need resubmission.',
      trigger: { source: 'documents', metric: 'rejected_documents', value: ctx.rejectedDocuments, operator: '>', threshold: 0 },
      owner: owner(project, 'LAND_RECORDS'),
      action: 'Resubmit the rejected documents with the corrections noted by the reviewer.',
      outcome: 'Documents verified.',
      intervention: false,
    });
  }

  /* ---------------------------------------------------- approvals & deps */
  const currentDep = project.stageDependency?.[ci];
  const approvalMean = currentDep ? Math.round(currentDep.approvalDelayMean) : project.approvalDelayDays;
  const pendingNodes = (project.network?.nodes ?? [])
    .filter((n) => (n.pendingShareCurrentStage ?? 0) > 0)
    .sort((a, b) => (b.pendingShareCurrentStage ?? 0) - (a.pendingShareCurrentStage ?? 0));

  if (approvalMean >= T.approvalDelayDays) {
    const gate = pendingNodes.find((n) => n.gate) ?? pendingNodes[0];
    push({
      code: 'APPROVAL_ESCALATION',
      category: 'approval',
      severity: approvalMean >= T.approvalDelayHighDays ? 'High' : 'Medium',
      title: 'Escalate pending approval',
      reason: `Approvals and clearances on open ${stageName} cases have been pending ${approvalMean} days on average${gate ? `; the largest pending share sits with ${gate.name}` : ''}.`,
      trigger: { source: 'rule', metric: 'approval_delay_days', value: approvalMean, operator: '>=', threshold: T.approvalDelayDays },
      owner: gate ? owner(project, gate.code) : owner(project, 'DISTRICT_HEAD'),
      assignedRole: gate && (gate.level === 'central' || gate.level === 'state') ? 'STATE_ADMIN' : 'DISTRICT_ADMIN',
      supporting: ['DISTRICT_HEAD'],
      action: `Escalate the outstanding approval to ${gate?.name ?? 'the responsible department'} with a dated request for disposal.`,
      outcome: `Average approval delay below ${T.approvalDelayDays} days.`,
    });
  }

  if (current?.status !== 'BLOCKED') {
    const worstDep = pendingNodes.find((n) => n.pendingShareCurrentStage >= T.dependencyPendingShare);
    if (worstDep) {
      push({
        code: 'DEPENDENCY_PENDING',
        suffix: worstDep.code,
        category: 'dependency',
        severity: worstDep.gate && worstDep.pendingShareCurrentStage >= T.dependencyPendingHighShare ? 'High' : 'Medium',
        title: `${worstDep.role} action pending on ${pct(worstDep.pendingShareCurrentStage * 100)} of ${stageName} cases`,
        reason: `${worstDep.name}: ${worstDep.pendingActionText.toLowerCase()} — pending on ${worstDep.pendingCurrentStage.toLocaleString('en-IN')} open cases in the current stage.`,
        trigger: { source: 'dependency', metric: 'pending_share_current_stage', value: worstDep.pendingShareCurrentStage, operator: '>=', threshold: T.dependencyPendingShare },
        owner: owner(project, worstDep.code),
        action: `Agree a disposal date with ${worstDep.name} for the pending cases and track it at the district review.`,
        outcome: 'Pending department actions cleared on the current stage.',
      });
    }
  }

  const departmentsPending = pendingNodes.filter((n) => n.pendingShareCurrentStage >= 0.1).length;
  if (project.coordinationScore < T.coordinationMinScore && departmentsPending >= T.coordinationPendingDepartments) {
    push({
      code: 'COORDINATION_ESCALATION',
      category: 'coordination',
      severity: 'High',
      title: 'Cross-department escalation',
      reason: `Coordination score ${project.coordinationScore}/100 across ${project.network.dependencyCount} dependent authorities, with actions pending in ${departmentsPending} departments at once.`,
      trigger: { source: 'rule', metric: 'department_coordination_score', value: project.coordinationScore, operator: '<', threshold: T.coordinationMinScore },
      owner: owner(project, 'DISTRICT_HEAD'),
      assignedRole: 'STATE_ADMIN',
      supporting: pendingNodes.slice(0, 3).map((n) => n.code),
      action: 'Convene a joint review of all departments with pending actions and fix a single tracker with owners and dates.',
      outcome: 'One consolidated action plan across departments.',
    });
  }

  /* -------------------------------------------------------------- R&R etc */
  if (project.rrRequiredParcels > 0 && ci >= 6 && (project.rrProgressPct ?? 0) < T.rrMinProgressPct) {
    push({
      code: 'RR_REVIEW',
      category: 'rr',
      severity: (project.rrProgressPct ?? 0) < T.rrHighProgressPct ? 'High' : 'Medium',
      title: 'R&R progress review',
      reason: `R&R is ${pct(project.rrProgressPct ?? 0)} delivered for ${project.rrCases.toLocaleString('en-IN')} R&R cases while the project is at ${stageName}.`,
      trigger: { source: 'rule', metric: 'rehabilitation_completion_percentage', value: project.rrProgressPct ?? 0, operator: '<', threshold: T.rrMinProgressPct },
      owner: owner(project, 'RR_ADMIN'),
      supporting: ['DISTRICT_HEAD'],
      action: 'Verify entitlement delivery family by family and confirm resettlement site readiness.',
      outcome: `R&R delivery above ${T.rrMinProgressPct}%.`,
    });
  }

  if (project.stakeholderResponsiveness === 'Low' && ci >= 1 && ci <= 6) {
    push({
      code: 'STAKEHOLDER_FOLLOWUP',
      category: 'stakeholder',
      severity: 'Medium',
      title: 'Stakeholder follow-up',
      reason: `Landowner and stakeholder responsiveness is recorded as Low during ${stageName}.`,
      trigger: { source: 'rule', metric: 'stakeholder_responsiveness', value: 'Low', operator: '=', threshold: 'Low' },
      owner: owner(project, 'SUB_DIVISION'),
      assignedRole: 'FIELD_OFFICER',
      action: 'Hold village-level camps with the revenue team and follow up individually with non-responsive owners.',
      outcome: 'Notices acknowledged and claims filed.',
    });
  }

  if (ci >= 6 && ci <= 7 && (project.possessionCompletionPct ?? 0) < T.possessionMinPct) {
    push({
      code: 'POSSESSION_DRIVE',
      category: 'possession',
      severity: 'Medium',
      title: 'Possession lagging',
      reason: `Possession is ${pct(project.possessionCompletionPct ?? 0)} complete with the project at ${stageName}.`,
      trigger: { source: 'rule', metric: 'possession_completion_percentage', value: project.possessionCompletionPct ?? 0, operator: '<', threshold: T.possessionMinPct },
      owner: owner(project, 'LA_OFFICER'),
      assignedRole: 'FIELD_OFFICER',
      supporting: ['PRIMARY', 'UTILITIES'],
      action: 'Schedule joint possession and handover with the requiring body, parcel block by parcel block.',
      outcome: `Possession above ${T.possessionMinPct}%.`,
    });
  }

  /* --------------------------------------------------- model contributors */
  const top = (project.contributors ?? [])[0];
  if (top && CONTRIBUTOR_ACTION[top.group] && (project.riskBand === 'High' || project.riskBand === 'Critical' || project.riskBand === 'Medium')) {
    const map = CONTRIBUTOR_ACTION[top.group];
    // The leading driver of a High / Critical prediction becomes an owned
    // intervention in its own right, so an officer acts on why the model is
    // worried even when no threshold rule has fired yet.
    const escalate = (project.riskBand === 'High' || project.riskBand === 'Critical') && top.share >= 0.2;
    push({
      code: 'MODEL_CONTRIBUTOR',
      category: map.category,
      severity: escalate ? 'Medium' : 'Low',
      title: `Leading model contributor: ${top.group}`,
      reason: `${top.group} carries ${pct(top.share * 100)} of the risk-increasing SHAP contribution across this project's open cases. A contribution explains the prediction; it is not proof of cause.`,
      trigger: { source: 'model', metric: 'shap_share', value: top.share, operator: 'top', threshold: null },
      owner: owner(project, map.owner),
      action: map.action,
      outcome: 'Contributor addressed or explained at the next review.',
      alert: false,
      intervention: escalate,
    });
  }

  return out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

/** Rules applied to a scenario (no case data, no lifecycle history). */
export function evaluateScenario(scenario, ctx = {}) {
  return evaluateProject(scenario, ctx).filter((r) => r.code !== 'CASE_BACKLOG' && r.code !== 'TIMELINE_OVERRUN');
}

/**
 * Case-level recommendations: which unresolved actions hold this parcel back
 * and who owns them. Uses the case record and the project's network only.
 */
export function evaluateCase(c, project) {
  const out = [];
  const nodes = project?.network?.nodes ?? [];
  const add = (code, category, severity, title, reason, ownerCode, action) => {
    const node = nodes.find((n) => n.code === ownerCode) ?? nodes.find((n) => n.code === 'LA_OFFICER');
    out.push({
      code,
      category,
      severity,
      priority: PRIORITY[severity],
      title,
      reason,
      responsibleAuthority: node ? { code: node.code, name: node.name, role: node.role } : null,
      assignedRole: node ? roleForDependency(node) : 'LAND_ACQUISITION_OFFICER',
      recommendedAction: action,
    });
  };
  for (const code of c.pendingDependencies ?? []) {
    const node = nodes.find((n) => n.code === code);
    if (!node) continue;
    add(`PENDING_${code}`, 'dependency', node.gate ? 'High' : 'Medium', `${node.role}: action pending`, `${node.pendingActionText} on this parcel${c.approvalDelayDays ? ` (approvals outstanding ${c.approvalDelayDays} days)` : ''}.`, code, `Obtain a disposal date from ${node.name}.`);
  }
  if (c.stageIndex >= 5 && c.compensationCompletionPct < 60) {
    add('CASE_COMPENSATION', 'compensation', c.compensationCompletionPct < 30 ? 'High' : 'Medium', 'Compensation outstanding', `${c.compensationCompletionPct}% of compensation paid; pending ${c.compensationPendingDays} days.`, 'LA_OFFICER', 'Verify award, bank details and title before release.');
  }
  if (c.legalCases > 0) {
    add('CASE_LEGAL', 'legal', c.legalCases >= 3 ? 'High' : 'Medium', `${c.legalCases} legal case${c.legalCases > 1 ? 's' : ''} open`, `Dispute complexity ${c.disputeComplexity}.`, 'DISPUTE_FORUM', 'Record case status and seek an early hearing date.');
  }
  if (c.documentCompleteness !== null && c.documentCompleteness < 70) {
    add('CASE_DOCUMENTS', 'documentation', 'Medium', 'Record verification incomplete', `Document completeness ${c.documentCompleteness}%, verification ${c.verificationStatus}.`, 'LAND_RECORDS', 'Reconcile the record of rights and complete verification.');
  }
  if (c.ownership === 'Disputed' || c.ownership === 'Fragmented') {
    add('CASE_TITLE', 'documentation', c.ownership === 'Disputed' ? 'High' : 'Low', `${c.ownership} ownership`, `${c.owners ?? 'Unknown number of'} recorded owners.`, 'LAND_RECORDS', 'Hold a title scrutiny with all recorded owners.');
  }
  if (c.inactivityDays > 60) {
    add('CASE_DORMANT', 'schedule', c.inactivityDays > 120 ? 'High' : 'Medium', 'File dormant', `No recorded action for ${c.inactivityDays} days.`, 'LA_OFFICER', 'Reopen the file and set the next dated action.');
  }
  const top = (c.contributors ?? []).find((x) => x.value > 0);
  if (top && CONTRIBUTOR_ACTION[top.group]) {
    const map = CONTRIBUTOR_ACTION[top.group];
    add('CASE_MODEL_CONTRIBUTOR', map.category, 'Low', `Leading model contributor: ${top.group}`, `TreeSHAP attributes the largest risk-increasing share of this case's prediction to ${top.group}.`, map.owner, map.action);
  }
  return out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}
