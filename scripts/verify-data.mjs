/**
 * Verifies the generated corpus and every artefact built from it.
 *
 *   npm run data:verify
 *
 * Checks record count, schema, duplicates, required fields, target distribution,
 * internal consistency of dates and stages, the model artefacts, the query store
 * and the CSV/PDF deliverables. Exits non-zero if anything fails, so it can gate
 * a rebuild.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { LIFECYCLE_STAGES } from './lib/geo-reference.mjs';
import { dayFromISO } from './lib/rand.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CSV = path.join(DATA, 'land_acquisition_synthetic_350k.csv');
const PDF = path.join(DATA, 'land_acquisition_synthetic_350k.pdf');

const EXPECTED_COLUMNS = 60;
const MIN_RECORDS = 300000;
const MAX_RECORDS = 400000;
const DELAY_THRESHOLD = 30;

let failures = 0;
let warnings = 0;

const pass = (label, detail = '') => console.log(`  \x1b[32mPASS\x1b[0m  ${label}${detail ? ` — ${detail}` : ''}`);
const fail = (label, detail = '') => {
  failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` — ${detail}` : ''}`);
};
const warn = (label, detail = '') => {
  warnings++;
  console.log(`  \x1b[33mWARN\x1b[0m  ${label}${detail ? ` — ${detail}` : ''}`);
};
const check = (ok, label, detail) => (ok ? pass(label, detail) : fail(label, detail));
const section = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`);

const fmt = (n) => Number(n).toLocaleString('en-IN');

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

/* ------------------------------------------------------------------- corpus */

async function verifyCorpus() {
  section('Corpus');
  if (!fs.existsSync(CSV)) {
    fail('corpus CSV exists', 'run npm run data:generate');
    return null;
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV, { highWaterMark: 1 << 22 }),
    crlfDelay: Infinity,
  });

  let header = null;
  const ix = {};
  let rows = 0;
  let badFieldCount = 0;
  let observed = 0;
  let positives = 0;
  let blankRequired = 0;
  let dateOrderViolations = 0;
  let labelLeak = 0;
  let stageUnknown = 0;
  let milestoneMismatch = 0;
  const ids = new Set();
  let duplicateIds = 0;
  const rowHashes = new Set();
  let duplicateRows = 0;
  const stageCounts = new Map();
  const bandCounts = new Map();
  const states = new Set();
  const projects = new Set();

  // Columns that must never be blank.
  const REQUIRED = [
    'case_id', 'project_id', 'parcel_id', 'state', 'district', 'latitude', 'longitude',
    'project_type', 'authority', 'land_area_ha', 'current_stage', 'stage_start_date',
    'expected_stage_days', 'elapsed_stage_days', 'milestone_due_date', 'assessment_date',
    'ownership_complexity', 'compensation_status', 'legal_dispute', 'label_observed',
  ];

  for await (const line of rl) {
    if (!line) continue;
    if (header === null) {
      header = line.split(',');
      header.forEach((h, i) => (ix[h] = i));
      continue;
    }
    const cells = splitCsv(line);
    if (cells.length !== header.length) badFieldCount++;
    rows++;

    const id = cells[ix.case_id];
    if (ids.has(id)) duplicateIds++;
    else ids.add(id);

    // Duplicate detection ignores the identifier columns, so a genuinely repeated
    // record would be caught even if it carried a fresh id.
    const body = cells.slice(3).join('|');
    if (rowHashes.has(body)) duplicateRows++;
    else rowHashes.add(body);

    for (const col of REQUIRED) {
      if (cells[ix[col]] === '' || cells[ix[col]] === undefined) {
        blankRequired++;
        break;
      }
    }

    const stage = cells[ix.current_stage];
    if (!LIFECYCLE_STAGES.includes(stage)) stageUnknown++;
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
    states.add(cells[ix.state]);
    projects.add(cells[ix.project_id]);

    const start = dayFromISO(cells[ix.stage_start_date]);
    const due = dayFromISO(cells[ix.milestone_due_date]);
    const assess = dayFromISO(cells[ix.assessment_date]);
    const projectStart = dayFromISO(cells[ix.project_start_date]);
    if (start < projectStart || due < start || assess < start) dateOrderViolations++;
    if (due - start !== Number(cells[ix.expected_stage_days])) milestoneMismatch++;

    const isObserved = cells[ix.label_observed] === '1';
    if (isObserved) {
      observed++;
      if (cells[ix.next_milestone_delayed] === '1') positives++;
      if (cells[ix.next_milestone_delayed] === '') labelLeak++;
      bandCounts.set(cells[ix.delay_risk_category], (bandCounts.get(cells[ix.delay_risk_category]) ?? 0) + 1);
    } else if (cells[ix.next_milestone_delayed] !== '' || cells[ix.delay_risk_category] !== '') {
      // An open row carrying a target would be look-ahead leakage.
      labelLeak++;
    }
  }

  check(rows >= MIN_RECORDS && rows <= MAX_RECORDS, 'record count in range', `${fmt(rows)} rows (target 300k-400k)`);
  check(header.length === EXPECTED_COLUMNS, 'column count', `${header.length} columns`);
  check(badFieldCount === 0, 'every row has the full field count', `${badFieldCount} malformed`);
  check(duplicateIds === 0, 'case ids unique', `${duplicateIds} duplicates`);
  check(duplicateRows === 0, 'no duplicate records', `${duplicateRows} repeated bodies`);
  check(blankRequired === 0, 'required fields populated', `${blankRequired} rows with a blank required field`);
  check(stageUnknown === 0, 'stages within the lifecycle', `${stageUnknown} unknown`);
  check(dateOrderViolations === 0, 'dates ordered', `${dateOrderViolations} violations`);
  check(milestoneMismatch === 0, 'milestone_due_date = stage_start + expected_stage_days', `${milestoneMismatch} mismatches`);
  check(labelLeak === 0, 'targets present only on observable rows', `${labelLeak} leaking rows`);

  const positiveRate = positives / Math.max(1, observed);
  check(
    positiveRate > 0.2 && positiveRate < 0.55,
    'target distribution balanced',
    `${(positiveRate * 100).toFixed(2)}% positive on ${fmt(observed)} labelled rows`,
  );
  const observedShare = observed / rows;
  check(observedShare > 0.4 && observedShare < 0.9, 'labelled share reasonable', `${(observedShare * 100).toFixed(1)}%`);
  check(states.size >= 15, 'state coverage', `${states.size} states`);
  check(projects.size >= 100, 'project coverage', `${fmt(projects.size)} projects`);
  check(stageCounts.size === LIFECYCLE_STAGES.length, 'all nine stages represented', `${stageCounts.size} stages`);

  const bandTotal = Array.from(bandCounts.values()).reduce((a, b) => a + b, 0);
  const bandSummary = Array.from(bandCounts.entries())
    .filter(([k]) => k)
    .map(([k, v]) => `${k} ${((v / bandTotal) * 100).toFixed(0)}%`)
    .join(' · ');
  pass('ground-truth risk bands', bandSummary);

  return { rows, observed, positives, header };
}

