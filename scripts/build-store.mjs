/**
 * Builds the query store and the precomputed API payloads.
 *
 *   node scripts/build-store.mjs
 *
 * Reads
 *   data/land_acquisition_synthetic_350k.csv   the corpus
 *   data/projects.raw.json                     project registry
 *   data/dataset-meta.json                     generation statistics
 *   data/model/scores.f32                      per-row predicted probability
 *   data/model/shap_top.bin                    per-row top SHAP contributors
 *   data/model/{metrics,importance,surrogate}.json
 *
 * Writes
 *   data/store/cases.bin + cases.meta.json     columnar store the API queries
 *   data/api/*.json                            precomputed aggregate payloads
 *
 * The store is columnar and typed so that 350,000 cases can be filtered,
 * sorted, aggregated and paged server-side in a few milliseconds without ever
 * materialising objects for rows nobody asked for.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { mulberry32, dayFromISO, isoFromDay, clamp } from './lib/rand.mjs';
import { LIFECYCLE_STAGES, STAGE_MILESTONE } from './lib/geo-reference.mjs';
import { interventionFor } from '../server/lib/interventions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const STORE = path.join(DATA, 'store');
const API = path.join(DATA, 'api');

const CSV = path.join(DATA, 'land_acquisition_synthetic_350k.csv');
const TODAY = '2026-09-11';
const TODAY_DAY = dayFromISO(TODAY);

const need = (p) => {
  if (!fs.existsSync(p)) {
    console.error(`[build] missing ${path.relative(ROOT, p)} — run the generator and ml/train.py first`);
    process.exit(1);
  }
  return p;
};

need(CSV);
need(path.join(DATA, 'projects.raw.json'));
need(path.join(DATA, 'model', 'scores.f32'));

const metrics = JSON.parse(fs.readFileSync(path.join(DATA, 'model', 'metrics.json'), 'utf8'));
const importance = JSON.parse(fs.readFileSync(path.join(DATA, 'model', 'importance.json'), 'utf8'));
const surrogate = JSON.parse(fs.readFileSync(path.join(DATA, 'model', 'surrogate.json'), 'utf8'));
const datasetMeta = JSON.parse(fs.readFileSync(path.join(DATA, 'dataset-meta.json'), 'utf8'));
const registryRaw = JSON.parse(fs.readFileSync(path.join(DATA, 'projects.raw.json'), 'utf8'));

const BANDS = metrics.riskBands ?? surrogate.riskBands ?? { medium: 0.3, high: 0.55, critical: 0.78 };
const BAND_NAMES = ['Low', 'Medium', 'High', 'Critical'];
const bandOf = (p) => (p >= BANDS.critical ? 3 : p >= BANDS.high ? 2 : p >= BANDS.medium ? 1 : 0);

/* ------------------------------------------------------------ dictionaries */

class Dict {
  constructor() {
    this.values = [];
    this.index = new Map();
  }
  id(v) {
    let i = this.index.get(v);
    if (i === undefined) {
      i = this.values.length;
      this.values.push(v);
      this.index.set(v, i);
    }
    return i;
  }
}

const dicts = {
  state: new Dict(),
  district: new Dict(), // "State|District"
  tehsil: new Dict(),
  village: new Dict(),
  landType: new Dict(),
  ownership: new Dict(),
  compStatus: new Dict(),
  compBand: new Dict(),
  dispute: new Dict(),
  responsiveness: new Dict(),
  verification: new Dict(),
  approval: new Dict(),
  possession: new Dict(),
  rrStatus: new Dict(),
  authority: new Dict(),
  projectType: new Dict(),
  priority: new Dict(),
};

const stageId = new Map(LIFECYCLE_STAGES.map((s, i) => [s, i]));
const projectIndex = new Map(registryRaw.projects.map((p, i) => [p.id, i]));

/* ------------------------------------------------------------------ layout */

const ROWS = datasetMeta.records;

