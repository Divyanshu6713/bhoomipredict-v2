/**
 * Builds land_acquisition_synthetic_350k.pdf — the documented PDF export of the
 * synthetic corpus.
 *
 *   node scripts/make-pdf.mjs [--rows 5000] [--full]
 *
 * Sections
 *   1  Title page and prototype-data notice
 *   2  How to read the dataset (record framing, target, leakage controls)
 *   3  Field dictionary — every column, its type, meaning and missing rate
 *   4  Distribution tables and data-quality audit
 *   5  Model card summary
 *   6  Tabular data export, in two column parts joined on case_id
 *
 * The complete 350,000-row corpus ships as CSV; the PDF carries a systematic
 * sample of rows by default because a full-row PDF runs to thousands of pages.
 * `--full` produces every row for anyone who needs it, and the title page always
 * states which variant it is.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Pdf, COLOR, fit, wrap, textWidth } from './lib/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CSV = path.join(DATA, 'land_acquisition_synthetic_350k.csv');
const OUT = path.join(DATA, 'land_acquisition_synthetic_350k.pdf');

const args = process.argv.slice(2);
const argNum = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const FULL = args.includes('--full');
const SAMPLE_ROWS = FULL ? Infinity : argNum('--rows', 5000);

const meta = JSON.parse(fs.readFileSync(path.join(DATA, 'dataset-meta.json'), 'utf8'));
const modelMetrics = fs.existsSync(path.join(DATA, 'model', 'metrics.json'))
  ? JSON.parse(fs.readFileSync(path.join(DATA, 'model', 'metrics.json'), 'utf8'))
  : null;

const fmt = (n) => Number(n).toLocaleString('en-IN');
const pct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;

/* --------------------------------------------------------- field dictionary */

