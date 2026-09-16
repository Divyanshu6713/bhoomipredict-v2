/**
 * Automated alert scanning, escalation and notification delivery.
 *
 *   scheduler (every LANDPULSE_ALERT_SCAN_MINUTES, default 15; also on demand)
 *     → evaluate every project's rules (the same evaluation the alert centre shows)
 *     → new alerts since the last scan          → notify the officers who own them
 *     → interventions past their due date       → escalate one level up, once per level
 *     → one digest per recipient per scan, delivered on each channel:
 *          in-app   always (the bell and "My notifications")
 *          email    outbox adapter (data/runtime/outbox/email.jsonl) unless SMTP is configured
 *          sms      outbox adapter for Critical items only (160-character message)
 *          webhook  POST JSON to LANDPULSE_WEBHOOK_URL and to API clients that
 *                   registered a webhook, for projects inside their jurisdiction
 *
 * The outbox adapters are honest stand-ins: messages are rendered and recorded
 * exactly as they would be sent, but no email or SMS gateway is connected in
 * this prototype. Webhook delivery is real HTTP when a URL is configured.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getState, saveState, recordAudit, RUNTIME } from './persistence.mjs';
import { allAlerts, allInterventions } from './workflow.mjs';
import { effectiveProjects } from './projects.mjs';
import { USERS, ROLES, inScope, userById } from '../domain/roles.mjs';
import { severityRank } from '../domain/rules.mjs';

const OUTBOX = path.join(RUNTIME, 'outbox');
const WEBHOOK_URL = process.env.LANDPULSE_WEBHOOK_URL ?? null;
const SCAN_MINUTES = Number(process.env.LANDPULSE_ALERT_SCAN_MINUTES ?? 15);
const MAX_ITEMS = 3000;

export const CHANNELS = [
  { id: 'in_app', label: 'In-app', adapter: 'built-in', connected: true },
  { id: 'email', label: 'Email', adapter: process.env.LANDPULSE_SMTP_URL ? 'smtp (configured)' : 'outbox (no gateway connected)', connected: false },
  { id: 'sms', label: 'SMS', adapter: 'outbox (no gateway connected)', connected: false, rule: 'Critical items only' },
  { id: 'webhook', label: 'Webhook', adapter: WEBHOOK_URL ? 'HTTP POST' : 'per API client (none global)', connected: Boolean(WEBHOOK_URL) },
];

/** Who supervises a role when an intervention goes overdue. */
const ESCALATION = {
  FIELD_OFFICER: 'DISTRICT_ADMIN',
  REVENUE_OFFICER: 'DISTRICT_ADMIN',
  LAND_ACQUISITION_OFFICER: 'DISTRICT_ADMIN',
  LEGAL_OFFICER: 'STATE_ADMIN',
  PROJECT_AUTHORITY: 'SECTOR_NODAL_OFFICER',
  DISTRICT_ADMIN: 'STATE_ADMIN',
  STATE_ADMIN: 'NATIONAL_ADMIN',
  SECTOR_NODAL_OFFICER: 'NATIONAL_ADMIN',
};

const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
export const contactOf = (u) => ({ email: `${slug(u.name)}@demo.landpulse.invalid`, phone: `+91-90000-${String(Math.abs([...u.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100000).padStart(5, '0')}` });

function recipientsFor(project, { category, role }) {
  return USERS.map((u) => userById(u.id)).filter((u) => {
    if (!inScope(u, project)) return false;
    if (role) return u.role === role;
    return ROLES[u.role].focus.includes(category);
  });
}

function writeOutbox(channel, message) {
  fs.mkdirSync(OUTBOX, { recursive: true });
  fs.appendFileSync(path.join(OUTBOX, `${channel}.jsonl`), `${JSON.stringify(message)}\n`);
}

async function postWebhook(url, payload) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'LandPulseAI-Notifier/1.0' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
    return { status: res.ok ? 'SENT' : 'FAILED', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'FAILED', detail: err.message.slice(0, 120) };
  }
}

function nextId(state) {
  state.counters.notification = (state.counters.notification ?? 0) + 1;
  return `NTF-${String(state.counters.notification).padStart(6, '0')}`;
}

/**
 * Run one scan. Returns what was found and delivered.
 * @param opts.reason 'scheduled' | 'manual' | 'startup'
 * @param opts.apiClients list of { id, name, webhookUrl, position } to fan out to
 */
