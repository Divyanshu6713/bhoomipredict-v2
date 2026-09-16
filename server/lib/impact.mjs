/**
 * Predicted impact of a corrective action.
 *
 * Each recommendation category maps to a concrete, achievable change in the
 * project's model inputs (compensation completion +25 points, legal cases
 * halved, approvals cleared to 30 days, …). The project profile is re-scored
 * with the deployed ensemble before and after that change, and the difference
 * in log-odds is applied to the project's current risk — the same mechanism
 * used for recorded edits. Recommendations are then ranked by severity and by
 * this predicted reduction, which is what makes them predictive rather than
 * just threshold alerts.
 *
 * It is the model's response to the change, not a guarantee: the model learns
 * association, not cause, and the UI says so beside every figure.
 */

const logit = (p) => {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
};
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const num = (v, fallback = 0) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? fallback : Number(v));
const pct = (v) => `${Math.round(v)}%`;

const compensationStatusOf = (v) => (v > 92 ? 'Paid' : v > 55 ? 'Partially Paid' : v > 18 ? 'Awarded' : v > 3 ? 'Assessed' : 'Not Initiated');
const disputeFromRate = (perParcel) => (perParcel <= 0 ? 'None' : perParcel < 0.25 ? 'Low' : perParcel < 0.6 ? 'Moderate' : 'High');

/** Category → what the action changes in the model inputs, and how that reads. */
export const ACTION_EFFECTS = {
  compensation: (r) => {
    const from = num(r.compensation_completion_percentage);
    const to = Math.min(100, Math.max(from, from + 25));
    return {
      patch: { compensation_completion_percentage: to, compensation_status: compensationStatusOf(to), compensation_pending_days: r.compensation_pending_days === '' ? '' : Math.round(num(r.compensation_pending_days) / 2) },
      change: `Compensation completion ${pct(from)} → ${pct(to)}`,
    };
  },
  legal: (r) => {
    const from = num(r.legal_case_count);
    return {
      patch: { legal_case_count: from / 2, legal_dispute: num(r.legal_dispute) / 2, dispute_complexity: disputeFromRate(from / 2) },
      change: 'Open legal cases halved through consolidated hearings',
    };
  },
  documentation: (r) => {
    const from = num(r.document_completeness, 60);
    const to = Math.max(from, 85);
    return { patch: { document_completeness: to, verification_status: 'Verified' }, change: `Document completeness ${pct(from)} → ${pct(to)}, records verified` };
  },
  approval: (r) => {
    const from = num(r.approval_delay_days);
    return { patch: { approval_delay_days: Math.min(from, 30), approval_status: 'Under Review' }, change: `Average approval delay ${Math.round(from)} → ${Math.round(Math.min(from, 30))} days` };
  },
  dependency: (r) => ({
    patch: { pending_dependency_actions: num(r.pending_dependency_actions) / 2, department_coordination_score: Math.min(100, num(r.department_coordination_score, 60) + 10) },
    change: 'Pending department actions halved, coordination score +10',
  }),
  coordination: (r) => ({
    patch: { pending_dependency_actions: num(r.pending_dependency_actions) * 0.6, department_coordination_score: Math.min(100, num(r.department_coordination_score, 60) + 15) },
    change: 'Coordination score +15, pending department actions −40%',
  }),
  rr: (r) => {
    const from = num(r.rr_progress_percentage, 30);
    const to = Math.max(from, 75);
    return { patch: { rr_progress_percentage: to, rr_status: to > 95 ? 'Complete' : 'In Progress' }, change: `R&R delivery ${pct(from)} → ${pct(to)}` };
  },
  stakeholder: (r) => ({
    patch: { stakeholder_responsiveness: r.stakeholder_responsiveness === 'Low' ? 'Moderate' : 'High' },
    change: `Stakeholder responsiveness ${r.stakeholder_responsiveness || 'Moderate'} → ${r.stakeholder_responsiveness === 'Low' ? 'Moderate' : 'High'}`,
  }),
  schedule: (r) => {
    const from = num(r.inactivity_days, 45);
    return { patch: { inactivity_days: Math.min(from, 15) }, change: `Days since last recorded action ${Math.round(from)} → ${Math.round(Math.min(from, 15))} (weekly cadence restored)` };
  },
  backlog: (r) => {
    const from = num(r.inactivity_days, 45);
    return { patch: { inactivity_days: Math.min(from, 20) }, change: `Residual files reactivated: inactivity ${Math.round(from)} → ${Math.round(Math.min(from, 20))} days` };
  },
  possession: (r) => ({
    patch: { possession_status: r.possession_status === 'Complete' ? 'Complete' : 'Partial' },
    change: 'Possession moved to at least partial handover',
  }),
};

/** Model contributor group → the action category that addresses it. */
const GROUP_CATEGORY = {
  Compensation: 'compensation',
  'Legal disputes': 'legal',
  'Ownership complexity': 'documentation',
  'Documentation & verification': 'documentation',
  Inactivity: 'schedule',
  'Stage schedule pressure': 'schedule',
  'Stakeholder responsiveness': 'stakeholder',
  'Administrative response time': 'coordination',
  'Rehabilitation & resettlement': 'rr',
  'Pending department actions': 'dependency',
  'Approval delay': 'approval',
  'Inter-department coordination': 'coordination',
  'Authority dependencies': 'coordination',
  Possession: 'possession',
  'Affected families': 'stakeholder',
};

/**
 * Attach `impact` to every recommendation of a project and re-rank them.
 * @param score (record) → { logOdds } from the deployed model
 */
export function attachImpact(project, recommendations, record, score) {
  if (!record || !recommendations.length) return recommendations;
  const base = score(record).logOdds;
  const current = project.delayProbability ?? 0;
  const cache = new Map();
  for (const rec of recommendations) {
    let category = rec.category;
    if (category === 'risk') category = GROUP_CATEGORY[project.contributors?.[0]?.group] ?? 'schedule';
    const effect = ACTION_EFFECTS[category];
    if (!effect) continue;
    if (!cache.has(category)) {
      const { patch, change } = effect(record);
      const after = score({ ...record, ...patch }).logOdds;
      const projected = sigmoid(logit(current) + (after - base));
      cache.set(category, {
        riskPointsReduction: Number(((current - projected) * 100).toFixed(1)),
        projectedRiskScore: Math.min(99, Math.max(1, Math.round(projected * 100))),
        change,
      });
    }
    const hit = cache.get(category);
    rec.impact = {
      ...hit,
      material: hit.riskPointsReduction >= 0.5,
      basis: 'Deployed model re-scored with the change applied to this project’s inputs; a predicted response, not a guaranteed outcome.',
    };
  }
  const rank = { Low: 0, Medium: 1, High: 2, Critical: 3 };
  return recommendations.sort(
    (a, b) => rank[b.severity] - rank[a.severity] || (b.impact?.riskPointsReduction ?? -99) - (a.impact?.riskPointsReduction ?? -99),
  );
}