const FIELDS = [
  ['case_id', 'string', 'Unique identifier of the acquisition case record.'],
  ['project_id', 'string', 'Acquisition project the case belongs to.'],
  ['parcel_id', 'string', 'Parcel reference, coded state-district-sequence.'],
  ['state', 'category', 'State administering the acquisition.'],
  ['district', 'category', 'Revenue district.'],
  ['tehsil', 'category', 'Taluk / tehsil / mandal within the district (real sub-district name).'],
  ['village', 'category', 'Revenue village.'],
  ['latitude', 'float', 'Synthetic parcel latitude, sampled inside the real district boundary.'],
  ['longitude', 'float', 'Synthetic parcel longitude, sampled inside the real district boundary.'],
  ['project_name', 'string', 'Name of the corridor or scheme.'],
  ['project_type', 'category', 'Infrastructure category of the project.'],
  ['project_subtype', 'category', 'Subtype within the project type (e.g. Six-laning, Lift irrigation scheme).'],
  ['acquisition_framework', 'category', 'Statute the acquisition proceeds under (RFCTLARR, NH_ACT, RAILWAYS_ACT, PMP_ACT, ELECTRICITY_ROW, KIAD_ACT, MID_ACT).'],
  ['authority', 'category', 'Primary acquiring / requiring body, eligible for the type, state and district.'],
  ['project_priority', 'category', 'Routine / Important / Critical sanction priority.'],
  ['project_land_requirement_ha', 'float', 'Land requirement fixed at sanction, hectares.'],
  ['project_start_date', 'date', 'Project sanction / commencement date.'],
  ['target_completion_date', 'date', 'Baseline completion date across all nine stages.'],
  ['survey_number', 'string', 'Revenue survey number of the parcel.'],
  ['land_area_ha', 'float', 'Parcel area in hectares.'],
  ['land_type', 'category', 'Land use classification of the parcel.'],
  ['current_stage', 'category', 'Statutory acquisition stage the case sits in.'],
  ['stage_start_date', 'date', 'Date the case entered the current stage.'],
  ['expected_stage_days', 'int', 'Days allowed for the stage under the working plan.'],
  ['elapsed_stage_days', 'int', 'Days consumed in the stage as at the snapshot.'],
  ['milestone_due_date', 'date', 'stage_start_date + expected_stage_days.'],
  ['assessment_date', 'date', 'Snapshot date of the feature values in this row.'],
  ['affected_families', 'int', 'Families affected by this parcel. Blank where unrecorded.'],
  ['ownership_complexity', 'category', 'Single / Joint / Fragmented / Disputed title pattern.'],
  ['number_of_owners', 'int', 'Recorded owners on the parcel. Blank where unrecorded.'],
  ['compensation_status', 'category', 'Not Initiated to Paid.'],
  ['compensation_amount_band', 'category', 'Banded award value. Blank where unrecorded.'],
  ['compensation_pending_days', 'int', 'Days a declared award has been pending disbursement.'],
  ['compensation_completion_percentage', 'int', 'Share of the award actually disbursed.'],
  ['legal_dispute', 'binary', '1 where any litigation or objection is on record.'],
  ['legal_case_count', 'int', 'Open cases attached to the parcel.'],
  ['dispute_complexity', 'category', 'None / Low / Moderate / High.'],
  ['rr_required', 'binary', '1 where rehabilitation and resettlement applies.'],
  ['rr_progress_percentage', 'int', 'R&R delivery progress. Blank where not applicable or unrecorded.'],
  ['rehabilitation_cases', 'int', 'R&R entitlement cases attached to the parcel.'],
  ['stakeholder_responsiveness', 'category', 'Low / Moderate / High. Blank where unrecorded.'],
  ['department_response_days', 'int', 'Average departmental turnaround. Blank where unrecorded.'],
  ['document_completeness', 'int', 'Share of required records verified. Blank where unrecorded.'],
  ['verification_status', 'category', 'Pending / In Progress / Verified.'],
  ['approval_status', 'category', 'Not Submitted / Submitted / Under Review / Approved.'],
  ['inactivity_days', 'int', 'Days since the last recorded action on the file.'],
  ['possession_status', 'category', 'Not Initiated / Notice Issued / Partial / Complete.'],
  ['rr_status', 'category', 'Not Applicable / Not Started / In Progress / Complete.'],
  ['authority_dependency_count', 'int', 'Authorities the acquisition depends on, from the authority registry.'],
  ['pending_dependency_actions', 'int', 'Dependencies gating this stage with an action pending on the parcel.'],
  ['pending_dependency_codes', 'string', 'Semicolon-separated codes of those pending dependencies (e.g. LAND_RECORDS;TREASURY).'],
  ['approval_delay_days', 'int', 'Days an approval or clearance has been pending on the parcel.'],
  ['department_coordination_score', 'int', 'Inter-department coordination score for the project, 0-100 (higher is better).'],
  ['historical_stage_delay_rate', 'float', 'Historical slip rate of this stage, 0-1.'],
  ['district_historical_delay_rate', 'float', 'Historical delay rate of the district, 0-1.'],
  ['authority_historical_delay_rate', 'float', 'Historical delay rate of the authority, 0-1.'],
  ['label_observed', 'binary', '1 when the milestone outcome is already knowable.'],
  ['next_milestone_delayed', 'target', `1 when the milestone slipped more than ${meta.delayThresholdDays} days. Blank while open.`],
  ['delay_risk_category', 'target', 'Ground-truth risk band. Blank while open.'],
  ['actual_stage_delay_days', 'target', 'Observed slip in days, once resolved. Blank otherwise.'],
];

/** Column layout for the two tabular parts. [field, width, align] */
const PART_ONE = [
  ['case_id', 62], ['project_id', 52], ['state', 74], ['district', 70], ['tehsil', 78],
  ['village', 66], ['project_type', 72], ['land_type', 78], ['current_stage', 86],
  ['land_area_ha', 44, 'right'], ['expected_stage_days', 34, 'right'], ['elapsed_stage_days', 34, 'right'],
  ['stage_start_date', 54], ['milestone_due_date', 54], ['assessment_date', 54],
];