export async function runAlertScan({ reason = 'manual', user = null, apiClientWebhooks = [] } = {}) {
  const state = getState();
  const n = state.notifications;
  const projects = effectiveProjects().byId;
  const now = new Date();
  const firstScan = !n.lastScanAt;

  const alerts = allAlerts();
  const fresh = alerts.filter((a) => !n.seenAlerts[a.id] && severityRank(a.severity) >= 1);
  for (const a of alerts) n.seenAlerts[a.id] ??= now.toISOString();

  const overdue = allInterventions().filter((i) => i.overdue);
  const escalations = [];
  for (const i of overdue) {
    const w = state.interventions[i.id];
    const level = w.escalationLevel ?? 0;
    const holder = level === 0 ? i.assigned_role : w.escalatedTo;
    const to = ESCALATION[holder];
    if (!to || level >= 2) continue;
    const lastAt = w.escalatedAt ? new Date(w.escalatedAt).getTime() : 0;
    if (level > 0 && now.getTime() - lastAt < 7 * 86400000) continue; // a week before the next level
    w.escalationLevel = level + 1;
    w.escalatedTo = to;
    w.escalatedAt = now.toISOString();
    w.history.push({ at: w.escalatedAt, by: 'system', from: { escalationLevel: level }, to: { escalationLevel: level + 1, escalatedTo: to } });
    escalations.push({ ...i, escalatedTo: to, escalationLevel: level + 1 });
    recordAudit({ user: null, action: 'intervention.escalated', entity: 'intervention', entityId: i.id, oldValue: { escalationLevel: level, holder }, newValue: { escalationLevel: level + 1, escalatedTo: to, dueDate: i.due_date } });
  }

  // On the very first scan every existing alert is "new"; notify only High and
  // Critical then, so a fresh deployment does not flood inboxes.
  const toNotify = firstScan ? fresh.filter((a) => severityRank(a.severity) >= 2) : fresh;

  const digests = new Map();
  const add = (u, item) => {
    const d = digests.get(u.id) ?? { user: u, items: [] };
    d.items.push(item);
    digests.set(u.id, d);
  };
  for (const a of toNotify) {
    const project = projects.get(a.projectId);
    if (!project) continue;
    for (const u of recipientsFor(project, { category: a.category })) add(u, { kind: 'alert', id: a.id, severity: a.severity, title: a.title, projectId: a.projectId, projectName: a.project.name, link: a.link, reason: a.reason });
  }
  for (const e of escalations) {
    const project = projects.get(e.projectId);
    if (!project) continue;
    for (const u of recipientsFor(project, { role: e.escalatedTo })) add(u, { kind: 'escalation', id: e.id, severity: e.severity, title: `Overdue: ${e.title}`, projectId: e.projectId, projectName: e.projectName, link: `/projects/${e.projectId}`, reason: `Due ${e.due_date.slice(0, 10)}, held by ${e.assignedRoleLabel}; escalated to ${ROLES[e.escalatedTo].label} (level ${e.escalationLevel}).` });
  }

  const deliveries = [];
  for (const { user: u, items } of digests.values()) {
    const critical = items.filter((x) => x.severity === 'Critical');
    const subject = `LandPulse AI · ${items.length} new item${items.length === 1 ? '' : 's'}${critical.length ? ` · ${critical.length} Critical` : ''}`;
    const body = items.slice(0, 20).map((x) => `[${x.severity}] ${x.title} — ${x.projectName}\n  ${x.reason}`).join('\n');
    const contact = contactOf(u);
    const base = { id: nextId(state), at: now.toISOString(), scan: reason, recipient: { id: u.id, name: u.name, role: u.role, designation: u.designation }, subject, items: items.slice(0, 50), itemCount: items.length, read: false };
    const channels = [{ channel: 'in_app', status: 'DELIVERED', detail: 'Shown in the notification centre' }];
    writeOutbox('email', { to: contact.email, subject, body, at: base.at, id: base.id });
    channels.push({ channel: 'email', status: 'QUEUED_OUTBOX', detail: `${contact.email} — recorded in outbox; no mail gateway connected` });
    if (critical.length) {
      const text = `LandPulse AI: ${critical.length} Critical item(s). ${critical[0].title} (${critical[0].projectName}). Open the app for details.`.slice(0, 160);
      writeOutbox('sms', { to: contact.phone, text, at: base.at, id: base.id });
      channels.push({ channel: 'sms', status: 'QUEUED_OUTBOX', detail: `${contact.phone} — recorded in outbox; no SMS gateway connected` });
    }
    n.items.push({ ...base, channels });
    deliveries.push(base.id);
  }

  // Webhooks: one payload per scan per subscriber, filtered to its jurisdiction.
  const webhookResults = [];
  const payloadFor = (filter) => ({
    event: 'landpulse.alerts.scan',
    at: now.toISOString(),
    dataMode: 'synthetic',
    alerts: toNotify.filter((a) => filter(projects.get(a.projectId))).map((a) => ({ id: a.id, severity: a.severity, category: a.category, title: a.title, projectId: a.projectId, state: a.state, district: a.district })),
    escalations: escalations.filter((e) => filter(projects.get(e.projectId))).map((e) => ({ id: e.id, severity: e.severity, title: e.title, projectId: e.projectId, escalatedTo: e.escalatedTo, level: e.escalationLevel })),
  });
  if (WEBHOOK_URL && (toNotify.length || escalations.length)) {
    webhookResults.push({ target: 'global', ...(await postWebhook(WEBHOOK_URL, payloadFor(() => true))) });
  }
  for (const c of apiClientWebhooks) {
    const payload = payloadFor((p) => p && c.inScope(p));
    if (!payload.alerts.length && !payload.escalations.length) continue;
    webhookResults.push({ target: c.name, clientId: c.id, ...(await postWebhook(c.webhookUrl, payload)) });
  }

  if (n.items.length > MAX_ITEMS) n.items.splice(0, n.items.length - MAX_ITEMS);
  n.lastScanAt = now.toISOString();
  n.scans = (n.scans ?? 0) + 1;
  n.lastScan = { at: n.lastScanAt, reason, alertsEvaluated: alerts.length, newAlerts: fresh.length, notified: toNotify.length, overdue: overdue.length, escalations: escalations.length, digests: deliveries.length, webhooks: webhookResults };
  saveState();
  if (reason !== 'scheduled' || deliveries.length || escalations.length) {
    recordAudit({ user, action: 'notifications.scan', entity: 'notifications', entityId: n.lastScanAt, newValue: n.lastScan });
  }
  return n.lastScan;
}