/* ------------------------------------------------------------------- model */

function verifyModel(corpus) {
  section('Model artefacts');
  const modelDir = path.join(DATA, 'model');
  const files = ['metrics.json', 'importance.json', 'surrogate.json', 'scores.f32'];
  for (const f of files) {
    check(fs.existsSync(path.join(modelDir, f)), `${f} present`);
  }
  if (!fs.existsSync(path.join(modelDir, 'metrics.json'))) return;

  const metrics = JSON.parse(fs.readFileSync(path.join(modelDir, 'metrics.json'), 'utf8'));
  const deployed = metrics.models[metrics.deployed];

  check(metrics.corpusRows === corpus?.rows, 'model trained on the current corpus', `${fmt(metrics.corpusRows)} rows`);
  check(deployed.test.rocAuc > 0.7, 'test ROC-AUC above 0.70', String(deployed.test.rocAuc));
  check(deployed.test.prAuc > 0.5, 'test PR-AUC above 0.50', String(deployed.test.prAuc));
  check(deployed.test.at_threshold.f1 > 0.5, 'test F1 above 0.50', String(deployed.test.at_threshold.f1));
  check(
    metrics.split.train.to <= metrics.split.validation.from && metrics.split.validation.to <= metrics.split.test.from,
    'split is chronological with no overlap',
    `${metrics.split.train.from} → ${metrics.split.test.to}`,
  );
  check(metrics.target.definition.includes(String(DELAY_THRESHOLD)), 'target definition documented');

  const scores = fs.statSync(path.join(modelDir, 'scores.f32')).size / 4;
  check(scores === corpus?.rows, 'one score per corpus row', `${fmt(scores)} scores`);

  const shapPath = path.join(modelDir, 'shap_top.bin');
  if (fs.existsSync(shapPath)) {
    const buf = fs.readFileSync(shapPath, { encoding: null });
    const rows = buf.readUInt32LE(0);
    const k = buf.readUInt32LE(4);
    check(rows === corpus?.rows, 'SHAP contributions cover every row', `${fmt(rows)} rows x ${k} contributors`);
  } else {
    warn('SHAP contributions missing', 'explanations will fall back to the surrogate');
  }

  const surrogate = JSON.parse(fs.readFileSync(path.join(modelDir, 'surrogate.json'), 'utf8'));
  check(surrogate.fidelity.logOddsR2 > 0.85, 'surrogate tracks the ensemble', `R2 ${surrogate.fidelity.logOddsR2}`);
  check(Array.isArray(surrogate.features) && surrogate.features.length > 50, 'surrogate carries its feature spec', `${surrogate.features.length} features`);
}