const PART_TWO = [
  ['case_id', 62], ['ownership_complexity', 62], ['number_of_owners', 30, 'right'],
  ['affected_families', 30, 'right'], ['compensation_status', 62], ['compensation_completion_percentage', 32, 'right'],
  ['compensation_pending_days', 32, 'right'], ['legal_dispute', 24, 'right'], ['legal_case_count', 26, 'right'],
  ['dispute_complexity', 44], ['rr_required', 24, 'right'], ['rr_progress_percentage', 30, 'right'],
  ['document_completeness', 32, 'right'], ['inactivity_days', 32, 'right'], ['department_response_days', 32, 'right'],
  ['stakeholder_responsiveness', 48], ['verification_status', 50], ['possession_status', 52],
  ['label_observed', 26, 'right'], ['next_milestone_delayed', 30, 'right'], ['delay_risk_category', 42],
  ['actual_stage_delay_days', 32, 'right'],
];

/* ------------------------------------------------------------------ layout */

const MARGIN = 28;
const HEADER_H = 44;
const FOOTER_H = 26;

function chrome(page, { section, title, pdf }) {
  page.rect(0, 0, page.width, 26, { fill: COLOR.navy });
  page.text(MARGIN, 17, 'BHOOMIPREDICT  |  SYNTHETIC LAND-ACQUISITION CORPUS', { size: 8, font: 'B', color: COLOR.white });
  page.text(page.width - MARGIN - 200, 17, `${meta.datasetName}  ·  ${fmt(meta.records)} records`, {
    size: 8,
    color: [0.65, 0.72, 0.85],
    align: 'right',
    width: 200,
  });
  if (title) page.text(MARGIN, 42, title, { size: 12.5, font: 'B', color: COLOR.ink });
  if (section) {
    page.text(page.width - MARGIN - 240, 42, section, { size: 8.5, color: COLOR.ink3, align: 'right', width: 240 });
  }
  page.line(MARGIN, 48, page.width - MARGIN, 48, { color: COLOR.lineStrong, width: 0.8 });
  page.line(MARGIN, page.height - FOOTER_H, page.width - MARGIN, page.height - FOOTER_H, { color: COLOR.line });
  page.text(MARGIN, page.height - 12, 'Synthetic data — not an official acquisition record.', {
    size: 7.5,
    font: 'O',
    color: COLOR.ink3,
  });
  page.text(page.width - MARGIN - 120, page.height - 12, `Page ${pdf.pageCount}`, {
    size: 7.5,
    color: COLOR.ink3,
    align: 'right',
    width: 120,
  });
}

/** Simple key/value table renderer with a header band. */
function table(page, { x, top, columns, rows, rowHeight = 13, fontSize = 8, headerFill = COLOR.surface }) {
  const width = columns.reduce((s, c) => s + c.width, 0);
  page.rect(x, top, width, rowHeight + 3, { fill: headerFill, stroke: COLOR.line });
  let cx = x;
  for (const c of columns) {
    page.text(cx + 4, top + rowHeight - 2, fit(c.header, c.width - 8, fontSize, true), {
      size: fontSize,
      font: 'B',
      color: COLOR.ink2,
      align: c.align ?? 'left',
      width: c.width - 8,
    });
    cx += c.width;
  }
  let y = top + rowHeight + 3;
  rows.forEach((row, i) => {
    if (i % 2 === 1) page.rect(x, y, width, rowHeight, { fill: [0.985, 0.99, 0.995] });
    cx = x;
    columns.forEach((c, ci) => {
      const value = row[ci];
      page.text(cx + 4, y + rowHeight - 3.5, fit(String(value ?? ''), c.width - 8, fontSize), {
        size: fontSize,
        color: ci === 0 ? COLOR.ink : COLOR.ink2,
        align: c.align ?? 'left',
        width: c.width - 8,
      });
      cx += c.width;
    });
    page.line(x, y + rowHeight, x + width, y + rowHeight, { color: COLOR.line, width: 0.4 });
    y += rowHeight;
  });
  return y;
}

/* --------------------------------------------------------------- documents */

