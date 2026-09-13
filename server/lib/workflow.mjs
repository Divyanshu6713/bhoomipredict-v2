/**
 * Intervention queue and alert centre.
 *
 * Both are views over the same rule evaluation (server/domain/rules.mjs) held
 * on each effective project. Nothing is generated to fill the screen: an
 * intervention exists only while its rule condition holds; its workflow status
 * (and who changed it) is what persists.
 *
 *   intervention  OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED   (or DISMISSED)
 *   alert         UNREAD → ACKNOWLEDGED → RESOLVED
 */
import { effectiveProjects, getProject, ServiceError } from './projects.mjs';
import { getState, saveState, recordAudit } from './persistence.mjs';
import { inScope, ROLES, USERS } from '../domain/roles.mjs';
import { severityRank } from '../domain/rules.mjs';

export const INTERVENTION_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'];
export const ALERT_STATUSES = ['UNREAD', 'ACKNOWLEDGED', 'RESOLVED'];

const TRANSITIONS = {
  OPEN: ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED', 'DISMISSED', 'OPEN'],
  IN_PROGRESS: ['RESOLVED', 'ACKNOWLEDGED', 'DISMISSED'],
  RESOLVED: ['OPEN'],
  DISMISSED: ['OPEN'],
};

const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 86400000).toISOString();

function ensureRecord(bucket, id, defaults) {
  if (!bucket[id]) bucket[id] = { firstSeenAt: new Date().toISOString(), history: [], ...defaults };
  return bucket[id];
}

/** Interventions for every project, merged with persisted workflow state. */
export function allInterventions() {
  const state = getState();
  let created = false;
  const out = [];
  for (const p of effectiveProjects().list) {
    for (const r of p.recommendations) {
      if (!r.intervention || severityRank(r.severity) < 1) continue;
      if (!state.interventions[r.id]) created = true;
      const w = ensureRecord(state.interventions, r.id, { status: 'OPEN', assignedRole: r.assignedRole, assigneeId: null });
      out.push({
        intervention_id: r.id,
        id: r.id,
        project_id: p.id,
        projectId: p.id,
        projectName: p.name,
        state: p.state,
        district: p.district,
        districts: p.districts,
        projectType: p.type,
        stage: r.stage,
        case_id: r.caseIds[0] ?? null,
        caseIds: r.caseIds,
        priority: r.priority,
        severity: r.severity,
        category: r.category,
        code: r.code,
        title: r.title,
        reason: r.reason,
        risk_score: p.riskScore,
        riskBand: p.riskBand,
        trigger: r.trigger,
        responsible_department: r.responsibleAuthority.name,
        responsibleAuthority: r.responsibleAuthority,
        supportingAuthorities: r.supportingAuthorities,
        assigned_role: w.assignedRole ?? r.assignedRole,
        assignedRoleLabel: ROLES[w.assignedRole ?? r.assignedRole]?.label ?? w.assignedRole,
        assigneeId: w.assigneeId ?? null,
        assigneeName: w.assigneeId ? USERS.find((u) => u.id === w.assigneeId)?.name ?? null : null,
        recommended_action: r.recommendedAction,
        expectedOutcome: r.expectedOutcome,
        created_at: w.firstSeenAt,
        due_date: addDays(w.firstSeenAt, r.dueInDays),
        overdue: !['RESOLVED', 'DISMISSED'].includes(w.status) && Date.now() > new Date(addDays(w.firstSeenAt, r.dueInDays)).getTime(),
        status: w.status,
        note: w.note ?? null,
        updatedAt: w.updatedAt ?? null,
        updatedBy: w.updatedBy ?? null,
        history: w.history,
      });
    }
  }
  if (created) saveState();
  return out;
}