/* ------------------------------------------------------------------- store */

function verifyStore(corpus) {
  section('Query store and API payloads');
  const storeDir = path.join(DATA, 'store');
  const apiDir = path.join(DATA, 'api');
  for (const f of ['store/cases.bin', 'store/cases.meta.json', 'api/summary.json', 'api/projects.json', 'api/geo.json', 'api/model.json']) {
    check(fs.existsSync(path.join(DATA, f)), `${f} present`);
  }
  if (!fs.existsSync(path.join(storeDir, 'cases.meta.json'))) return;

  const meta = JSON.parse(fs.readFileSync(path.join(storeDir, 'cases.meta.json'), 'utf8'));
  const binBytes = fs.statSync(path.join(storeDir, 'cases.bin')).size;
  check(meta.rows === corpus?.rows, 'store row count matches the corpus', `${fmt(meta.rows)} rows`);
  check(binBytes === meta.totalBytes, 'store binary matches its layout', `${(binBytes / 1048576).toFixed(1)} MB`);

  const summary = JSON.parse(fs.readFileSync(path.join(apiDir, 'summary.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(apiDir, 'projects.json'), 'utf8'));
  const parcelSum = registry.projects.reduce((s, p) => s + p.totalParcels, 0);
  check(parcelSum === corpus?.rows, 'project parcel counts sum to the corpus', `${fmt(parcelSum)}`);
  check(summary.totals.projects === registry.projects.length, 'summary and registry agree on project count');
  check(
    summary.totals.openCases + summary.totals.observedCases === summary.totals.cases,
    'open + observed = total cases',
  );
  check(
    registry.projects.every((p) => p.stages.length === 9 && p.stageRisk.length === 9),
    'every project carries a nine-stage lifecycle',
  );
  check(
    registry.projects.every((p) => p.riskScore >= 0 && p.riskScore <= 100),
    'project risk scores within range',
  );
  const withContributors = registry.projects.filter((p) => p.contributors.length > 0).length;
  check(withContributors > registry.projects.length * 0.9, 'projects carry contributor attribution', `${withContributors}/${registry.projects.length}`);
}

/* ------------------------------------------------------------- deliverables */

function verifyDeliverables() {
  section('Deliverables');
  if (fs.existsSync(CSV)) {
    const bytes = fs.statSync(CSV).size;
    pass('land_acquisition_synthetic_350k.csv', `${(bytes / 1048576).toFixed(1)} MB`);
  } else {
    fail('land_acquisition_synthetic_350k.csv missing');
  }

  if (!fs.existsSync(PDF)) {
    fail('land_acquisition_synthetic_350k.pdf missing', 'run npm run data:pdf');
    return;
  }
  const buf = fs.readFileSync(PDF);
  const headerOk = buf.subarray(0, 5).toString('latin1') === '%PDF-';
  const trailerOk = buf.subarray(-1024).toString('latin1').includes('%%EOF');
  const pageCount = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check(headerOk && trailerOk, 'PDF structurally valid', `${(buf.length / 1048576).toFixed(2)} MB`);
  check(pageCount > 20, 'PDF has its documentation and data pages', `${pageCount} pages`);
}

/* -------------------------------------------------------------------- main */

async function main() {
  console.log('\n\x1b[1mLandPulse AI data verification\x1b[0m');
  const corpus = await verifyCorpus();
  verifyModel(corpus);
  verifyStore(corpus);
  verifyDeliverables();

  console.log(
    `\n${failures === 0 ? '\x1b[32mAll checks passed\x1b[0m' : `\x1b[31m${failures} check(s) failed\x1b[0m`}` +
      `${warnings ? ` · ${warnings} warning(s)` : ''}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
