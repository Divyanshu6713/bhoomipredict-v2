/**
 * Field validation shared by the project form, project edits and CSV upload,
 * so a value rejected in one place is rejected everywhere, with the same
 * human-readable message.
 */
import { PROJECT_TYPES, PROJECT_TYPE_NAMES, LIFECYCLE_STAGES, authorityOptions } from './registry.mjs';
import { districtIndex, resolveDistrict, inDistrict, stateAt } from './geography.mjs';

export const PRIORITIES = ['Routine', 'Important', 'Critical'];
export const RESPONSIVENESS = ['Low', 'Moderate', 'High'];
export const OWNERSHIP = ['Single', 'Joint', 'Fragmented', 'Disputed'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (v) => ISO.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * Field contract. `csv` is the column name in uploads; `required` applies to
 * creation. Numbers arrive as strings from CSV and are coerced here.
 */
export const PROJECT_FIELDS = [
  { key: 'name', csv: 'project_name', type: 'string', required: true, min: 3, max: 160, label: 'Project name' },
  { key: 'type', csv: 'project_type', type: 'enum', required: true, options: PROJECT_TYPE_NAMES, label: 'Project type' },
  { key: 'subtype', csv: 'subtype', type: 'subtype', required: false, label: 'Subtype' },
  { key: 'state', csv: 'state', type: 'state', required: true, label: 'State' },
  { key: 'district', csv: 'district', type: 'district', required: true, label: 'District' },
  { key: 'subDistrict', csv: 'taluk_or_tehsil', type: 'string', required: false, max: 80, label: 'Taluk / tehsil' },
  { key: 'authority', csv: 'primary_authority', type: 'authority', required: false, label: 'Primary authority' },
  { key: 'priority', csv: 'priority', type: 'enum', required: false, options: PRIORITIES, label: 'Priority', default: 'Important' },
  { key: 'landRequirementHa', csv: 'land_area', type: 'number', required: true, min: 0.1, max: 200000, label: 'Land area (ha)' },
  { key: 'totalParcels', csv: 'total_parcels', type: 'integer', required: true, min: 1, max: 100000, label: 'Total parcels' },
  { key: 'affectedFamilies', csv: 'affected_families', type: 'integer', required: false, min: 0, max: 500000, label: 'Affected families', default: 0 },
  { key: 'currentStage', csv: 'current_stage', type: 'stage', required: true, label: 'Current stage' },
  { key: 'startDate', csv: 'start_date', type: 'date', required: true, label: 'Start date' },
  { key: 'targetCompletionDate', csv: 'expected_completion_date', type: 'date', required: true, label: 'Expected completion date' },
  { key: 'compensationCompletionPct', csv: 'compensation_completion_percentage', type: 'percent', required: false, label: 'Compensation completion %', default: 0 },
  { key: 'possessionCompletionPct', csv: 'possession_completion_percentage', type: 'percent', required: false, label: 'Possession completion %', default: 0 },
  { key: 'rrProgressPct', csv: 'rehabilitation_completion_percentage', type: 'percent', required: false, label: 'R&R completion %', default: 0 },
  { key: 'avgDocumentCompleteness', csv: 'documentation_completeness', type: 'percent', required: false, label: 'Documentation completeness %', default: 70 },
  { key: 'legalCases', csv: 'legal_dispute_count', type: 'integer', required: false, min: 0, max: 100000, label: 'Legal dispute count', default: 0 },
  { key: 'dominantOwnership', csv: 'ownership_complexity', type: 'enum', required: false, options: OWNERSHIP, label: 'Ownership complexity', default: 'Joint' },
  { key: 'stakeholderResponsiveness', csv: 'stakeholder_responsiveness', type: 'enum', required: false, options: RESPONSIVENESS, label: 'Stakeholder responsiveness', default: 'Moderate' },
  { key: 'approvalDelayDays', csv: 'approval_delay_days', type: 'integer', required: false, min: 0, max: 1500, label: 'Approval delay (days)', default: 0 },
  { key: 'lat', csv: 'latitude', type: 'latitude', required: true, label: 'Latitude' },
  { key: 'lon', csv: 'longitude', type: 'longitude', required: true, label: 'Longitude' },
  { key: 'forestLand', csv: 'forest_land', type: 'boolean', required: false, label: 'Forest land in alignment', default: false },
  { key: 'crossesRailway', csv: 'crosses_railway', type: 'boolean', required: false, label: 'Crosses a railway line', default: false },
  { key: 'crossesHighway', csv: 'crosses_national_highway', type: 'boolean', required: false, label: 'Crosses a national highway', default: false },
];

export const CSV_COLUMNS = PROJECT_FIELDS.map((f) => f.csv);
export const CSV_REQUIRED = PROJECT_FIELDS.filter((f) => f.required).map((f) => f.csv);

const BOOL_TRUE = new Set(['1', 'true', 'yes', 'y']);
const BOOL_FALSE = new Set(['0', 'false', 'no', 'n', '']);

/**
 * Validate and coerce one project record.
 * @param input  object keyed by `key` (form / API) or by `csv` (upload) — see `from`
 * @param opts.partial  true for edits: only fields present are checked
 * @returns { value, errors: [{ field, column, message }] }
 */
export function validateProject(input, { partial = false, from = 'key', existing = null } = {}) {
  const errors = [];
  const value = {};
  const get = (f) => input[from === 'csv' ? f.csv : f.key];
  const err = (f, message) => errors.push({ field: f.key, column: f.csv, label: f.label, message });

  for (const f of PROJECT_FIELDS) {
    let raw = get(f);
    const present = raw !== undefined && raw !== null && String(raw).trim() !== '';
    if (!present) {
      if (!partial && f.required) err(f, `${f.label} is required.`);
      else if (!partial && f.default !== undefined) value[f.key] = f.default;
      continue;
    }
    raw = typeof raw === 'string' ? raw.trim() : raw;
    switch (f.type) {
      case 'string':
        if (String(raw).length < (f.min ?? 0)) err(f, `${f.label} must be at least ${f.min} characters.`);
        else if (String(raw).length > (f.max ?? 1000)) err(f, `${f.label} must be at most ${f.max} characters.`);
        else value[f.key] = String(raw);
        break;
      case 'enum': {
        const match = f.options.find((o) => o.toLowerCase() === String(raw).toLowerCase());
        if (!match) err(f, `${f.label} "${raw}" is not valid. Use one of: ${f.options.join(', ')}.`);
        else value[f.key] = match;
        break;
      }
      case 'number':
      case 'integer':
      case 'percent': {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          err(f, `${f.label} must be a number (got "${raw}").`);
          break;
        }
        if (f.type === 'integer' && !Number.isInteger(n)) {
          err(f, `${f.label} must be a whole number (got ${raw}).`);
          break;
        }
        const min = f.type === 'percent' ? 0 : f.min;
        const max = f.type === 'percent' ? 100 : f.max;
        if (n < min || n > max) err(f, `${f.label} must be between ${min} and ${max}${f.type === 'percent' ? '%' : ''} (got ${raw}).`);
        else value[f.key] = n;
        break;
      }
      case 'boolean': {
        const s = String(raw).toLowerCase();
        if (BOOL_TRUE.has(s)) value[f.key] = true;
        else if (BOOL_FALSE.has(s)) value[f.key] = false;
        else err(f, `${f.label} must be yes/no (got "${raw}").`);
        break;
      }
      case 'date':
        if (!isIsoDate(String(raw))) err(f, `${f.label} must be a real date in YYYY-MM-DD format (got "${raw}").`);
        else value[f.key] = String(raw);
        break;
      case 'latitude':
      case 'longitude': {
        const n = Number(raw);
        const [lo, hi] = f.type === 'latitude' ? [6, 37.5] : [68, 97.5];
        if (!Number.isFinite(n) || n < lo || n > hi) err(f, `${f.label} must be a number between ${lo} and ${hi} for a location in India (got "${raw}").`);
        else value[f.key] = n;
        break;
      }
      case 'state': {
        const states = Array.from(districtIndex().byState.keys());
        const match = states.find((s) => s.toLowerCase() === String(raw).toLowerCase());
        if (!match) err(f, `State "${raw}" is not a recognised Indian state or union territory.`);
        else value[f.key] = match;
        break;
      }
      case 'stage': {
        const match = LIFECYCLE_STAGES.find((s) => s.toLowerCase() === String(raw).toLowerCase());
        if (!match) err(f, `Stage "${raw}" is not a lifecycle stage. Use one of: ${LIFECYCLE_STAGES.join(', ')}.`);
        else value[f.key] = match;
        break;
      }
      default:
        value[f.key] = raw;
    }
  }

  // Cross-field checks, which need the merged record.
  const merged = { ...(existing ?? {}), ...value };
  const field = (key) => PROJECT_FIELDS.find((f) => f.key === key);

  const districtRaw = get(field('district'));
  if (districtRaw !== undefined && String(districtRaw).trim() !== '' && merged.state) {
    const d = resolveDistrict(merged.state, String(districtRaw));
    if (!d) err(field('district'), `District "${districtRaw}" is not a district of ${merged.state}.`);
    else value.district = d.district;
  }
  if (merged.type && PROJECT_TYPES[merged.type]) {
    const subRaw = get(field('subtype'));
    if (subRaw !== undefined && String(subRaw).trim() !== '') {
      const match = PROJECT_TYPES[merged.type].subtypes.find((s) => s.toLowerCase() === String(subRaw).toLowerCase());
      if (!match) err(field('subtype'), `Subtype "${subRaw}" is not valid for ${merged.type}. Use one of: ${PROJECT_TYPES[merged.type].subtypes.join(', ')}.`);
      else value.subtype = match;
    } else if (!partial) {
      value.subtype = PROJECT_TYPES[merged.type].subtypes[0];
    }
    const authRaw = get(field('authority'));
    const finalMerged = { ...merged, ...value };
    if (finalMerged.state && finalMerged.district) {
      const options = authorityOptions({ projectType: finalMerged.type, subtype: finalMerged.subtype, state: finalMerged.state, district: finalMerged.district });
      if (authRaw !== undefined && String(authRaw).trim() !== '') {
        const match = options.find((o) => o.toLowerCase() === String(authRaw).toLowerCase());
        if (!match) err(field('authority'), `"${authRaw}" is not an eligible acquiring body for a ${finalMerged.type} project in ${finalMerged.state}. Eligible: ${options.join('; ')}.`);
        else value.authority = match;
      } else if (!partial) {
        value.authority = options[0];
      }
    }
  }

  const final = { ...merged, ...value };
  if (final.startDate && final.targetCompletionDate && final.targetCompletionDate <= final.startDate) {
    err(field('targetCompletionDate'), `Expected completion date (${final.targetCompletionDate}) must be after the start date (${final.startDate}).`);
  }
  if (final.lat !== undefined && final.lon !== undefined && final.state && final.district && (value.lat !== undefined || value.lon !== undefined || value.district || value.state)) {
    const key = `${final.state}|${final.district}`;
    if (!inDistrict(key, final.lat, final.lon)) {
      const actual = stateAt(final.lat, final.lon);
      err(field('lat'), `Coordinates ${final.lat}, ${final.lon} fall outside ${final.district}, ${final.state}${actual ? ` (they are in ${actual})` : ''}.`);
    }
  }
  const stageIdx = LIFECYCLE_STAGES.indexOf(final.currentStage);
  if (stageIdx >= 0) {
    if (stageIdx < 4 && (final.compensationCompletionPct ?? 0) > 0) {
      err(field('compensationCompletionPct'), `Compensation cannot be ${final.compensationCompletionPct}% complete while the project is at ${final.currentStage}; no award exists before Valuation.`);
    }
    if (stageIdx < 6 && (final.possessionCompletionPct ?? 0) > 0) {
      err(field('possessionCompletionPct'), `Possession cannot be ${final.possessionCompletionPct}% complete before the Possession stage (current stage: ${final.currentStage}).`);
    }
  }
  if (final.totalParcels !== undefined && final.legalCases !== undefined && final.legalCases > final.totalParcels * 20) {
    err(field('legalCases'), `${final.legalCases} legal cases for ${final.totalParcels} parcels looks implausible (more than 20 per parcel).`);
  }

  return { value, errors };
}