export function listInterventions(user, f = {}) {
  const projects = effectiveProjects().byId;
  let rows = allInterventions().filter((i) => inScope(user, projects.get(i.projectId)));
  const role = ROLES[user.role];
  if (f.mine === '1') rows = rows.filter((i) => i.assigned_role === user.role || i.assigneeId === user.id);
  if (f.focus === '1') rows = rows.filter((i) => role.focus.includes(i.category));
  if (f.status) rows = rows.filter((i) => f.status.split(',').includes(i.status));
  else if (f.includeClosed !== '1') rows = rows.filter((i) => !['RESOLVED', 'DISMISSED'].includes(i.status));
  if (f.severity) rows = rows.filter((i) => f.severity.split(',').includes(i.severity));
  if (f.category) rows = rows.filter((i) => f.category.split(',').includes(i.category));
  if (f.projectId) rows = rows.filter((i) => i.projectId === f.projectId);
  if (f.state) rows = rows.filter((i) => i.state === f.state);
  if (f.district) rows = rows.filter((i) => i.districts.includes(f.district));
  if (f.role) rows = rows.filter((i) => i.assigned_role === f.role);
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter((i) => `${i.title} ${i.projectName} ${i.responsible_department} ${i.reason}`.toLowerCase().includes(q));
  }

  const counts = {
    bySeverity: ['Critical', 'High', 'Medium'].map((s) => ({ key: s, count: rows.filter((r) => r.severity === s).length })),
    byStatus: INTERVENTION_STATUSES.map((s) => ({ key: s, count: rows.filter((r) => r.status === s).length })),
    byCategory: Object.entries(rows.reduce((m, r) => ((m[r.category] = (m[r.category] ?? 0) + 1), m), {})).map(([key, count]) => ({ key, count })),
    byDepartment: Object.entries(rows.reduce((m, r) => ((m[r.responsibleAuthority.role] = (m[r.responsibleAuthority.role] ?? 0) + 1), m), {}))
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    overdue: rows.filter((r) => r.overdue).length,
    mine: rows.filter((r) => r.assigned_role === user.role || r.assigneeId === user.id).length,
  };

  const sort = f.sort ?? 'priority';
  rows.sort((a, b) =>
    sort === 'due'
      ? a.due_date.localeCompare(b.due_date)
      : sort === 'risk'
        ? b.risk_score - a.risk_score
        : severityRank(b.severity) - severityRank(a.severity) || b.risk_score - a.risk_score,
  );
  const pageSize = Math.min(100, Math.max(1, Number(f.pageSize ?? 25)));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Number(f.page ?? 1)), pages);
  return { total: rows.length, page, pages, pageSize, counts, items: rows.slice((page - 1) * pageSize, page * pageSize).map(({ history, ...rest }) => rest) };
}

export function updateIntervention(user, id, patch) {
  const item = allInterventions().find((i) => i.id === id);
  if (!item) throw new ServiceError('Intervention not found or its trigger no longer holds', 404);
  if (!inScope(user, getProject(item.projectId))) throw new ServiceError('This intervention is outside your jurisdiction', 403);
  const state = getState();
  const w = state.interventions[id];
  const before = { status: w.status, assignedRole: w.assignedRole, assigneeId: w.assigneeId ?? null, note: w.note ?? null };
  const after = { ...before };

  if (patch.status && patch.status !== w.status) {
    if (!INTERVENTION_STATUSES.includes(patch.status)) throw new ServiceError(`Unknown status ${patch.status}`, 422);
    if (!TRANSITIONS[w.status].includes(patch.status)) throw new ServiceError(`Cannot move an intervention from ${w.status} to ${patch.status}`, 409);
    const ownsIt = item.assigned_role === user.role || item.assigneeId === user.id;
    const supervises = ['NATIONAL_ADMIN', 'STATE_ADMIN', 'DISTRICT_ADMIN'].includes(user.role);
    if (!ownsIt && !supervises) throw new ServiceError(`Only the assigned role (${item.assignedRoleLabel}) or a supervising administrator can change this intervention`, 403);
    if ((patch.status === 'RESOLVED' || patch.status === 'DISMISSED') && !patch.note) throw new ServiceError('A note is required to resolve or dismiss an intervention', 422);
    after.status = patch.status;
  }
  if (patch.assignedRole !== undefined || patch.assigneeId !== undefined) {
    if (!['NATIONAL_ADMIN', 'STATE_ADMIN', 'DISTRICT_ADMIN'].includes(user.role)) throw new ServiceError('Only administrators can reassign interventions', 403);
    if (patch.assignedRole !== undefined) {
      if (!ROLES[patch.assignedRole]) throw new ServiceError(`Unknown role ${patch.assignedRole}`, 422);
      after.assignedRole = patch.assignedRole;
    }
    if (patch.assigneeId !== undefined) {
      const assignee = patch.assigneeId ? USERS.find((u) => u.id === patch.assigneeId) : null;
      if (patch.assigneeId && !assignee) throw new ServiceError('Unknown assignee', 422);
      if (assignee && !inScope(assignee, getProject(item.projectId))) throw new ServiceError(`${assignee.name} has no jurisdiction over this project`, 422);
      after.assigneeId = assignee?.id ?? null;
      if (assignee) after.assignedRole = assignee.role;
    }
  }
  if (patch.note !== undefined) after.note = String(patch.note).slice(0, 1000);

  Object.assign(w, after, { updatedAt: new Date().toISOString(), updatedBy: user.id });
  w.history.push({ at: w.updatedAt, by: user.id, from: before, to: after });
  saveState();
  recordAudit({
    user,
    action: before.status !== after.status ? 'intervention.status_changed' : before.assigneeId !== after.assigneeId || before.assignedRole !== after.assignedRole ? 'intervention.assigned' : 'intervention.noted',
    entity: 'intervention',
    entityId: id,
    oldValue: before,
    newValue: after,
  });
  return allInterventions().find((i) => i.id === id);
}