function renderTitlePage(page, sampleCount, partPages, volume = null) {
  page.rect(0, 0, page.width, 250, { fill: COLOR.navy });
  page.text(MARGIN + 12, 60, 'BHOOMIPREDICT', { size: 11, font: 'B', color: [0.55, 0.68, 0.95] });
  page.text(MARGIN + 12, 100, 'Synthetic Land Acquisition', { size: 26, font: 'B', color: COLOR.white });
  page.text(MARGIN + 12, 132, 'Case Corpus', { size: 26, font: 'B', color: COLOR.white });
  page.text(MARGIN + 12, 162, meta.datasetName, { size: 11, font: 'O', color: [0.62, 0.72, 0.9] });
  if (volume) {
    page.text(MARGIN + 12, 178, `VOLUME ${volume.index} OF ${volume.total}  ·  ROWS ${fmt(volume.from)}-${fmt(volume.to)}`, {
      size: 9,
      font: 'B',
      color: [0.98, 0.72, 0.3],
    });
  }
  page.text(MARGIN + 12, 196, `${fmt(meta.records)} case-level records  ·  ${meta.columns} columns  ·  ${fmt(meta.projects)} projects`, {
    size: 11,
    font: 'B',
    color: COLOR.white,
  });
  page.text(MARGIN + 12, 214, `${meta.states} states  ·  ${meta.districts} districts  ·  snapshot date ${meta.snapshotDate}`, {
    size: 10,
    color: [0.72, 0.8, 0.94],
  });

  let y = 288;
  page.text(MARGIN, y, 'PROTOTYPE DATA NOTICE', { size: 10, font: 'B', color: COLOR.amber });
  y += 18;
  const notice =
    'This prototype uses synthetic data for demonstration and model-development purposes. It does not ' +
    'represent actual government acquisition records. No row corresponds to a real acquisition ' +
    'proceeding, department record, landowner or court case, and the coordinates are schematic positions ' +
    'derived from district centroids rather than surveyed parcel boundaries. Real-world deployment and ' +
    'validation would require authorised historical acquisition data.';
  for (const line of wrap(notice, page.width - MARGIN * 2, 9.5)) {
    page.text(MARGIN, y, line, { size: 9.5, color: COLOR.ink2 });
    y += 13.5;
  }

  y += 16;
  page.line(MARGIN, y, page.width - MARGIN, y, { color: COLOR.lineStrong });
  y += 22;

  const rows = [
    ['Dataset name', meta.datasetName],
    ['Records', fmt(meta.records)],
    ['Columns', String(meta.columns)],
    ['Generated at', meta.generatedAt.replace('T', ' ').slice(0, 19) + ' UTC'],
    ['Snapshot date', meta.snapshotDate],
    ['Projects', fmt(meta.projects)],
    ['States / districts', `${meta.states} / ${meta.districts}`],
    ['Primary target', 'next_milestone_delayed'],
    ['Target definition', `the current stage's next milestone slips by more than ${meta.delayThresholdDays} days`],
    ['Rows with an observed outcome', `${fmt(meta.labels.observed)} (${pct(meta.labels.observed / meta.records)})`],
    ['Rows still open (target blank)', `${fmt(meta.labels.open)} (${pct(meta.labels.open / meta.records)})`],
    ['Positive rate on observed rows', pct(meta.labels.positiveRate, 2)],
    ['Companion file', 'land_acquisition_synthetic_350k.csv (complete corpus)'],
    [
      'Rows in this PDF',
      volume
        ? `${fmt(sampleCount)} (rows ${fmt(volume.from)}-${fmt(volume.to)} of the complete corpus)`
        : `${fmt(sampleCount)} systematic sample (every ${Math.floor(meta.records / sampleCount)}th row)`,
    ],
    [
      'Coverage',
      volume
        ? `Volume ${volume.index} of ${volume.total} — the volumes together carry all ${fmt(meta.records)} rows`
        : 'Representative sample; the complete corpus is in the companion CSV. Run "npm run data:pdf:full" for all rows across volumes.',
    ],
    ['Tabular pages', `${fmt(partPages)} (Part A + Part B, joined on case_id)`],
  ];

  table(page, {
    x: MARGIN,
    top: y,
    rowHeight: 15,
    fontSize: 9,
    columns: [
      { header: 'Property', width: 200 },
      { header: 'Value', width: page.width - MARGIN * 2 - 200 },
    ],
    rows,
  });

  page.text(MARGIN, page.height - 40, 'Generated by scripts/make-pdf.mjs from the seeded corpus generator. Reproducible from the same seed.', {
    size: 8,
    font: 'O',
    color: COLOR.ink3,
  });
  return page;
}

