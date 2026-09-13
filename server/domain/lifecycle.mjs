/**
 * Lifecycle engine — the one place stage status is decided.
 *
 * Three concepts are kept apart on purpose:
 *
 *   STAGE STATUS   where the project stands on the statutory timeline
 *                  (PENDING · IN_PROGRESS · COMPLETED · DELAYED · BLOCKED)
 *   CASE BACKLOG   how many individual cases attached to that stage are still
 *                  unresolved (a completed stage can carry residual cases)
 *   PARCEL STATUS  the physical position of each parcel (possession etc.),
 *                  carried on the case record itself
 *
 * A statutory stage closes for the project when its milestone is achieved —
 * the notification is published, the award is declared. Individual objections,
 * references or payments against that stage can remain open afterwards. The
 * engine therefore never reports "Completed" and "73 open" side by side
 * without saying which is which.
 *
 * Rules are deterministic and live here only; the build step, the API, the
 * dashboard, alerts and interventions all read the result.
 */
import { LIFECYCLE_STAGES } from './registry.mjs';

const MS_DAY = 86400000;
export const dayFromISO = (iso) =>
  Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_DAY);
export const isoFromDay = (day) => new Date(day * MS_DAY).toISOString().slice(0, 10);

export const STAGE_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'BLOCKED'];

export const LIFECYCLE_RULES = {
  /** A gating dependency blocks the frontier stage once it is pending on this share of the stage's open cases… */
  blockGateShare: 0.4,
  /** …and either approvals have been pending this long on average, or the deadline has passed. */
  blockApprovalDays: 45,
};

const fmt = (iso) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

/**
 * @param project   registry project: stages[], currentStageIndex, network.nodes
 * @param opts.todayDay        snapshot day number
 * @param opts.stageRisk       per-stage model risk ({ riskScore, openCases } | null)
 * @param opts.stageDependency per-stage { pending: {CODE: openCasesPending}, approvalDelayMean }
 */