const spec = [
  ['projectIdx', Uint16Array],
  ['districtIdx', Uint16Array],
  ['tehsilIdx', Uint16Array],
  ['villageIdx', Uint16Array],
  ['lat', Float32Array],
  ['lon', Float32Array],
  ['stageIdx', Uint8Array],
  ['landTypeIdx', Uint8Array],
  ['ownershipIdx', Uint8Array],
  ['compStatusIdx', Uint8Array],
  ['compBandIdx', Uint8Array],
  ['disputeIdx', Uint8Array],
  ['respIdx', Uint8Array],
  ['verifIdx', Uint8Array],
  ['approvalIdx', Uint8Array],
  ['possessionIdx', Uint8Array],
  ['rrStatusIdx', Uint8Array],
  ['areaHa', Float32Array],
  ['expectedDays', Uint16Array],
  ['elapsedDays', Uint16Array],
  ['families', Int16Array],
  ['owners', Int16Array],
  ['compPendingDays', Uint16Array],
  ['compCompletion', Int8Array],
  ['legalDispute', Uint8Array],
  ['legalCases', Uint8Array],
  ['rrRequired', Uint8Array],
  ['rrProgress', Int8Array],
  ['rehabCases', Uint16Array],
  ['deptDays', Int16Array],
  ['docComplete', Int8Array],
  ['inactivity', Uint16Array],
  ['histStageRate', Uint16Array],
  ['stageStartDay', Int32Array],
  ['dueDay', Int32Array],
  ['assessDay', Int32Array],
  ['observed', Uint8Array],
  ['delayed', Int8Array],
  ['truthBand', Int8Array],
  ['actualDelay', Int16Array],
  ['score', Float32Array],
  ['riskBand', Uint8Array],
  ['quality', Uint8Array],
  ['surveyNum', Uint16Array],
  ['surveyDen', Uint8Array],
  ['surveySuffix', Uint8Array],
];

const col = {};
for (const [name, T] of spec) col[name] = new T(ROWS);

const SHAP_K = 6;
const shapIdx = new Int16Array(ROWS * SHAP_K);
const shapVal = new Float32Array(ROWS * SHAP_K);

/* --------------------------------------------------------------- read SHAP */

const shapPath = path.join(DATA, 'model', 'shap_top.bin');
let shapAvailable = false;
if (fs.existsSync(shapPath)) {
  const buf = fs.readFileSync(shapPath);
  const rows = buf.readUInt32LE(0);
  const k = buf.readUInt32LE(4);
  if (rows === ROWS && k === SHAP_K) {
    const idxBytes = rows * k * 2;
    shapIdx.set(new Int16Array(buf.buffer, buf.byteOffset + 12, rows * k));
    shapVal.set(new Float32Array(buf.buffer, buf.byteOffset + 12 + idxBytes, rows * k));
    shapAvailable = true;
  } else {
    console.warn(`[build] shap_top.bin shape ${rows}x${k} does not match corpus ${ROWS}x${SHAP_K}; ignoring`);
  }
}

const scores = new Float32Array(
  fs.readFileSync(path.join(DATA, 'model', 'scores.f32')).buffer.slice(0),
);
if (scores.length !== ROWS) {
  console.error(`[build] scores.f32 has ${scores.length} rows, corpus has ${ROWS}`);
  process.exit(1);
}

/* ------------------------------------------------------------- CSV parsing */

/** Tolerant field splitter: handles quoted fields, which the generator emits
 *  only when a value itself contains a comma. */
function splitCsv(line, out) {
  let field = 0;
  let start = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charCodeAt(i);
    if (quoted) {
      if (ch === 34) quoted = false;
    } else if (ch === 34) {
      quoted = true;
    } else if (ch === 44) {
      out[field++] = line.slice(start, i);
      start = i + 1;
    }
  }
  out[field++] = line.slice(start);
  return field;
}

const unquote = (s) => (s.charCodeAt(0) === 34 ? s.slice(1, -1).replace(/""/g, '"') : s);
const numOr = (s, fallback) => (s === '' ? fallback : Number(s));

const MISSING_FIELDS = [
  'affected_families',
  'compensation_amount_band',
  'document_completeness',
  'stakeholder_responsiveness',
  'department_response_days',
  'number_of_owners',
  'rr_progress_percentage',
];