function readingPage(pdf) {
  const page = pdf.addPage('portrait');
  chrome(page, { pdf, title: 'How to read this dataset', section: 'Section 2' });
  let y = 74;
  const blocks = [
    [
      'One row = one case snapshot',
      'Each row is a single acquisition case (a land parcel under acquisition) captured at a point inside its ' +
        'current statutory stage, together with the outcome of that stage\'s next milestone. The snapshot date is ' +
        'assessment_date; the milestone being predicted falls due on milestone_due_date.',
    ],
    [
      'The nine-stage lifecycle',
      'Land Identification, Survey & Verification, Notification, Objection / Claims, Valuation, Compensation, ' +
        'Possession, Rehabilitation & Resettlement, Closure. A project sits at a frontier stage while its parcels ' +
        'are spread across the stages behind and around it.',
    ],
    [
      'The target',
      `next_milestone_delayed is 1 when the milestone slips by more than ${meta.delayThresholdDays} days. ` +
        'delay_risk_category is the ground-truth band of the underlying propensity, and ' +
        'actual_stage_delay_days is the observed slip once the stage resolves.',
    ],
    [
      'Observed versus open rows',
      'label_observed is 1 only when the milestone due date is more than the delay threshold in the past, so the ' +
        'outcome is already knowable. Open rows leave every target column blank — they are the live portfolio the ' +
        'model has to predict, and keeping them unlabelled is what stops look-ahead leakage.',
    ],
    [
      'How the outcome relates to the columns',
      'The generator builds a latent propensity from combinations of signals — time consumed in the stage against ' +
        'work actually completed, compensation still unpaid, litigation load, ownership complexity, inactivity, ' +
        'documentation gaps, stakeholder responsiveness, and the historical delay rates of the stage, district and ' +
        'authority — plus interaction terms and an unobserved-heterogeneity term. The outcome is then drawn from ' +
        'that propensity, so no single column determines it and a rule such as "legal_dispute = 1 implies delayed" ' +
        'does not hold.',
    ],
    [
      'Missing values are deliberate',
      'Seven fields carry field-reporting gaps at the rates listed in the data-quality audit. They are left as ' +
        'empty cells, not zeros, so that imputation and data-quality scoring can be exercised honestly.',
    ],
    [
      'What this data cannot be used for',
      'It cannot establish real-world accuracy, validate a deployment, or support any statement about a real ' +
        'district, authority, landowner or proceeding. It exists to exercise a pipeline end to end.',
    ],
  ];
  for (const [heading, body] of blocks) {
    page.text(MARGIN, y, heading, { size: 10, font: 'B', color: COLOR.brand });
    y += 15;
    for (const line of wrap(body, page.width - MARGIN * 2, 9)) {
      page.text(MARGIN, y, line, { size: 9, color: COLOR.ink2 });
      y += 12.2;
    }
    y += 12;
  }
  return page;
}

function dictionaryPages(pdf) {
  const perPage = 28;
  const pages = [];
  for (let i = 0; i < FIELDS.length; i += perPage) {
    const page = pdf.addPage('landscape');
    chrome(page, {
      pdf,
      title: 'Field dictionary',
      section: `Section 3  ·  fields ${i + 1}-${Math.min(FIELDS.length, i + perPage)} of ${FIELDS.length}`,
    });
    const rows = FIELDS.slice(i, i + perPage).map(([name, type, description]) => {
      const missing = meta.missingRates?.[name];
      return [name, type, missing === undefined ? '-' : pct(missing, 2), description];
    });
    table(page, {
      x: MARGIN,
      top: 62,
      rowHeight: 15,
      fontSize: 8.5,
      columns: [
        { header: 'Column', width: 220 },
        { header: 'Type', width: 60 },
        { header: 'Blank', width: 46, align: 'right' },
        { header: 'Description', width: page.width - MARGIN * 2 - 326 },
      ],
      rows,
    });
    pages.push(page);
  }
  return pages;
}

