/**
 * Document repository (MVP).
 *
 * Files are stored on disk under data/runtime/documents/<document id>/ with
 * one file per version; metadata lives in the runtime state. Documents attach
 * to a project and optionally to a stage and a case. Every upload, new version
 * and review decision is audited.
 *
 * This is a working repository for the prototype, not a certified government
 * records system: there is no virus scanning, retention schedule or digital
 * signature verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getState, saveState, recordAudit, DOCUMENT_DIR } from './persistence.mjs';
import { getProject, ServiceError } from './projects.mjs';
import { inScope, ROLES } from '../domain/roles.mjs';
import { LIFECYCLE_STAGES } from '../domain/registry.mjs';

export const DOCUMENT_TYPES = ['notification', 'award', 'compensation', 'legal', 'land_record', 'survey', 'rr', 'other'];
export const DOCUMENT_STATUSES = ['SUBMITTED', 'VERIFIED', 'REJECTED'];
export const MAX_BYTES = 10 * 1024 * 1024;

/** Which document types each role may file. */
const TYPES_BY_ROLE = {
  NATIONAL_ADMIN: DOCUMENT_TYPES,
  STATE_ADMIN: DOCUMENT_TYPES,
  DISTRICT_ADMIN: DOCUMENT_TYPES,
  LAND_ACQUISITION_OFFICER: ['notification', 'award', 'compensation', 'legal', 'rr', 'other'],
  PROJECT_AUTHORITY: ['survey', 'other'],
  LEGAL_OFFICER: ['legal', 'other'],
  REVENUE_OFFICER: ['land_record', 'survey', 'other'],
  FIELD_OFFICER: ['survey', 'rr', 'other'],
  POLICY_VIEWER: [],
};

const EXTENSIONS = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Reject files whose content does not match their extension. */
function sniff(ext, buf) {
  const starts = (...bytes) => bytes.every((b, i) => buf[i] === b);
  if (ext === '.pdf') return starts(0x25, 0x50, 0x44, 0x46);
  if (ext === '.png') return starts(0x89, 0x50, 0x4e, 0x47);
  if (ext === '.jpg' || ext === '.jpeg') return starts(0xff, 0xd8, 0xff);
  if (ext === '.docx' || ext === '.xlsx') return starts(0x50, 0x4b, 0x03, 0x04);
  return !buf.subarray(0, 4096).includes(0); // text formats: no NUL bytes
}

const safeName = (name) => path.basename(String(name)).replace(/[^\w.\- ()]/g, '_').slice(0, 120);

function nextId(state) {
  state.counters.document = (state.counters.document ?? 0) + 1;
  return `DOC-${String(state.counters.document).padStart(5, '0')}`;
}

function checkUpload(user, project, { type, fileName, bytes }) {
  if (!project) throw new ServiceError('Project not found', 404);
  if (!inScope(user, project)) throw new ServiceError('This project is outside your jurisdiction', 403);
  if (!DOCUMENT_TYPES.includes(type)) throw new ServiceError(`Document type must be one of: ${DOCUMENT_TYPES.join(', ')}`, 422);
  if (!(TYPES_BY_ROLE[user.role] ?? []).includes(type)) {
    throw new ServiceError(`${ROLES[user.role].label} cannot file "${type}" documents. Allowed: ${(TYPES_BY_ROLE[user.role] ?? []).join(', ') || 'none'}.`, 403);
  }
  const ext = path.extname(String(fileName ?? '')).toLowerCase();
  if (!EXTENSIONS[ext]) throw new ServiceError(`File type ${ext || '(none)'} is not accepted. Allowed: ${Object.keys(EXTENSIONS).join(', ')}`, 415);
  if (!bytes?.length) throw new ServiceError('The file is empty', 422);
  if (bytes.length > MAX_BYTES) throw new ServiceError(`The file is larger than ${MAX_BYTES / 1048576} MB`, 413);
  if (!sniff(ext, bytes)) throw new ServiceError(`The file content does not look like a ${ext} file`, 415);
  return ext;
}

function writeVersion(docId, version, fileName, bytes) {
  const dir = path.join(DOCUMENT_DIR, docId);
  fs.mkdirSync(dir, { recursive: true });
  const stored = `v${version}-${safeName(fileName)}`;
  fs.writeFileSync(path.join(dir, stored), bytes);
  return stored;
}