/* ----------------------------------------------------------------- alerts */

export function allAlerts() {
  const state = getState();
  let created = false;
  const out = [];
  for (const p of effectiveProjects().list) {
    for (const r of p.recommendations) {
      if (!r.alert || severityRank(r.severity) < 1) continue;
      const id = `ALERT:${r.id}`;
      if (!state.alerts[id]) created = true;
      const w = ensureRecord(state.alerts, id, { status: 'UNREAD' });
      out.push({
        id,
        severity: r.severity,
        category: r.category,
        code: r.code,
        project: { id: p.id, name: p.name },
        projectId: p.id,
        state: p.state,
        district: p.district,
        districts: p.districts,
        case: r.caseIds[0] ?? null,
        stage: r.stage,
        title: r.title,
        reason: r.reason,
        triggered_by: r.trigger,
        responsibleAuthority: r.responsibleAuthority.name,
        assignedRole: r.assignedRole,
        date: w.firstSeenAt,
        status: w.status,
        link: r.caseIds[0] && ['compensation', 'legal', 'documentation'].includes(r.category) ? `/cases/${r.caseIds[0]}` : `/projects/${p.id}`,
        interventionId: r.intervention ? r.id : null,
        updatedAt: w.updatedAt ?? null,
        updatedBy: w.updatedBy ?? null,
      });
    }
  }
  if (created) saveState();
  return out;
}

export function listAlerts(user, f = {}) {
  const projects = effectiveProjects().byId;
  let rows = allAlerts().filter((a) => inScope(user, projects.get(a.projectId)));
  if (f.focus === '1') rows = rows.filter((a) => ROLES[user.role].focus.includes(a.category));
  if (f.status) rows = rows.filter((a) => f.status.split(',').includes(a.status));
  if (f.severity) rows = rows.filter((a) => f.severity.split(',').includes(a.severity));
  if (f.category) rows = rows.filter((a) => f.category.split(',').includes(a.category));
  if (f.projectId) rows = rows.filter((a) => a.projectId === f.projectId);
  const counts = {
    unread: rows.filter((a) => a.status === 'UNREAD').length,
    bySeverity: ['Critical', 'High', 'Medium'].map((s) => ({ key: s, count: rows.filter((r) => r.severity === s).length, unread: rows.filter((r) => r.severity === s && r.status === 'UNREAD').length })),
    byStatus: ALERT_STATUSES.map((s) => ({ key: s, count: rows.filter((r) => r.status === s).length })),
    byCategory: Object.entries(rows.reduce((m, r) => ((m[r.category] = (m[r.category] ?? 0) + 1), m), {})).map(([key, count]) => ({ key, count })),
  };
  rows.sort((a, b) => (a.status === 'UNREAD' ? 0 : 1) - (b.status === 'UNREAD' ? 0 : 1) || severityRank(b.severity) - severityRank(a.severity));
  const pageSize = Math.min(100, Math.max(1, Number(f.pageSize ?? 30)));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Number(f.page ?? 1)), pages);
  return { total: rows.length, page, pages, pageSize, counts, items: rows.slice((page - 1) * pageSize, page * pageSize) };
}

export function updateAlert(user, id, status) {
  const alert = allAlerts().find((a) => a.id === id);
  if (!alert) throw new ServiceError('Alert not found or its trigger no longer holds', 404);
  if (!inScope(user, getProject(alert.projectId))) throw new ServiceError('This alert is outside your jurisdiction', 403);
  if (!ALERT_STATUSES.includes(status)) throw new ServiceError(`Unknown alert status ${status}`, 422);
  const state = getState();
  const w = state.alerts[id];
  const before = w.status;
  w.status = status;
  w.updatedAt = new Date().toISOString();
  w.updatedBy = user.id;
  w.history.push({ at: w.updatedAt, by: user.id, from: before, to: status });
  saveState();
  recordAudit({ user, action: 'alert.status_changed', entity: 'alert', entityId: id, oldValue: { status: before }, newValue: { status } });
  return allAlerts().find((a) => a.id === id);
}

/** Notification count for the header bell. */
export function notificationCount(user) {
  const projects = effectiveProjects().byId;
  const unread = allAlerts().filter((a) => a.status === 'UNREAD' && inScope(user, projects.get(a.projectId)) && ROLES[user.role].focus.includes(a.category)).length;
  const assigned = allInterventions().filter((i) => (i.assigned_role === user.role || i.assigneeId === user.id) && ['OPEN', 'ACKNOWLEDGED'].includes(i.status) && inScope(user, projects.get(i.projectId))).length;
  return { unreadAlerts: unread, openAssigned: assigned, total: unread + assigned };
}