async function readCorpus() {
  const t0 = Date.now();
  const rl = readline.createInterface({
    input: fs.createReadStream(CSV, { highWaterMark: 1 << 22 }),
    crlfDelay: Infinity,
  });

  let header = null;
  const ix = {};
  const cells = new Array(80);
  let row = 0;

  // aggregation accumulators
  const districtAgg = new Map();
  const stateAgg = new Map();
  const stageAgg = LIFECYCLE_STAGES.map(() => ({
    cases: 0, open: 0, scoreSum: 0, openScoreSum: 0, band: [0, 0, 0, 0],
    observed: 0, delayed: 0, delaySum: 0, delayN: 0, elapsedSum: 0, expectedSum: 0,
  }));
  const projectAgg = registryRaw.projects.map(() => ({
    open: 0, scoreSum: 0, band: [0, 0, 0, 0], high: 0, critical: 0,
    stageOpen: LIFECYCLE_STAGES.map(() => ({ n: 0, scoreSum: 0, band: [0, 0, 0, 0] })),
    shap: new Map(), qualitySum: 0, n: 0, worst: -1, worstScore: -1,
    observed: 0, delayed: 0,
  }));
  const contributorAgg = new Map();
  const monthAgg = new Map();
  const scoreHist = new Array(20).fill(0);
  const qualityHist = new Array(10).fill(0);
  const missingCount = Object.fromEntries(MISSING_FIELDS.map((f) => [f, 0]));
  let openCount = 0;

  const featureSpec = surrogate.features ?? [];
  const featureGroup = featureSpec.map((f) => f.group ?? 'Other');

  for await (const line of rl) {
    if (!line) continue;
    if (header === null) {
      header = line.split(',');
      header.forEach((h, i) => (ix[h] = i));
      continue;
    }
    splitCsv(line, cells);

    const pIdx = projectIndex.get(cells[ix.project_id]);
    const state = cells[ix.state];
    const district = cells[ix.district];
    const dKey = `${state}|${district}`;

    const stage = stageId.get(unquote(cells[ix.current_stage]));
    const score = scores[row];
    const band = bandOf(score);

    let missing = 0;
    for (const f of MISSING_FIELDS) {
      if (cells[ix[f]] === '') {
        if (f !== 'rr_progress_percentage' || cells[ix.rr_required] === '1') {
          missing++;
          missingCount[f]++;
        }
      }
    }
    // Completeness across the fields the model consumes, plus the two checks
    // that matter operationally (a verified record and a filed approval).
    const quality = Math.round(
      clamp(100 - missing * 9 - (cells[ix.verification_status] === 'Pending' ? 6 : 0) -
        (cells[ix.approval_status] === 'Not Submitted' ? 5 : 0), 25, 100),
    );

    col.projectIdx[row] = pIdx;
    col.districtIdx[row] = dicts.district.id(dKey);
    col.tehsilIdx[row] = dicts.tehsil.id(unquote(cells[ix.tehsil]));
    col.villageIdx[row] = dicts.village.id(unquote(cells[ix.village]));
    col.lat[row] = Number(cells[ix.latitude]);
    col.lon[row] = Number(cells[ix.longitude]);
    col.stageIdx[row] = stage;
    col.landTypeIdx[row] = dicts.landType.id(unquote(cells[ix.land_type]));
    col.ownershipIdx[row] = dicts.ownership.id(cells[ix.ownership_complexity]);
    col.compStatusIdx[row] = dicts.compStatus.id(unquote(cells[ix.compensation_status]));
    col.compBandIdx[row] = cells[ix.compensation_amount_band] === ''
      ? 255
      : dicts.compBand.id(cells[ix.compensation_amount_band]);
    col.disputeIdx[row] = dicts.dispute.id(cells[ix.dispute_complexity]);
    col.respIdx[row] = cells[ix.stakeholder_responsiveness] === ''
      ? 255
      : dicts.responsiveness.id(cells[ix.stakeholder_responsiveness]);
    col.verifIdx[row] = dicts.verification.id(cells[ix.verification_status]);
    col.approvalIdx[row] = dicts.approval.id(unquote(cells[ix.approval_status]));
    col.possessionIdx[row] = dicts.possession.id(unquote(cells[ix.possession_status]));
    col.rrStatusIdx[row] = dicts.rrStatus.id(unquote(cells[ix.rr_status]));
    col.areaHa[row] = Number(cells[ix.land_area_ha]);
    col.expectedDays[row] = Number(cells[ix.expected_stage_days]);
    col.elapsedDays[row] = Number(cells[ix.elapsed_stage_days]);
    col.families[row] = numOr(cells[ix.affected_families], -1);
    col.owners[row] = numOr(cells[ix.number_of_owners], -1);
    col.compPendingDays[row] = Number(cells[ix.compensation_pending_days]);
    col.compCompletion[row] = Number(cells[ix.compensation_completion_percentage]);
    col.legalDispute[row] = Number(cells[ix.legal_dispute]);
    col.legalCases[row] = Number(cells[ix.legal_case_count]);
    col.rrRequired[row] = Number(cells[ix.rr_required]);
    col.rrProgress[row] = numOr(cells[ix.rr_progress_percentage], -1);
    col.rehabCases[row] = Number(cells[ix.rehabilitation_cases]);
    col.deptDays[row] = numOr(cells[ix.department_response_days], -1);
    col.docComplete[row] = numOr(cells[ix.document_completeness], -1);
    col.inactivity[row] = Number(cells[ix.inactivity_days]);
    col.histStageRate[row] = Math.round(Number(cells[ix.historical_stage_delay_rate]) * 1000);
    col.stageStartDay[row] = dayFromISO(cells[ix.stage_start_date]);
    col.dueDay[row] = dayFromISO(cells[ix.milestone_due_date]);
    col.assessDay[row] = dayFromISO(cells[ix.assessment_date]);
    col.observed[row] = Number(cells[ix.label_observed]);
    col.delayed[row] = cells[ix.next_milestone_delayed] === '' ? -1 : Number(cells[ix.next_milestone_delayed]);
    col.truthBand[row] = cells[ix.delay_risk_category] === ''
      ? -1
      : BAND_NAMES.indexOf(cells[ix.delay_risk_category]);
    col.actualDelay[row] = cells[ix.actual_stage_delay_days] === ''
      ? -9999
      : Number(cells[ix.actual_stage_delay_days]);
    col.score[row] = score;
    col.riskBand[row] = band;
    col.quality[row] = quality;

    const survey = cells[ix.survey_number];
    const slash = survey.indexOf('/');
    col.surveyNum[row] = Number(survey.slice(0, slash));
    const rest = survey.slice(slash + 1);
    const suffixChar = rest.charCodeAt(rest.length - 1);
    const hasSuffix = suffixChar >= 65 && suffixChar <= 90;
    col.surveyDen[row] = Number(hasSuffix ? rest.slice(0, -1) : rest);
    col.surveySuffix[row] = hasSuffix ? suffixChar : 0;

    dicts.state.id(state);
    dicts.authority.id(unquote(cells[ix.authority]));
    dicts.projectType.id(unquote(cells[ix.project_type]));
    dicts.priority.id(cells[ix.project_priority]);

    /* ---------------------------------------------------------- aggregate */
    const isOpen = col.observed[row] === 0;
    if (isOpen) openCount++;

    const sa = stageAgg[stage];
    sa.cases++;
    sa.scoreSum += score;
    sa.elapsedSum += col.elapsedDays[row];
    sa.expectedSum += col.expectedDays[row];
    if (isOpen) {
      sa.open++;
      sa.openScoreSum += score;
      sa.band[band]++;
    } else {
      sa.observed++;
      sa.delayed += col.delayed[row] === 1 ? 1 : 0;
      if (col.actualDelay[row] !== -9999) {
        sa.delaySum += col.actualDelay[row];
        sa.delayN++;
      }
    }

    let da = districtAgg.get(dKey);
    if (!da) {
      da = { state, district, cases: 0, open: 0, scoreSum: 0, band: [0, 0, 0, 0], lat: 0, lon: 0, areaHa: 0, legal: 0, observed: 0, delayed: 0 };
      districtAgg.set(dKey, da);
    }
    da.cases++;
    da.areaHa += col.areaHa[row];
    da.legal += col.legalDispute[row];
    da.lat += col.lat[row];
    da.lon += col.lon[row];
    if (isOpen) {
      da.open++;
      da.scoreSum += score;
      da.band[band]++;
    } else {
      da.observed++;
      da.delayed += col.delayed[row] === 1 ? 1 : 0;
    }

    let st = stateAgg.get(state);
    if (!st) {
      st = { state, cases: 0, open: 0, scoreSum: 0, band: [0, 0, 0, 0], areaHa: 0, observed: 0, delayed: 0, projects: new Set() };
      stateAgg.set(state, st);
    }
    st.cases++;
    st.areaHa += col.areaHa[row];
    st.projects.add(cells[ix.project_id]);
    if (isOpen) {
      st.open++;
      st.scoreSum += score;
      st.band[band]++;
    } else {
      st.observed++;
      st.delayed += col.delayed[row] === 1 ? 1 : 0;
    }

    const pa = projectAgg[pIdx];
    pa.n++;
    pa.qualitySum += quality;
    if (isOpen) {
      pa.open++;
      pa.scoreSum += score;
      pa.band[band]++;
      if (band === 2) pa.high++;
      if (band === 3) pa.critical++;
      const ps = pa.stageOpen[stage];
      ps.n++;
      ps.scoreSum += score;
      ps.band[band]++;
      if (score > pa.worstScore) {
        pa.worstScore = score;
        pa.worst = row;
      }
      // Contributor mass for the project's open book, grouped for display.
      if (shapAvailable) {
        for (let k = 0; k < SHAP_K; k++) {
          const fi = shapIdx[row * SHAP_K + k];
          const v = shapVal[row * SHAP_K + k];
          if (v <= 0) continue; // only risk-increasing contributions
          const g = featureGroup[fi] ?? 'Other';
          pa.shap.set(g, (pa.shap.get(g) ?? 0) + v);
          contributorAgg.set(g, (contributorAgg.get(g) ?? 0) + v);
        }
      }
    } else {
      pa.observed++;
      pa.delayed += col.delayed[row] === 1 ? 1 : 0;
    }

    scoreHist[Math.min(19, Math.floor(score * 20))]++;
    qualityHist[Math.min(9, Math.floor(quality / 10))]++;

    const ym = isoFromDay(col.assessDay[row]).slice(0, 7);
    let ma = monthAgg.get(ym);
    if (!ma) {
      ma = { month: ym, cases: 0, observed: 0, delayed: 0, scoreSum: 0, delaySum: 0, delayN: 0 };
      monthAgg.set(ym, ma);
    }
    ma.cases++;
    ma.scoreSum += score;
    if (!isOpen) {
      ma.observed++;
      ma.delayed += col.delayed[row] === 1 ? 1 : 0;
      if (col.actualDelay[row] !== -9999) {
        ma.delaySum += col.actualDelay[row];
        ma.delayN++;
      }
    }

    row++;
    if (row % 100000 === 0) console.log(`[build] parsed ${row.toLocaleString('en-IN')} rows…`);
  }

  console.log(`[build] parsed ${row.toLocaleString('en-IN')} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (row !== ROWS) {
    console.error(`[build] expected ${ROWS} rows, read ${row}`);
    process.exit(1);
  }

  return { districtAgg, stateAgg, stageAgg, projectAgg, contributorAgg, monthAgg, scoreHist, qualityHist, missingCount, openCount };
}

/* ------------------------------------------------------------------- build */

async function main() {
  fs.mkdirSync(STORE, { recursive: true });
  fs.mkdirSync(API, { recursive: true });

  const agg = await readCorpus();

  /* ------------------------------------------------------- write the store */
  let offset = 0;
  const layout = [];
  for (const [name, T] of spec) {
    const bytes = col[name].byteLength;
    layout.push({ name, dtype: T.name, offset, bytes, rows: ROWS });
    offset += bytes;
  }
  const shapIdxOffset = offset;
  offset += shapIdx.byteLength;
  const shapValOffset = offset;
  offset += shapVal.byteLength;

  const out = fs.createWriteStream(path.join(STORE, 'cases.bin'));
  const write = (buf) => (out.write(buf) ? Promise.resolve() : new Promise((r) => out.once('drain', r)));
  for (const [name] of spec) await write(Buffer.from(col[name].buffer, col[name].byteOffset, col[name].byteLength));
  await write(Buffer.from(shapIdx.buffer));
  await write(Buffer.from(shapVal.buffer));
  await new Promise((r) => out.end(r));

  const districts = Array.from(agg.districtAgg.entries()).map(([key, d]) => ({
    key,
    state: d.state,
    district: d.district,
    cases: d.cases,
    openCases: d.open,
    riskScore: d.open ? Math.round((d.scoreSum / d.open) * 100) : 0,
    band: d.band,
    observedDelayRate: d.observed ? Number((d.delayed / d.observed).toFixed(4)) : 0,
    areaHa: Number(d.areaHa.toFixed(1)),
    legalDisputes: d.legal,
    lat: Number((d.lat / d.cases).toFixed(4)),
    lon: Number((d.lon / d.cases).toFixed(4)),
  }));
  const districtKeyOrder = dicts.district.values;

  fs.writeFileSync(
    path.join(STORE, 'cases.meta.json'),
    JSON.stringify({
      rows: ROWS,
      today: TODAY,
      todayDay: TODAY_DAY,
      shapK: SHAP_K,
      shapAvailable,
      layout,
      shapIdxOffset,
      shapValOffset,
      totalBytes: offset,
      riskBands: BANDS,
      bandNames: BAND_NAMES,
      stages: LIFECYCLE_STAGES,
      dicts: Object.fromEntries(Object.entries(dicts).map(([k, d]) => [k, d.values])),
      districtOrder: districtKeyOrder,
      districtTable: districtKeyOrder.map((key) => districts.find((d) => d.key === key)),
    }),
  );
  console.log(`[build] store written: ${(offset / 1048576).toFixed(1)} MB`);

  /* ------------------------------------------------- project registry v2 */
  const featureSpec = surrogate.features ?? [];
  const trendRng = mulberry32(31415926);

  const projects = registryRaw.projects.map((p, i) => {
    const pa = agg.projectAgg[i];
    const riskScore = pa.open ? Math.round((pa.scoreSum / pa.open) * 100) : 0;
    const openProb = pa.open ? pa.scoreSum / pa.open : 0;

    const contributors = Array.from(pa.shap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const contribTotal = contributors.reduce((s, c) => s + c[1], 0) || 1;

    const stageRisk = p.stages.map((s, si) => {
      const ps = pa.stageOpen[si];
      const hasOpen = ps.n > 0;
      // A stage with no open cases is reported on its observed history instead of
      // a live prediction, and is labelled that way in the UI.
      return {
        stage: s.name,
        index: si,
        openCases: ps.n,
        riskScore: hasOpen ? Math.round((ps.scoreSum / ps.n) * 100) : null,
        band: hasOpen ? BAND_NAMES[bandOf(ps.scoreSum / ps.n)] : null,
        mix: ps.band,
        basis: hasOpen ? 'model' : s.status === 'Completed' ? 'observed' : 'no-open-cases',
      };
    });

    const currentStageRisk = stageRisk[p.currentStageIndex];
    const topGroup = contributors[0]?.[0] ?? 'Other';

    // Headline project risk is the risk attached to the *next* milestone — the
    // decision an officer actually faces this month — and only falls back to the
    // portfolio mean when the frontier stage has no open cases left. Averaging
    // every open case would flatten exactly the signal the screen exists for.
    const headlineProb =
      currentStageRisk && currentStageRisk.openCases > 0
        ? currentStageRisk.riskScore / 100
        : openProb;

    // Twelve-month risk history: a seeded walk that ends on the live score, so
    // the trend and the headline number always agree.
    const history = [];
    let walk = Math.round(headlineProb * 100);
    for (let m = 0; m < 12; m++) {
      history.push(walk);
      walk = Math.round(clamp(walk - (trendRng() * 6 - 2.2), 4, 99));
    }
    history.reverse();


    return {
      ...p,
      riskScore: Math.round(headlineProb * 100),
      riskBand: BAND_NAMES[bandOf(headlineProb)],
      delayProbability: Number(headlineProb.toFixed(4)),
      riskBasis: currentStageRisk && currentStageRisk.openCases > 0 ? 'next-milestone' : 'open-book-mean',
      portfolioRiskScore: riskScore,
      openCases: pa.open,
      highRiskCases: pa.high + pa.critical,
      criticalCases: pa.critical,
      riskMix: { Low: pa.band[0], Medium: pa.band[1], High: pa.band[2], Critical: pa.band[3] },
      observedCases: pa.observed,
      observedDelayRate: pa.observed ? Number((pa.delayed / pa.observed).toFixed(4)) : 0,
      dataQuality: pa.n ? Math.round(pa.qualitySum / pa.n) : 0,
      stageRisk,
      currentStageRisk: currentStageRisk?.riskScore ?? null,
      currentStageBand: currentStageRisk?.band ?? null,
      contributors: contributors.map(([group, value]) => ({
        group,
        value: Number(value.toFixed(4)),
        share: Number((value / contribTotal).toFixed(4)),
      })),
      intervention: interventionFor(topGroup),
      riskHistory: history,
      worstCaseRow: pa.worst,
    };
  });

  fs.writeFileSync(path.join(API, 'projects.json'), JSON.stringify({ today: TODAY, projects }));

  /* --------------------------------------------------------------- states */
  const states = Array.from(agg.stateAgg.values()).map((s) => ({
    state: s.state,
    projects: s.projects.size,
    cases: s.cases,
    openCases: s.open,
    riskScore: s.open ? Math.round((s.scoreSum / s.open) * 100) : 0,
    riskBand: BAND_NAMES[bandOf(s.open ? s.scoreSum / s.open : 0)],
    mix: { Low: s.band[0], Medium: s.band[1], High: s.band[2], Critical: s.band[3] },
    highRiskCases: s.band[2] + s.band[3],
    areaHa: Number(s.areaHa.toFixed(1)),
    observedDelayRate: s.observed ? Number((s.delayed / s.observed).toFixed(4)) : 0,
  }));

  /* --------------------------------------------------------------- stages */
  const stages = LIFECYCLE_STAGES.map((name, i) => {
    const s = agg.stageAgg[i];
    return {
      stage: name,
      milestone: STAGE_MILESTONE[name],
      cases: s.cases,
      openCases: s.open,
      riskScore: s.open ? Math.round((s.openScoreSum / s.open) * 100) : 0,
      riskBand: BAND_NAMES[bandOf(s.open ? s.openScoreSum / s.open : 0)],
      mix: { Low: s.band[0], Medium: s.band[1], High: s.band[2], Critical: s.band[3] },
      observedCases: s.observed,
      observedDelayRate: s.observed ? Number((s.delayed / s.observed).toFixed(4)) : 0,
      medianStageDays: Math.round(s.expectedSum / Math.max(1, s.cases)),
      avgObservedDelayDays: s.delayN ? Number((s.delaySum / s.delayN).toFixed(1)) : 0,
    };
  });

  /* ------------------------------------------------------------ portfolio */
  const totalHigh = projects.reduce((a, p) => a + p.highRiskCases, 0);
  const totalCritical = projects.reduce((a, p) => a + p.criticalCases, 0);
  const upcoming = projects
    .filter((p) => p.stages[p.currentStageIndex].status !== 'Completed')
    .map((p) => ({
      projectId: p.id,
      projectName: p.name,
      stage: p.currentStage,
      milestone: p.currentMilestone,
      deadline: p.milestoneDeadline,
      daysRemaining: p.stages[p.currentStageIndex].daysRemaining,
      riskScore: p.currentStageRisk ?? p.riskScore,
      band: p.currentStageBand ?? p.riskBand,
      state: p.state,
    }));

  const contributors = Array.from(agg.contributorAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([group, value]) => ({ group, value: Number(value.toFixed(2)) }));
  const contribTotal = contributors.reduce((s, c) => s + c.value, 0) || 1;

  const summary = {
    today: TODAY,
    dataMode: 'Synthetic prototype corpus',
    totals: {
      projects: projects.length,
      cases: ROWS,
      openCases: agg.openCount,
      observedCases: ROWS - agg.openCount,
      parcelAreaHa: Math.round(datasetMeta.aggregates.totalAreaHa),
      landRequirementHa: Math.round(projects.reduce((s, p) => s + p.landRequirementHa, 0)),
      affectedFamilies: datasetMeta.aggregates.totalAffectedFamilies,
      completedProjects: projects.filter((p) => p.currentStageIndex === 8).length,
      activeProjects: projects.filter((p) => p.currentStageIndex < 8).length,
      highRiskCases: totalHigh,
      criticalCases: totalCritical,
      states: states.length,
      districts: districts.length,
      legalDisputeCases: datasetMeta.aggregates.legalDisputeParcels,
      delayedMilestones: upcoming.filter((u) => u.daysRemaining < 0).length,
      upcomingMilestones: upcoming.filter((u) => u.daysRemaining >= 0 && u.daysRemaining <= 90).length,
      budgetCr: Math.round(projects.reduce((s, p) => s + p.budgetCr, 0)),
    },
    riskDistribution: {
      Low: projects.reduce((a, p) => a + p.riskMix.Low, 0),
      Medium: projects.reduce((a, p) => a + p.riskMix.Medium, 0),
      High: projects.reduce((a, p) => a + p.riskMix.High, 0),
      Critical: projects.reduce((a, p) => a + p.riskMix.Critical, 0),
    },
    projectRiskDistribution: BAND_NAMES.reduce((acc, b) => {
      acc[b] = projects.filter((p) => p.riskBand === b).length;
      return acc;
    }, {}),
    contributors: contributors.map((c) => ({ ...c, share: Number((c.value / contribTotal).toFixed(4)) })),
    stages,
    states,
    scoreHistogram: agg.scoreHist,
    qualityHistogram: agg.qualityHist,
    months: Array.from(agg.monthAgg.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        month: m.month,
        cases: m.cases,
        observed: m.observed,
        observedDelayRate: m.observed ? Number((m.delayed / m.observed).toFixed(4)) : null,
        meanPredicted: Number((m.scoreSum / m.cases).toFixed(4)),
        avgDelayDays: m.delayN ? Number((m.delaySum / m.delayN).toFixed(1)) : null,
      })),
    model: {
      deployed: metrics.deployed,
      operatingThreshold: metrics.operatingThreshold,
      riskBands: BANDS,
      test: metrics.models[metrics.deployed].test,
      validation: metrics.models[metrics.deployed].validation,
      baseline: metrics.models.logistic_regression.test,
      comparison: metrics.models.random_forest?.test ?? null,
      split: metrics.split,
      shap: metrics.shap,
      surrogateFidelity: metrics.surrogateFidelity,
      leakageControls: metrics.leakageControls,
      features: metrics.features,
    },
    dataQuality: {
      meanScore: Math.round(
        agg.qualityHist.reduce((s, n, i) => s + n * (i * 10 + 5), 0) / Math.max(1, ROWS),
      ),
      missingByField: agg.missingCount,
      missingRates: Object.fromEntries(
        Object.entries(agg.missingCount).map(([k, v]) => [k, Number((v / ROWS).toFixed(5))]),
      ),
      totalMissingCells: Object.values(agg.missingCount).reduce((a, b) => a + b, 0),
      auditedFields: MISSING_FIELDS.length,
      columns: datasetMeta.columns,
    },
  };

  fs.writeFileSync(path.join(API, 'summary.json'), JSON.stringify(summary));
  fs.writeFileSync(
    path.join(API, 'geo.json'),
    JSON.stringify({ districts, states, today: TODAY }),
  );
  fs.writeFileSync(
    path.join(API, 'model.json'),
    JSON.stringify({
      metrics,
      importance: {
        permutation: importance.permutation.slice(0, 30),
        shap: importance.shap.slice(0, 30),
        shapByGroup: (() => {
          const m = new Map();
          for (const r of importance.shap ?? []) m.set(r.group, (m.get(r.group) ?? 0) + r.meanAbsShap);
          return Array.from(m.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([group, value]) => ({ group, value: Number(value.toFixed(5)) }));
        })(),
      },
      dataset: {
        name: datasetMeta.datasetName,
        records: datasetMeta.records,
        columns: datasetMeta.columns,
        generatedAt: datasetMeta.generatedAt,
        labels: datasetMeta.labels,
        distributions: datasetMeta.distributions,
        aggregates: datasetMeta.aggregates,
        missingRates: datasetMeta.missingRates,
        delayThresholdDays: datasetMeta.delayThresholdDays,
      },
      featureSpec: featureSpec.map((f) => ({ name: f.name, group: f.group, label: f.label, op: f.op, source: f.source })),
    }),
  );

  console.log(
    `[build] api payloads written · ${projects.length} projects · ${agg.openCount.toLocaleString('en-IN')} open cases · ` +
      `${totalHigh.toLocaleString('en-IN')} high-risk`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
