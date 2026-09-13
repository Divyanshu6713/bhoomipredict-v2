/**
 * Runtime state for everything the platform records after the corpus is built:
 * project edits and additions, workflow status of interventions and alerts,
 * case status changes, documents, sessions, risk snapshots and the audit trail.
 *
 * Deliberately simple and dependency-free: one JSON document written
 * atomically (temp file + rename) and an append-only JSONL audit log, both
 * under data/runtime/. That is enough for a single-process MVP and keeps the
 * deployment a plain Node process. A production deployment would move this to
 * a transactional database; the service functions are the seam for that.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA } from './store.mjs';

/** BP_RUNTIME_DIR lets tests run an isolated API instance without touching the demo state. */
export const RUNTIME = process.env.BP_RUNTIME_DIR ? path.resolve(process.env.BP_RUNTIME_DIR) : path.join(DATA, 'runtime');
const STATE_FILE = path.join(RUNTIME, 'state.json');
const AUDIT_FILE = path.join(RUNTIME, 'audit.jsonl');
export const DOCUMENT_DIR = path.join(RUNTIME, 'documents');

const EMPTY = () => ({
  version: 1,
  projectOverrides: {},
  userProjects: {},
  deletedProjects: {},
  interventions: {},
  alerts: {},
  caseStatus: {},
  documents: {},
  sessions: {},
  riskSnapshots: {},
  counters: { project: 0, document: 0 },
});

let state = null;
let audit = null;
let writeTimer = null;

export function loadState() {
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.mkdirSync(DOCUMENT_DIR, { recursive: true });
  if (fs.existsSync(STATE_FILE)) {
    try {
      state = { ...EMPTY(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    } catch (err) {
      const broken = `${STATE_FILE}.corrupt-${Date.now()}`;
      fs.renameSync(STATE_FILE, broken);
      console.error(`[state] could not parse state.json (${err.message}); moved to ${path.basename(broken)} and started fresh`);
      state = EMPTY();
    }
  } else {
    state = EMPTY();
  }
  audit = [];
  if (fs.existsSync(AUDIT_FILE)) {
    for (const line of fs.readFileSync(AUDIT_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        audit.push(JSON.parse(line));
      } catch {
        /* a torn final line from a crash is skipped */
      }
    }
  }
  return state;
}

export const getState = () => state ?? loadState();

/** Persist soon; bursts of writes coalesce into one file write. */
export function saveState() {
  if (writeTimer) return;
  writeTimer = setTimeout(flushState, 40);
}

export function flushState() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  if (!state) return;
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);
}

export const newId = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex')}`;

/* ------------------------------------------------------------------- audit */

/**
 * Append an audit entry. Every state-changing endpoint calls this with the
 * acting user, the entity touched and the before/after values.
 */
export function recordAudit({ user, action, entity, entityId, oldValue = null, newValue = null, note = null }) {
  getState();
  const entry = {
    id: newId('AUD'),
    timestamp: new Date().toISOString(),
    user: user ? { id: user.id, name: user.name, role: user.role, department: user.department } : { id: 'system', name: 'System', role: 'SYSTEM' },
    action,
    entity,
    entityId: String(entityId),
    oldValue,
    newValue,
    note,
  };
  audit.push(entry);
  fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(entry)}\n`);
  return entry;
}

export function queryAudit({ entity, entityId, userId, action, q, page = 1, pageSize = 50 } = {}) {
  getState();
  let rows = audit;
  if (entity) rows = rows.filter((r) => r.entity === entity);
  if (entityId) rows = rows.filter((r) => r.entityId === String(entityId));
  if (userId) rows = rows.filter((r) => r.user.id === userId);
  if (action) rows = rows.filter((r) => r.action === action);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
  }
  const sorted = [...rows].reverse();
  const size = Math.min(200, Math.max(1, Number(pageSize)));
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const p = Math.min(Math.max(1, Number(page)), pages);
  return { total: sorted.length, page: p, pages, pageSize: size, entries: sorted.slice((p - 1) * size, p * size) };
}

export const auditCount = () => (audit ?? []).length;
