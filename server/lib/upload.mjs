/**
 * CSV project upload.
 *
 * Two passes over the same parser and validator used by the project form:
 *   validate  — every row checked, human-readable errors per row and column,
 *               nothing written
 *   commit    — only when every row is valid; each row becomes a project and
 *               an audit entry
 */
import { CSV_COLUMNS, CSV_REQUIRED, PROJECT_FIELDS, validateProject } from '../domain/validation.mjs';
import { createProject, ServiceError } from './projects.mjs';
import { inScope } from '../domain/roles.mjs';

export const MAX_UPLOAD_ROWS = 500;

/** RFC 4180-style parser: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw new ServiceError('The CSV has an unterminated quoted field', 422);
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function csvTemplate() {
  const example = {
    project_name: 'Mandya Ring Road — Segment 2',
    project_type: 'Urban Infrastructure',
    subtype: 'Ring road',
    state: 'Karnataka',
    district: 'Mandya',
    taluk_or_tehsil: 'Mandya',
    primary_authority: '',
    priority: 'Important',
    land_area: '210',
    total_parcels: '380',
    affected_families: '140',
    current_stage: 'Objection / Claims',
    start_date: '2026-01-15',
    expected_completion_date: '2027-12-31',
    compensation_completion_percentage: '0',
    possession_completion_percentage: '0',
    rehabilitation_completion_percentage: '0',
    documentation_completeness: '74',
    legal_dispute_count: '12',
    ownership_complexity: 'Joint',
    stakeholder_responsiveness: 'Moderate',
    approval_delay_days: '20',
    latitude: '12.52',
    longitude: '76.9',
    forest_land: 'no',
    crosses_railway: 'no',
    crosses_national_highway: 'yes',
  };
  const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${CSV_COLUMNS.join(',')}\n${CSV_COLUMNS.map((c) => q(example[c] ?? '')).join(',')}\n`;
}

export function processUpload(user, text, { commit = false } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new ServiceError('The upload is empty', 422);
  const rows = parseCsv(text);
  if (rows.length < 2) throw new ServiceError('The CSV needs a header row and at least one data row', 422);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const fileErrors = [];

  const missing = CSV_REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) fileErrors.push(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  const unknown = header.filter((h) => h && !CSV_COLUMNS.includes(h));
  const warnings = unknown.length ? [`Ignored unrecognised column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`] : [];
  const dupes = header.filter((h, i) => h && header.indexOf(h) !== i);
  if (dupes.length) fileErrors.push(`Duplicate column${dupes.length > 1 ? 's' : ''}: ${Array.from(new Set(dupes)).join(', ')}.`);
  if (rows.length - 1 > MAX_UPLOAD_ROWS) fileErrors.push(`At most ${MAX_UPLOAD_ROWS} projects per upload (got ${rows.length - 1}).`);
  if (fileErrors.length) return { ok: false, committed: false, fileErrors, warnings, rows: [], columns: CSV_COLUMNS, required: CSV_REQUIRED };

  const results = [];
  const seenNames = new Map();
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const record = {};
    header.forEach((h, k) => {
      if (CSV_COLUMNS.includes(h)) record[h] = cells[k] ?? '';
    });
    const rowErrors = [];
    if (cells.length !== header.length) rowErrors.push({ column: null, message: `Row has ${cells.length} values but the header has ${header.length} columns.` });
    const { value, errors } = validateProject(record, { from: 'csv' });
    rowErrors.push(...errors.map((e) => ({ column: e.column, message: e.message })));
    const key = `${String(record.project_name ?? '').toLowerCase()}|${String(record.district ?? '').toLowerCase()}`;
    if (seenNames.has(key)) rowErrors.push({ column: 'project_name', message: `Duplicate of row ${seenNames.get(key)} (same project name and district).` });
    else seenNames.set(key, i + 1);
    if (!rowErrors.length && !inScope(user, { state: value.state, districts: [value.district], type: value.type, authority: value.authority, network: { nodes: [] } })) {
      rowErrors.push({ column: 'state', message: `${value.district}, ${value.state} is outside your jurisdiction.` });
    }
    results.push({ row: i + 1, name: record.project_name ?? '', valid: rowErrors.length === 0, errors: rowErrors, value: rowErrors.length ? null : value });
  }

  const ok = results.every((r) => r.valid);
  let created = [];
  if (commit) {
    if (!ok) throw new ServiceError('Fix every row before committing the upload', 422, results.filter((r) => !r.valid));
    created = results.map((r) => createProject(user, r.value, { source: 'csv' })).map((p) => ({ id: p.id, name: p.name, riskScore: p.riskScore, riskBand: p.riskBand }));
  }
  return {
    ok,
    committed: commit && ok,
    fileErrors: [],
    warnings,
    columns: CSV_COLUMNS,
    required: CSV_REQUIRED,
    summary: { rows: results.length, valid: results.filter((r) => r.valid).length, invalid: results.filter((r) => !r.valid).length },
    rows: results.map(({ value, ...rest }) => rest),
    created,
    fieldGuide: PROJECT_FIELDS.map((f) => ({ column: f.csv, label: f.label, required: f.required, type: f.type, options: f.options ?? null })),
  };
}