function distributionPages(pdf) {
  const d = meta.distributions;
  const total = meta.records;
  const asRows = (obj, sortDesc = true) => {
    const entries = Object.entries(obj);
    if (sortDesc) entries.sort((a, b) => b[1] - a[1]);
    return entries.map(([k, v]) => [k, fmt(v), pct(v / total)]);
  };

  const page = pdf.addPage('landscape');
  chrome(page, { pdf, title: 'Distributions', section: 'Section 4' });
  const colW = (page.width - MARGIN * 2 - 24) / 3;
  const cols = (header) => [
    { header, width: colW - 150 },
    { header: 'Records', width: 80, align: 'right' },
    { header: 'Share', width: 70, align: 'right' },
  ];
  table(page, { x: MARGIN, top: 62, columns: cols('Acquisition stage'), rows: asRows(d.stage, false), rowHeight: 13, fontSize: 8 });
  table(page, { x: MARGIN + colW + 12, top: 62, columns: cols('Ground-truth risk band'), rows: asRows(d.riskBand, false), rowHeight: 13, fontSize: 8 });
  table(page, {
    x: MARGIN + (colW + 12) * 2,
    top: 62,
    columns: cols('Ownership complexity'),
    rows: asRows(d.ownership, false),
    rowHeight: 13,
    fontSize: 8,
  });
  table(page, { x: MARGIN, top: 250, columns: cols('Compensation status'), rows: asRows(d.compensation, false), rowHeight: 13, fontSize: 8 });
  table(page, { x: MARGIN + colW + 12, top: 250, columns: cols('Land type'), rows: asRows(d.landType, false), rowHeight: 13, fontSize: 8 });
  table(page, {
    x: MARGIN + (colW + 12) * 2,
    top: 250,
    columns: cols('Label availability'),
    rows: [
      ['Observed outcome', fmt(meta.labels.observed), pct(meta.labels.observed / total)],
      ['Open (blank target)', fmt(meta.labels.open), pct(meta.labels.open / total)],
      ['Delayed (observed)', fmt(meta.labels.positives), pct(meta.labels.positives / total)],
      ['Resolved slip recorded', fmt(meta.aggregates.resolvedStageOutcomes), pct(meta.aggregates.resolvedStageOutcomes / total)],
      ['Legal dispute on record', fmt(meta.aggregates.legalDisputeParcels), pct(meta.aggregates.legalDisputeParcels / total)],
      ['R&R applicable', fmt(meta.aggregates.rrRequiredParcels), pct(meta.aggregates.rrRequiredParcels / total)],
    ],
    rowHeight: 13,
    fontSize: 8,
  });

  const statePage = pdf.addPage('landscape');
  chrome(statePage, { pdf, title: 'Geographic distribution and data-quality audit', section: 'Section 4' });
  const stateRows = asRows(d.state);
  const half = Math.ceil(stateRows.length / 2);
  table(statePage, {
    x: MARGIN,
    top: 62,
    columns: cols('State'),
    rows: stateRows.slice(0, half),
    rowHeight: 13,
    fontSize: 8,
  });
  table(statePage, {
    x: MARGIN + colW + 12,
    top: 62,
    columns: cols('State (continued)'),
    rows: stateRows.slice(half),
    rowHeight: 13,
    fontSize: 8,
  });
  table(statePage, {
    x: MARGIN + (colW + 12) * 2,
    top: 62,
    columns: [
      { header: 'Field-reporting gap', width: colW - 120 },
      { header: 'Blank cells', width: 80, align: 'right' },
      { header: 'Rate', width: 40, align: 'right' },
    ],
    rows: Object.entries(meta.missing).map(([k, v]) => [k, fmt(v), pct(v / total, 2)]),
    rowHeight: 13,
    fontSize: 8,
  });

  const monthRows = Object.entries(d.assessmentMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => [k, fmt(v), pct(v / total)]);
  table(statePage, {
    x: MARGIN + (colW + 12) * 2,
    top: 330,
    columns: [
      { header: 'Assessment month', width: colW - 120 },
      { header: 'Records', width: 80, align: 'right' },
      { header: 'Share', width: 40, align: 'right' },
    ],
    rows: monthRows.slice(-14),
    rowHeight: 12,
    fontSize: 7.5,
  });
  statePage.text(MARGIN + (colW + 12) * 2, 324, 'Last 14 months shown; the corpus spans 42.', {
    size: 7.5,
    font: 'O',
    color: COLOR.ink3,
  });
  return [page, statePage];
}

