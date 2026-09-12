/**
 * Intervention prompts keyed by the contributor group carrying the most
 * predicted risk.
 *
 * These are prompts for a human reviewer — the platform never actions them
 * itself, and a contribution is a statement about the model's prediction, not a
 * finding that the factor caused a delay.
 */
export const INTERVENTION = {
  Compensation: {
    action: 'Verify pending compensation and pre-clear treasury release',
    owner: 'Land Acquisition Officer + District Treasury',
    detail:
      'Disbursement lag is carrying the largest share of this prediction. Confirm award status parcel by parcel and pre-position treasury clearance before the milestone date.',
  },
  'Legal disputes': {
    action: 'Review unresolved legal cases and seek consolidated early hearings',
    owner: 'Competent Authority (LA) + Standing Counsel',
    detail:
      'Open litigation dominates the predicted risk here. A consolidated hearing calendar and a case-wise status note are the fastest levers available.',
  },
  'Ownership complexity': {
    action: 'Run a joint revenue-legal title scrutiny camp for fragmented holdings',
    owner: 'Tehsildar (Revenue) + Sub-Registrar',
    detail:
      'Fragmented or disputed title chains need repeated verification cycles. A single scrutiny camp usually removes several of those cycles.',
  },
  'Documentation & verification': {
    action: 'Close mutation and record-verification gaps in a time-bound drive',
    owner: 'District Revenue Office',
    detail:
      'Incomplete records are the strongest single signal in the portfolio. Award declaration cannot proceed until mutation and khatauni entries reconcile.',
  },
  Inactivity: {
    action: 'Reopen the file and restore a weekly action cadence',
    owner: 'PIU Monitoring Cell',
    detail:
      'Long gaps since the last recorded action are strongly associated with missed milestones. Re-establish an owner and a weekly review slot.',
  },
  'Stage schedule pressure': {
    action: 'Re-sequence the stage plan and add field capacity to the critical path',
    owner: 'Project Director, PIU',
    detail:
      'Time consumed in the stage is running ahead of work completed. Either the plan or the capacity has to move.',
  },
  'Stakeholder responsiveness': {
    action: 'Escalate stakeholder follow-up and schedule a village-level camp',
    owner: 'Competent Authority (LA)',
    detail:
      'Low landowner and stakeholder responsiveness is holding the file. A village-level camp with the revenue team usually clears the backlog faster than notices.',
  },
  'Administrative response time': {
    action: 'Move the file to a tracked workflow with a 21-day disposal norm',
    owner: 'District Collector — Revenue',
    detail: 'Departmental turnaround is above the norm for this district. Tracked movement is the cheapest correction.',
  },
  'Rehabilitation & resettlement': {
    action: 'Confirm R&R entitlements and resettlement site readiness',
    owner: 'R&R Administrator',
    detail: 'Outstanding R&R entitlements block possession certification even where land is legally acquired.',
  },
  'Historical stage performance': {
    action: 'Apply the stage playbook used on comparable corridors and review weekly',
    owner: 'PIU Monitoring Cell',
    detail: 'This stage slips more often than any other across the portfolio; treat the plan as optimistic by default.',
  },
  'District performance history': {
    action: 'Convene a district review with the Collectorate on chronic bottlenecks',
    owner: 'District Collector — Revenue',
    detail: 'The district itself carries a higher historical delay rate than its peers, independently of this case.',
  },
  'Authority performance history': {
    action: 'Raise the case at the authority-level monthly review',
    owner: 'Regional Officer',
    detail: 'The implementing authority has a weaker milestone record than comparable agencies on this stage.',
  },
  Possession: {
    action: 'Issue possession notices and schedule joint handover',
    owner: 'Land Acquisition Officer',
    detail: 'Possession formalities are the binding step for this parcel block.',
  },
  'Affected families': {
    action: 'Plan a consultation round with affected families before the next milestone',
    owner: 'Social Development Officer',
    detail: 'A high affected-family count raises objection and claim volumes; early consultation reduces late surprises.',
  },
  'Parcel & project attributes': {
    action: 'Re-examine the parcel schedule for this stretch with the survey wing',
    owner: 'Survey & Settlement Wing',
    detail: 'Parcel size, land use and project scale are shaping this prediction more than case-specific conduct.',
  },
  Geography: {
    action: 'Check field access and seasonal constraints with the district team',
    owner: 'Survey & Settlement Wing',
    detail: 'Location-linked effects are prominent here — field access and seasonal windows are worth confirming.',
  },
  Other: {
    action: 'Review the case at the next weekly monitoring meeting',
    owner: 'PIU Monitoring Cell',
    detail: 'No single factor dominates; a routine review is the proportionate response.',
  },
};

export const interventionFor = (group) => INTERVENTION[group] ?? INTERVENTION.Other;