export function deriveLifecycle(project, { todayDay, stageRisk = [], stageDependency = [] }) {
  const frontier = project.currentStageIndex;
  const nodes = project.network?.nodes ?? [];

  const stages = project.stages.map((s, i) => {
    const open = s.openCases ?? 0;
    const total = s.totalCases ?? 0;
    const resolved = Math.max(0, total - open);
    const resolutionPct = total ? Number(((resolved / total) * 100).toFixed(1)) : null;
    const startIso = s.actualStart ?? s.plannedStart;
    const startDay = dayFromISO(startIso);
    const deadlineDay = dayFromISO(s.expectedCompletion);
    const dep = stageDependency[i] ?? { pending: {}, approvalDelayMean: 0 };

    let status;
    let delayDays = 0;
    let daysElapsed = 0;
    let daysRemaining = 0;
    let blockedBy = [];

    if (s.actualCompletion) {
      status = 'COMPLETED';
      const endDay = dayFromISO(s.actualCompletion);
      delayDays = Math.max(0, endDay - deadlineDay);
      daysElapsed = endDay - startDay;
    } else if (i === frontier) {
      daysElapsed = Math.max(0, todayDay - startDay);
      daysRemaining = deadlineDay - todayDay;
      delayDays = Math.max(0, -daysRemaining);
      if (open > 0) {
        blockedBy = nodes
          .filter((n) => n.gate && n.stages.includes(s.name))
          .map((n) => ({ code: n.code, name: n.name, role: n.role, pendingCases: dep.pending[n.code] ?? 0, share: (dep.pending[n.code] ?? 0) / open }))
          .filter((b) => b.share >= LIFECYCLE_RULES.blockGateShare);
      }
      if (blockedBy.length && (dep.approvalDelayMean >= LIFECYCLE_RULES.blockApprovalDays || daysRemaining < 0)) status = 'BLOCKED';
      else if (daysRemaining < 0) status = 'DELAYED';
      else status = 'IN_PROGRESS';
      if (status !== 'BLOCKED') blockedBy = [];
    } else {
      status = 'PENDING';
      daysRemaining = s.plannedDays;
    }

    const caseBacklog = open > 0 ? 'OPEN' : total > 0 ? 'CLEARED' : 'NONE';

    let explanation;
    if (status === 'COMPLETED') {
      explanation =
        open > 0
          ? `Statutory stage completed on ${fmt(s.actualCompletion)}${delayDays ? ` (${delayDays} days after its working deadline)` : ''}. ${open.toLocaleString('en-IN')} residual case${open === 1 ? '' : 's'} remain open — ${resolutionPct}% of ${total.toLocaleString('en-IN')} resolved.`
          : `Statutory stage completed on ${fmt(s.actualCompletion)}; all ${total.toLocaleString('en-IN')} associated cases resolved.`;
    } else if (status === 'BLOCKED') {
      explanation = `Blocked: ${blockedBy.map((b) => `${b.role} (${Math.round(b.share * 100)}% of open cases)`).join(', ')} pending${dep.approvalDelayMean ? `, approvals outstanding ${Math.round(dep.approvalDelayMean)} days on average` : ''}. ${open.toLocaleString('en-IN')} cases open.`;
    } else if (status === 'DELAYED') {
      explanation = `Working deadline ${fmt(s.expectedCompletion)} passed ${delayDays} days ago; ${open.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} cases still open.`;
    } else if (status === 'IN_PROGRESS') {
      explanation = `In progress since ${fmt(startIso)} — ${daysElapsed} of ${s.plannedDays} planned days used, deadline ${fmt(s.expectedCompletion)}; ${open.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} cases open.`;
    } else {
      explanation =
        open > 0
          ? `Not yet started at project level. ${open.toLocaleString('en-IN')} parcel${open === 1 ? ' is' : 's are'} already progressing ahead of the project frontier.`
          : `Not started. Planned to run ${s.plannedDays} days from ${fmt(s.plannedStart)}.`;
    }

    const risk = stageRisk[i];
    return {
      ...s,
      stageName: s.name,
      status,
      startDate: startIso,
      plannedCompletion: s.expectedCompletion,
      delayDays,
      daysElapsed,
      daysRemaining,
      openCases: open,
      resolvedCases: resolved,
      totalCases: total,
      resolutionPct,
      caseBacklog,
      parcelsAhead: status === 'PENDING' ? open : 0,
      blockedBy,
      approvalDelayMean: Math.round(dep.approvalDelayMean ?? 0),
      riskProbability: risk && risk.riskScore !== null && risk.riskScore !== undefined ? Number((risk.riskScore / 100).toFixed(2)) : null,
      explanation,
    };
  });

  const current = stages[frontier];
  const remainingPlanned = stages.slice(frontier + 1).reduce((a, s) => a + s.plannedDays, 0);
  const forecastDay = Math.max(dayFromISO(current.expectedCompletion), todayDay) + remainingPlanned;
  const targetDay = dayFromISO(project.targetCompletionDate);

  return {
    stages,
    currentStatus: current.status,
    isDelayed: current.status === 'DELAYED' || current.status === 'BLOCKED',
    isBlocked: current.status === 'BLOCKED',
    residualBacklog: stages.filter((s) => s.status === 'COMPLETED').reduce((a, s) => a + s.openCases, 0),
    parcelsAhead: stages.filter((s) => s.status === 'PENDING').reduce((a, s) => a + s.openCases, 0),
    forecastCompletion: isoFromDay(forecastDay),
    timelineOverrunDays: Math.max(0, forecastDay - targetDay),
    notificationStatus:
      frontier < 2
        ? 'Not yet notified'
        : frontier === 2
          ? `In progress — ${stages[2].milestone}`
          : `Notified — ${stages[2].milestone}`,
  };
}

export { LIFECYCLE_STAGES };