function modelPage(pdf) {
  if (!modelMetrics) return [];
  const page = pdf.addPage('portrait');
  chrome(page, { pdf, title: 'Model card summary', section: 'Section 5' });
  let y = 70;
  page.text(MARGIN, y, 'Target and split', { size: 10, font: 'B', color: COLOR.brand });
  y += 16;
  const split = modelMetrics.split;
  y = table(page, {
    x: MARGIN,
    top: y,
    rowHeight: 14,
    fontSize: 8.5,
    columns: [
      { header: 'Partition', width: 120 },
      { header: 'Rows', width: 90, align: 'right' },
      { header: 'From', width: 90 },
      { header: 'To', width: 90 },
      { header: 'Note', width: page.width - MARGIN * 2 - 390 },
    ],
    rows: [
      ['Train', fmt(split.train.rows), split.train.from, split.train.to, 'earliest 70% of observed rows'],
      ['Validation', fmt(split.validation.rows), split.validation.from, split.validation.to, 'next 15%, threshold selection'],
      ['Test', fmt(split.test.rows), split.test.from, split.test.to, 'latest 15%, reported below'],
      ['Open (scored only)', fmt(split.openRows), '-', '-', 'no label; the live portfolio'],
    ],
  });

  y += 22;
  page.text(MARGIN, y, 'Test-set performance', { size: 10, font: 'B', color: COLOR.brand });
  y += 16;
  const rows = Object.entries(modelMetrics.models).map(([key, m]) => [
    m.label ?? key,
    m.test.rocAuc.toFixed(4),
    m.test.prAuc.toFixed(4),
    m.test.at_threshold.precision.toFixed(4),
    m.test.at_threshold.recall.toFixed(4),
    m.test.at_threshold.f1.toFixed(4),
    m.test.brier.toFixed(4),
  ]);
  y = table(page, {
    x: MARGIN,
    top: y,
    rowHeight: 14,
    fontSize: 8.5,
    columns: [
      { header: 'Model', width: 180 },
      { header: 'ROC-AUC', width: 60, align: 'right' },
      { header: 'PR-AUC', width: 56, align: 'right' },
      { header: 'Precision', width: 58, align: 'right' },
      { header: 'Recall', width: 52, align: 'right' },
      { header: 'F1', width: 46, align: 'right' },
      { header: 'Brier', width: 50, align: 'right' },
    ],
    rows,
  });

  y += 20;
  page.text(MARGIN, y, `Operating threshold ${modelMetrics.operatingThreshold} (chosen on validation F1). Deployed model: ${modelMetrics.deployed}.`, {
    size: 8.5,
    color: COLOR.ink2,
  });
  y += 24;
  page.text(MARGIN, y, 'Leakage controls', { size: 10, font: 'B', color: COLOR.brand });
  y += 15;
  for (const control of modelMetrics.leakageControls ?? []) {
    for (const line of wrap(`- ${control}`, page.width - MARGIN * 2, 9)) {
      page.text(MARGIN, y, line, { size: 9, color: COLOR.ink2 });
      y += 12;
    }
  }
  y += 14;
  page.text(MARGIN, y, 'Interpretation limits', { size: 10, font: 'B', color: COLOR.brand });
  y += 15;
  const limits =
    'Reported metrics describe performance on synthetic data generated by a known process. They demonstrate that ' +
    'the pipeline learns the structure present in the corpus; they say nothing about accuracy on real acquisition ' +
    'records. Feature contributions describe what moved the model\'s prediction, not what caused a delay.';
  for (const line of wrap(limits, page.width - MARGIN * 2, 9)) {
    page.text(MARGIN, y, line, { size: 9, color: COLOR.ink2 });
    y += 12;
  }
  return [page];
}