let timer = null;
export function startScheduler({ apiClientWebhooks, onTick }) {
  if (timer || SCAN_MINUTES <= 0) return;
  const tick = async (reason) => {
    try {
      await runAlertScan({ reason, apiClientWebhooks: apiClientWebhooks() });
      await onTick?.();
    } catch (err) {
      console.error('[notify] scan failed:', err.message);
    }
  };
  setTimeout(() => tick('startup'), 4000).unref();
  timer = setInterval(() => tick('scheduled'), SCAN_MINUTES * 60000);
  timer.unref();
}

export function notificationFeed(user, { all = false, page = 1, pageSize = 25, unread } = {}) {
  const n = getState().notifications;
  let rows = [...n.items].reverse();
  if (!all) rows = rows.filter((x) => x.recipient.id === user.id);
  if (unread === '1') rows = rows.filter((x) => !x.read);
  const size = Math.min(100, Math.max(1, Number(pageSize)));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const pg = Math.min(Math.max(1, Number(page)), pages);
  const byChannel = {};
  for (const x of all ? n.items : rows) for (const c of x.channels) byChannel[`${c.channel}:${c.status}`] = (byChannel[`${c.channel}:${c.status}`] ?? 0) + 1;
  return {
    total: rows.length,
    unread: rows.filter((x) => !x.read).length,
    page: pg,
    pages,
    items: rows.slice((pg - 1) * size, pg * size),
    channels: CHANNELS,
    deliveryCounts: byChannel,
    lastScan: n.lastScan ?? null,
    scanIntervalMinutes: SCAN_MINUTES,
    scans: n.scans ?? 0,
  };
}

export function markNotificationsRead(user, ids) {
  const n = getState().notifications;
  let changed = 0;
  for (const x of n.items) {
    if (x.recipient.id === user.id && !x.read && (!ids || ids.includes(x.id))) {
      x.read = true;
      changed++;
    }
  }
  if (changed) saveState();
  return { changed };
}

export const unreadNotificationCount = (user) => getState().notifications.items.filter((x) => x.recipient.id === user.id && !x.read).length;