export function uploadDocument(user, meta, bytes) {
  const project = getProject(meta.projectId);
  const ext = checkUpload(user, project, { type: meta.type, fileName: meta.fileName, bytes });
  if (meta.stage && !LIFECYCLE_STAGES.includes(meta.stage)) throw new ServiceError('Unknown stage', 422);
  if (meta.caseId && !/^LAC-\d+$/.test(meta.caseId)) throw new ServiceError('Case id must look like LAC-500123', 422);
  const title = String(meta.title ?? '').trim();
  if (title.length < 3) throw new ServiceError('A document title of at least 3 characters is required', 422);

  const state = getState();
  const id = nextId(state);
  const now = new Date().toISOString();
  const stored = writeVersion(id, 1, meta.fileName, bytes);
  const doc = {
    document_id: id,
    id,
    title: title.slice(0, 160),
    type: meta.type,
    project_id: project.id,
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    stage: meta.stage || null,
    caseId: meta.caseId || null,
    uploaded_by: { id: user.id, name: user.name, role: user.role },
    uploaded_at: now,
    version: 1,
    status: 'SUBMITTED',
    versions: [{ version: 1, fileName: safeName(meta.fileName), stored, bytes: bytes.length, contentType: EXTENSIONS[ext], uploadedAt: now, uploadedBy: user.id }],
    review: null,
  };
  state.documents[id] = doc;
  saveState();
  recordAudit({ user, action: 'document.uploaded', entity: 'document', entityId: id, newValue: { title: doc.title, type: doc.type, projectId: doc.projectId, stage: doc.stage, caseId: doc.caseId, bytes: bytes.length } });
  return doc;
}

export function addVersion(user, id, fileName, bytes) {
  const state = getState();
  const doc = state.documents[id];
  if (!doc || doc.deleted) throw new ServiceError('Document not found', 404);
  const project = getProject(doc.projectId);
  const ext = checkUpload(user, project, { type: doc.type, fileName, bytes });
  const version = doc.version + 1;
  const stored = writeVersion(id, version, fileName, bytes);
  const now = new Date().toISOString();
  doc.versions.push({ version, fileName: safeName(fileName), stored, bytes: bytes.length, contentType: EXTENSIONS[ext], uploadedAt: now, uploadedBy: user.id });
  const before = { version: doc.version, status: doc.status };
  doc.version = version;
  doc.status = 'SUBMITTED';
  doc.review = null;
  saveState();
  recordAudit({ user, action: 'document.version_added', entity: 'document', entityId: id, oldValue: before, newValue: { version, status: 'SUBMITTED' } });
  return doc;
}

export function reviewDocument(user, id, { status, note }) {
  const state = getState();
  const doc = state.documents[id];
  if (!doc || doc.deleted) throw new ServiceError('Document not found', 404);
  if (!inScope(user, getProject(doc.projectId))) throw new ServiceError('This document is outside your jurisdiction', 403);
  if (!['VERIFIED', 'REJECTED'].includes(status)) throw new ServiceError('Review status must be VERIFIED or REJECTED', 422);
  if (status === 'REJECTED' && !note) throw new ServiceError('A note is required when rejecting a document', 422);
  if (doc.uploaded_by.id === user.id) throw new ServiceError('A document cannot be reviewed by the person who uploaded it', 403);
  const before = { status: doc.status };
  doc.status = status;
  doc.review = { by: { id: user.id, name: user.name, role: user.role }, at: new Date().toISOString(), note: note ?? null, version: doc.version };
  saveState();
  recordAudit({ user, action: 'document.reviewed', entity: 'document', entityId: id, oldValue: before, newValue: { status, note: note ?? null } });
  return doc;
}

export function listDocuments(user, f = {}, projectsById) {
  let rows = Object.values(getState().documents).filter((d) => !d.deleted);
  rows = rows.filter((d) => {
    const p = projectsById.get(d.projectId);
    return p && inScope(user, p);
  });
  if (f.projectId) rows = rows.filter((d) => d.projectId === f.projectId);
  if (f.type) rows = rows.filter((d) => f.type.split(',').includes(d.type));
  if (f.status) rows = rows.filter((d) => f.status.split(',').includes(d.status));
  if (f.caseId) rows = rows.filter((d) => d.caseId === f.caseId);
  if (f.stage) rows = rows.filter((d) => d.stage === f.stage);
  rows.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  return {
    total: rows.length,
    allowedTypes: TYPES_BY_ROLE[user.role] ?? [],
    types: DOCUMENT_TYPES,
    documents: rows,
  };
}

export function documentFile(user, id, version) {
  const doc = getState().documents[id];
  if (!doc || doc.deleted) throw new ServiceError('Document not found', 404);
  if (!inScope(user, getProject(doc.projectId))) throw new ServiceError('This document is outside your jurisdiction', 403);
  const v = doc.versions.find((x) => x.version === Number(version ?? doc.version));
  if (!v) throw new ServiceError('Version not found', 404);
  const file = path.join(DOCUMENT_DIR, id, v.stored);
  if (!fs.existsSync(file)) throw new ServiceError('The stored file is missing', 410);
  recordAudit({ user, action: 'document.downloaded', entity: 'document', entityId: id, newValue: { version: v.version } });
  return { file, fileName: v.fileName, contentType: v.contentType };
}