function dataPages(pdf, header, rows, part, columns) {
  const label = part === 'A' ? 'Part A — identification, geography, project and stage' : 'Part B — compensation, legal, R&R, administration and targets';
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const cols = columns.map(([field, width, align]) => ({
    header: field.replace(/_/g, ' '),
    width,
    align,
    field,
  }));
  const totalWidth = cols.reduce((s, c) => s + c.width, 0);
  const scale = (842 - MARGIN * 2) / totalWidth;
  cols.forEach((c) => (c.width *= scale));

  const ROW_H = 9.6;
  const FONT = 6.4;
  const top0 = 66;
  const usable = 595 - top0 - FOOTER_H - 8;
  const perPage = Math.floor(usable / ROW_H);

  let created = 0;
  for (let start = 0; start < rows.length; start += perPage) {
    const page = pdf.addPage('landscape');
    chrome(page, {
      pdf,
      title: `Tabular export — ${label}`,
      section: `Section 6  ·  rows ${fmt(start + 1)}-${fmt(Math.min(rows.length, start + perPage))} of ${fmt(rows.length)}`,
    });
    const slice = rows.slice(start, start + perPage).map((r) => cols.map((c) => r[idx[c.field]] ?? ''));
    table(page, { x: MARGIN, top: top0, columns: cols, rows: slice, rowHeight: ROW_H, fontSize: FONT });
    created++;
  }
  return created;
}

/* ------------------------------------------------------------------- main */

/** Quote-aware split: authority and project names can contain commas. */
function splitCsv(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

async function readSample() {
  const step = FULL ? 1 : Math.max(1, Math.floor(meta.records / SAMPLE_ROWS));
  const rl = readline.createInterface({
    input: fs.createReadStream(CSV, { highWaterMark: 1 << 22 }),
    crlfDelay: Infinity,
  });
  let header = null;
  const rows = [];
  let i = 0;
  for await (const line of rl) {
    if (header === null) {
      header = line.split(',');
      continue;
    }
    if (i % step === 0) rows.push(splitCsv(line));
    i++;
  }
  return { header, rows, step };
}

async function main() {
  const t0 = Date.now();
  if (!fs.existsSync(CSV)) {
    console.error('[pdf] corpus CSV not found — run scripts/generate-dataset.mjs first');
    process.exit(1);
  }
  console.log(`[pdf] reading corpus${FULL ? ' (all rows)' : ` (~${fmt(SAMPLE_ROWS)} row sample)`}…`);
  const { header, rows } = await readSample();
  console.log(`[pdf] ${fmt(rows.length)} rows selected in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const build = (slice, { file, volume }) => {
    const pdf = new Pdf({
      title: `${meta.datasetName} — synthetic land acquisition case corpus${volume ? ` (volume ${volume.index} of ${volume.total})` : ''}`,
      subject: 'Synthetic prototype dataset for land-acquisition delay prediction. Not an official record.',
    });
    // Page 1 is reserved up front so every footer numbers correctly, then filled
    // in last once the real page counts are known.
    const titleRef = pdf.addPage('portrait');
    readingPage(pdf);
    dictionaryPages(pdf);
    distributionPages(pdf);
    modelPage(pdf);
    const partA = dataPages(pdf, header, slice, 'A', PART_ONE);
    const partB = dataPages(pdf, header, slice, 'B', PART_TWO);
    renderTitlePage(titleRef, slice.length, partA + partB, volume);

    const buf = pdf.build();
    fs.writeFileSync(file, buf);
    console.log(
      `[pdf] ${path.relative(ROOT, file)} · ${pdf.pageCount} pages · ${(buf.length / 1048576).toFixed(2)} MB`,
    );
  };

  if (!FULL) {
    build(rows, { file: OUT });
  } else {
    // A single PDF holding every row runs to thousands of pages and exhausts
    // memory, so the complete corpus is emitted as documented volumes instead.
    const perVolume = argNum('--per-volume', 40000);
    const total = Math.ceil(rows.length / perVolume);
    for (let v = 0; v < total; v++) {
      const slice = rows.slice(v * perVolume, (v + 1) * perVolume);
      build(slice, {
        file: path.join(DATA, `land_acquisition_synthetic_350k_full_part${String(v + 1).padStart(2, '0')}.pdf`),
        volume: { index: v + 1, total, from: v * perVolume + 1, to: v * perVolume + slice.length },
      });
    }
  }

  console.log(`[pdf] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
