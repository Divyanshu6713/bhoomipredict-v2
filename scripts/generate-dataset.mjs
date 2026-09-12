/**
 * Synthetic land-acquisition corpus generator.
 *
 * Produces ~350,000 case-level acquisition records (one row per land parcel /
 * acquisition case) plus the project registry those cases roll up into.
 *
 *   node scripts/generate-dataset.mjs [--records 350000] [--projects 312]
 *
 * Everything is derived from a fixed seed, so the corpus is byte-identical on
 * every run. No row corresponds to a real acquisition proceeding, department
 * record or landowner — see the prototype data notice in README.md.
 *
 * Record framing
 * --------------
 * Each row is a *snapshot of one acquisition case at a point inside its current
 * statutory stage*, together with the outcome of that stage's next milestone.
 *
 *   milestone_due_date = stage_start_date + expected_stage_days
 *   next_milestone_delayed = 1 when the milestone slips by more than 30 days
 *   label_observed = 1 when milestone_due_date + 31 days is already in the past
 *
 * Rows with label_observed = 0 are the live portfolio: their outcome is not yet
 * knowable, so the target columns are blank and the model has to predict them.
 * This is what keeps the training set free of look-ahead leakage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mulberry32,
  gaussFactory,
  pick,
  int,
  float,
  chance,
  weighted,
  shuffle,
  expo,
  clamp,
  sigmoid,
  dayFromISO,
  isoFromDay,
} from './lib/rand.mjs';
import {
  STATES,
  DISTRICTS,
  TEHSIL_SUFFIX,
  VILLAGE_PREFIX,
  VILLAGE_SUFFIX,
  PROJECT_TYPES,
  AUTHORITIES,
  ANCHOR_PROJECTS,
  GENERIC_TEMPLATES,
  LIFECYCLE_STAGES,
  STAGE_PROFILE,
  STAGE_MILESTONE,
  LAND_TYPES,
  OWNERSHIP_LEVELS,
  COMPENSATION_STATUSES,
  COMPENSATION_BANDS,
  DISPUTE_COMPLEXITY,
  RESPONSIVENESS,
  VERIFICATION_STATUSES,
  APPROVAL_STATUSES,
  POSSESSION_STATUSES,
  RR_STATUSES,
  PRIORITIES,
  RISK_BANDS,
} from './lib/geo-reference.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

/* --------------------------------------------------------------- settings */

const args = process.argv.slice(2);
const argNum = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};

export const TODAY = '2026-09-11';
const TODAY_DAY = dayFromISO(TODAY);

const TOTAL_RECORDS = argNum('--records', 350000);
const PROJECT_COUNT = argNum('--projects', 312);

/**
 * Share of records that are still inside their milestone window — the live
 * portfolio the platform predicts on. The remainder carry an observed outcome
 * and form the supervised history.
 */
const OPEN_SHARE = Number(process.env.BP_OPEN_SHARE ?? 0.3);

/**
 * Weight of the unobserved-heterogeneity term in the latent propensity. It is
 * what stops the corpus from being perfectly separable: the outcome depends on
 * factors no column records, exactly as a real acquisition does.
 */
const HIDDEN_WEIGHT = Number(process.env.BP_HIDDEN ?? 0.5);

/**
 * Overall sharpness of the mapping from signals to outcome. A low gain makes
 * outcomes nearly coin-flips regardless of the record; a very high one makes
 * them deterministic. This is tuned so a well-specified model lands in the
 * 0.84-0.88 ROC-AUC range, which is a plausible ceiling for milestone-level
 * delay prediction rather than an implausibly perfect one.
 */
const SIGNAL_GAIN = Number(process.env.BP_GAIN ?? 2.2);

/** A milestone is "delayed" once it slips past this many days. */
const DELAY_THRESHOLD_DAYS = 30;
/**
 * Cut-offs for delay_risk_category, the ground-truth risk band. They match the
 * bands the deployed model reports (ml/train.py RISK_BAND_THRESHOLDS) so truth
 * and prediction can be compared band for band.
 */
const RISK_BAND_CUTS = { medium: 0.3, high: 0.55, critical: 0.78 };

/** Share of rows whose target is 1, hit by auto-calibrating the intercept. */
const TARGET_POSITIVE_RATE = 0.362;

const STAGE_INDEX = new Map(LIFECYCLE_STAGES.map((s, i) => [s, i]));
const PLANNED_DAYS = LIFECYCLE_STAGES.map((s) => STAGE_PROFILE[s].days);
const TOTAL_PLANNED = PLANNED_DAYS.reduce((a, b) => a + b, 0);

/** Weights for which stage a project currently sits in. */
const PROJECT_STAGE_WEIGHTS = [
  ['Land Identification', 6],
  ['Survey & Verification', 10],
  ['Notification', 9],
  ['Objection / Claims', 11],
  ['Valuation', 10],
  ['Compensation', 16],
  ['Possession', 12],
  ['Rehabilitation & Resettlement', 9],
  ['Closure', 17],
];

/* ------------------------------------------------------- reference tables */

const refRng = mulberry32(26017_2016);

/** District table with schematic centroids and a historical delay profile. */
function buildDistricts() {
  const rows = [];
  for (const state of STATES) {
    const names = DISTRICTS[state.name] ?? [];
    names.forEach((name, i) => {
      // Deterministic ring placement inside the state's spread.
      const angle = (i / Math.max(1, names.length)) * Math.PI * 2 + state.lat;
      const radius = state.spread * (0.35 + 0.6 * ((i % 3) / 2));
      rows.push({
        state: state.name,
        stateCode: state.code,
        zone: state.zone,
        name,
        lat: Number((state.lat + Math.sin(angle) * radius * 0.72).toFixed(4)),
        lon: Number((state.lon + Math.cos(angle) * radius).toFixed(4)),
        spread: Number((state.spread * 0.22).toFixed(3)),
        delayRate: Number((0.13 + refRng() * 0.48).toFixed(3)),
        tehsils: Array.from({ length: int(refRng, 2, 4) }, (_, t) =>
          t === 0 ? `${name} Sadar` : `${name} ${TEHSIL_SUFFIX[(i + t) % TEHSIL_SUFFIX.length]}`,
        ),
      });
    });
  }
  return rows;
}

const DISTRICT_ROWS = buildDistricts();
const DISTRICTS_BY_STATE = new Map();
for (const d of DISTRICT_ROWS) {
  if (!DISTRICTS_BY_STATE.has(d.state)) DISTRICTS_BY_STATE.set(d.state, []);
  DISTRICTS_BY_STATE.get(d.state).push(d);
}

const ALL_AUTHORITIES = Array.from(new Set(Object.values(AUTHORITIES).flat()));
const AUTHORITY_RATE = new Map(
  ALL_AUTHORITIES.map((a) => [a, Number((0.17 + refRng() * 0.36).toFixed(3))]),
);

/* -------------------------------------------------------------- projects */

const STATE_WEIGHTS = STATES.map((s) => [s.name, s.weight]);

function parcelCountDraw(rng) {
  return weighted(rng, [
    [int(rng, 180, 520), 26],
    [int(rng, 520, 1200), 34],
    [int(rng, 1200, 2400), 24],
    [int(rng, 2400, 4600), 12],
    [int(rng, 4600, 8200), 4],
  ]);
}

function buildProjects() {
  const rng = mulberry32(20260911);
  const projects = [];

  for (let i = 0; i < PROJECT_COUNT; i++) {
    const anchor = ANCHOR_PROJECTS[i];
    const state = anchor ? anchor.state : weighted(rng, STATE_WEIGHTS);
    const type = anchor ? anchor.type : pick(rng, PROJECT_TYPES);
    const pool = DISTRICTS_BY_STATE.get(state) ?? DISTRICTS_BY_STATE.get('Rajasthan');
    const districts = shuffle(rng, pool).slice(0, Math.min(pool.length, int(rng, 1, 3)));

    const name =
      anchor?.name ??
      pick(rng, GENERIC_TEMPLATES[type])
        .replace('{d}', districts[0].name)
        .replace('{h}', String(int(rng, 2, 766)))
        .replace('{n}', String(int(rng, 1, 6)))
        .replace('{s}', pick(rng, ['A', 'B', 'C', '']));

    const stageName = weighted(rng, PROJECT_STAGE_WEIGHTS);
    const stageIdx = STAGE_INDEX.get(stageName);
    const parcels = parcelCountDraw(rng);
    const sizeFactor = clamp(0.72 + Math.log10(parcels / 180) * 0.55, 0.72, 1.85);
    const plannedDays = PLANNED_DAYS.map((d) => Math.round(d * sizeFactor));
    const plannedTotal = plannedDays.reduce((a, b) => a + b, 0);

    // Realised slip per completed stage; drives the project's actual timeline.
    const authority = anchor ? AUTHORITIES[type][0] : pick(rng, AUTHORITIES[type]);
    const authRate = AUTHORITY_RATE.get(authority);
    const districtRate =
      districts.reduce((s, d) => s + d.delayRate, 0) / districts.length;
    const frictionBase = (authRate + districtRate) / 2;

    const slipDays = LIFECYCLE_STAGES.map((s, si) => {
      if (si > stageIdx) return 0;
      const profile = STAGE_PROFILE[s];
      const slipped = rng() < profile.slip * (0.65 + frictionBase);
      if (!slipped) return int(rng, -9, 6);
      return Math.round(plannedDays[si] * float(rng, 0.12, 0.85));
    });

    // Days already consumed by stages before the current one, slip included.
    let consumed = 0;
    for (let si = 0; si < stageIdx; si++) consumed += plannedDays[si] + slipDays[si];
    // How deep the project already is into its frontier stage. Allowing this to
    // overshoot the planned duration is what produces genuinely overdue current
    // milestones, which is the operational signal the platform triages on.
    const intoCurrent = Math.max(6, Math.round(plannedDays[stageIdx] * float(rng, 0.12, 1.55)));
    const startDay = TODAY_DAY - consumed - intoCurrent;

    const stageActualStart = [];
    let cursor = startDay;
    for (let si = 0; si < LIFECYCLE_STAGES.length; si++) {
      stageActualStart.push(cursor);
      cursor += plannedDays[si] + slipDays[si];
    }

    const plannedStart = [];
    let pcursor = startDay;
    for (let si = 0; si < LIFECYCLE_STAGES.length; si++) {
      plannedStart.push(pcursor);
      pcursor += plannedDays[si];
    }

    projects.push({
      index: i,
      id: `LAP-${1000 + i}`,
      name,
      state,
      stateCode: (STATES.find((s) => s.name === state) ?? STATES[0]).code,
      zone: (STATES.find((s) => s.name === state) ?? STATES[0]).zone,
      districts,
      type,
      authority,
      authorityRate: authRate,
      districtRate: Number(districtRate.toFixed(3)),
      priority: weighted(rng, [
        ['Routine', 42],
        ['Important', 40],
        ['Critical', 18],
      ]),
      parcels,
      sizeFactor,
      plannedDays,
      plannedTotal,
      slipDays,
      stageActualStart,
      plannedStart,
      stageIdx,
      stageName,
      startDay,
      startDate: isoFromDay(startDay),
      targetCompletionDate: isoFromDay(startDay + plannedTotal),
      landRequirementHa: 0, // filled from the case rows
      stakeholderResponsiveness: weighted(rng, [
        ['High', 34 - Math.round(frictionBase * 30)],
        ['Moderate', 44],
        ['Low', 14 + Math.round(frictionBase * 34)],
      ]),
      budgetCr: Math.round(parcels * float(rng, 0.9, 4.4) + float(rng, 120, 900)),
    });
  }

  // Scale parcel counts so the corpus lands on exactly TOTAL_RECORDS rows.
  const raw = projects.reduce((s, p) => s + p.parcels, 0);
  const scale = TOTAL_RECORDS / raw;
  let running = 0;
  projects.forEach((p, i) => {
    if (i === projects.length - 1) {
      p.parcels = Math.max(40, TOTAL_RECORDS - running);
    } else {
      p.parcels = Math.max(40, Math.round(p.parcels * scale));
      running += p.parcels;
    }
    // Planned land requirement is a project-level figure fixed at sanction; the
    // summed parcel areas land near it but never exactly on it.
    p.landRequirementHa = Number((p.parcels * float(rng, 0.88, 1.18)).toFixed(1));
  });

  return projects;
}

/* ------------------------------------------------------ case-level fields */

const LEVEL = {
  ownership: new Map(OWNERSHIP_LEVELS.map((v, i) => [v, i])),
  dispute: new Map(DISPUTE_COMPLEXITY.map((v, i) => [v, i])),
  responsiveness: new Map(RESPONSIVENESS.map((v, i) => [v, i])),
};

const LAND_TYPE_EFFECT = {
  'Irrigated Agricultural': 0.1,
  'Dry Agricultural': 0,
  Barren: -0.18,
  Residential: 0.3,
  Commercial: 0.26,
  'Orchard/Plantation': 0.16,
  'Grazing/Common': 0.08,
};

const PRIORITY_EFFECT = { Routine: 0.16, Important: 0, Critical: -0.22 };

/**
 * One acquisition case. `rng`/`gauss` are the streaming generators so the
 * corpus stays deterministic; `project` supplies the operational context.
 */
function makeCase(rng, gauss, project, seq) {
  const district = project.districts[Math.floor(rng() * project.districts.length)];
  const tehsil = pick(rng, district.tehsils);
  const vSuffix = pick(rng, VILLAGE_SUFFIX);
  const village = `${pick(rng, VILLAGE_PREFIX)}${vSuffix ? ` ${vSuffix}` : ''}`;

  // Two populations share the corpus: cases whose milestone outcome is already
  // knowable (the supervised history) and cases still inside their milestone
  // window (the live portfolio the model has to predict). Which one a record
  // belongs to is drawn first, then the stage and its dates are made
  // consistent with that choice.
  const openShare = project.stageIdx === 8 ? OPEN_SHARE * 0.35 : OPEN_SHARE;
  const wantOpen = rng() < openShare;

  let stageIdx;
  if (wantOpen) {
    // Live cases cluster around the project's frontier stage.
    stageIdx = clamp(Math.round(project.stageIdx + gauss(-0.35, 1.15)), 0, 8);
  } else {
    // Historical cases are spread across the stages the project has already
    // worked through, in proportion to how long each stage takes — which is
    // what a real milestone-event log looks like.
    stageIdx = weighted(
      rng,
      project.plannedDays.slice(0, project.stageIdx + 1).map((d, i) => [i, d]),
    );
  }
  const stage = LIFECYCLE_STAGES[stageIdx];

  const expectedStageDays = Math.max(
    14,
    Math.round(project.plannedDays[stageIdx] * float(rng, 0.8, 1.25)),
  );

  // A milestone outcome becomes knowable once its due date is more than the
  // delay threshold in the past, which is exactly where the two populations
  // divide:  observed <=> start <= TODAY - 31 - expected.
  const latestObservableStart = TODAY_DAY - (DELAY_THRESHOLD_DAYS + 1) - expectedStageDays;
  const firstOpenStart = latestObservableStart + 1;
  let stageStartDay = project.stageActualStart[stageIdx] + int(rng, -45, 30);

  // A young project has no window in which a milestone could already have been
  // assessed, so its cases can only be open ones.
  const canBeHistorical = latestObservableStart >= project.startDay;
  if (wantOpen || !canBeHistorical) {
    // Spread rather than pin to the boundary: a case whose natural stage start
    // is older than the open window is re-dated inside it.
    const lo = Math.max(firstOpenStart, project.startDay);
    const hi = Math.max(lo, TODAY_DAY - 4);
    if (stageStartDay < lo || stageStartDay > hi) stageStartDay = int(rng, lo, hi);
  } else {
    // Keep historical records inside the project's own timeline.
    if (stageStartDay > latestObservableStart) {
      stageStartDay = latestObservableStart - int(rng, 0, Math.round(expectedStageDays * 0.5));
    }
    if (stageStartDay < project.startDay) stageStartDay = project.startDay;
  }
  // No case can enter a stage before its project was sanctioned.
  if (stageStartDay < project.startDay) stageStartDay = project.startDay;

  let elapsed = Math.max(2, Math.round(expectedStageDays * float(rng, 0.15, 1.05)));
  if (stageStartDay + elapsed > TODAY_DAY) elapsed = Math.max(2, TODAY_DAY - stageStartDay);

  const scheduleConsumed = elapsed / expectedStageDays;
  // Work actually completed inside the stage. The gap between time consumed and
  // work done is the strongest early-warning signal in the corpus, and it is
  // only visible by combining several columns.
  const work = clamp(scheduleConsumed * float(rng, 0.45, 1.28) + gauss(0, 0.11), 0.02, 1);
  const slack = scheduleConsumed - work;

  const landType = weighted(rng, [
    ['Irrigated Agricultural', 26],
    ['Dry Agricultural', 30],
    ['Barren', 10],
    ['Residential', 12],
    ['Commercial', 5],
    ['Orchard/Plantation', 9],
    ['Grazing/Common', 8],
  ]);

  const areaHa = Number(
    clamp(Math.exp(gauss(-0.35, 0.95)) * (landType === 'Commercial' || landType === 'Residential' ? 0.45 : 1), 0.04, 14.5).toFixed(3),
  );

  const ownership = weighted(rng, [
    ['Single', 30],
    ['Joint', 37],
    ['Fragmented', 22],
    ['Disputed', 11],
  ]);
  const ownershipLevel = LEVEL.ownership.get(ownership);
  const owners =
    ownership === 'Single' ? 1 : ownership === 'Joint' ? int(rng, 2, 5) : int(rng, 4, 28);

  const families =
    landType === 'Barren' || landType === 'Grazing/Common'
      ? (chance(rng, 0.82) ? 0 : int(rng, 1, 2))
      : landType === 'Residential'
        ? int(rng, 1, 14)
        : landType === 'Commercial'
          ? int(rng, 0, 6)
          : chance(rng, 0.45)
            ? 0
            : int(rng, 1, 9);

  /* ------------------------------------------------------- compensation */
  let compensationStatus;
  if (stageIdx < 3) compensationStatus = 'Not Initiated';
  else if (stageIdx === 3) compensationStatus = chance(rng, 0.55) ? 'Not Initiated' : 'Assessed';
  else if (stageIdx === 4) compensationStatus = work > 0.6 ? 'Awarded' : 'Assessed';
  else if (stageIdx === 5)
    compensationStatus = work > 0.85 ? 'Paid' : work > 0.5 ? 'Partially Paid' : 'Awarded';
  else compensationStatus = work > 0.4 || stageIdx >= 7 ? 'Paid' : 'Partially Paid';

  const compCompletion =
    compensationStatus === 'Not Initiated'
      ? 0
      : compensationStatus === 'Assessed'
        ? Math.round(float(rng, 0, 12))
        : compensationStatus === 'Awarded'
          ? Math.round(float(rng, 6, 34))
          : compensationStatus === 'Partially Paid'
            ? Math.round(float(rng, 32, 78))
            : Math.round(float(rng, 88, 100));

  const compPendingDays =
    compensationStatus === 'Not Initiated' || compensationStatus === 'Paid'
      ? 0
      : Math.round(clamp(expo(rng, 55 + 130 * (1 - work)), 4, 520));

  const valueLakh = areaHa * (landType === 'Commercial' ? 180 : landType === 'Residential' ? 120 : 22) * float(rng, 0.6, 1.7);
  const compBand =
    valueLakh < 5 ? COMPENSATION_BANDS[0]
      : valueLakh < 15 ? COMPENSATION_BANDS[1]
        : valueLakh < 40 ? COMPENSATION_BANDS[2]
          : valueLakh < 100 ? COMPENSATION_BANDS[3]
            : COMPENSATION_BANDS[4];

  /* -------------------------------------------------------------- legal */
  const legalPressure =
    0.1 +
    0.1 * (ownership === 'Disputed' ? 1 : ownership === 'Fragmented' ? 0.45 : 0) +
    (stageIdx === 3 || stageIdx === 5 ? 0.09 : 0) +
    project.districtRate * 0.12 +
    (landType === 'Commercial' || landType === 'Residential' ? 0.04 : 0);
  const legalDispute = chance(rng, clamp(legalPressure, 0.03, 0.48)) ? 1 : 0;
  const legalCases = legalDispute
    ? weighted(rng, [
        [1, 44],
        [2, 24],
        [int(rng, 3, 5), 20],
        [int(rng, 6, 12), 12],
      ])
    : 0;
  const disputeComplexity = !legalDispute
    ? 'None'
    : legalCases >= 6
      ? 'High'
      : legalCases >= 3
        ? 'Moderate'
        : 'Low';

  /* ----------------------------------------------------------------- R&R */
  const rrRequired = families >= 2 && chance(rng, landType === 'Residential' ? 0.86 : 0.42) ? 1 : 0;
  const rrProgress = rrRequired
    ? Math.round(clamp((stageIdx >= 7 ? 55 : stageIdx >= 6 ? 28 : 8) + work * 40 + gauss(0, 9), 0, 100))
    : 0;
  const rehabCases = rrRequired ? Math.max(1, Math.round(families * float(rng, 0.4, 1.05))) : 0;

  /* ----------------------------------------------- administrative signals */
  const respWeights = [
    ['High', 30 + (project.stakeholderResponsiveness === 'High' ? 34 : 0)],
    ['Moderate', 44],
    ['Low', 20 + (project.stakeholderResponsiveness === 'Low' ? 30 : 0) + Math.round(project.districtRate * 24)],
  ];
  const responsiveness = weighted(rng, respWeights);
  const respLevel = LEVEL.responsiveness.get(responsiveness);

  const deptResponseDays = Math.round(
    clamp(10 + (2 - respLevel) * 14 + project.districtRate * 32 + gauss(0, 9), 3, 120),
  );
  const docCompleteness = Math.round(clamp(34 + 62 * work + gauss(0, 9), 10, 100));
  const verificationStatus =
    docCompleteness > 82 && work > 0.7 ? 'Verified' : work > 0.32 ? 'In Progress' : 'Pending';
  const approvalStatus =
    stageIdx >= 6 ? 'Approved'
      : work > 0.82 ? 'Approved'
        : work > 0.5 ? 'Under Review'
          : work > 0.25 ? 'Submitted'
            : 'Not Submitted';
  const inactivityDays = Math.round(
    clamp(expo(rng, 6 + 62 * (1 - work) + 26 * project.districtRate + (2 - respLevel) * 7), 0, 400),
  );

  const possessionStatus =
    stageIdx >= 8 ? 'Complete'
      : stageIdx === 7 ? (chance(rng, 0.8) ? 'Complete' : 'Partial')
        : stageIdx === 6 ? (work > 0.7 ? 'Partial' : 'Notice Issued')
          : stageIdx === 5 ? (chance(rng, 0.25) ? 'Notice Issued' : 'Not Initiated')
            : 'Not Initiated';
  const rrStatus = !rrRequired
    ? 'Not Applicable'
    : rrProgress >= 97
      ? 'Complete'
      : rrProgress > 5
        ? 'In Progress'
        : 'Not Started';

  /* --------------------------------------------------- historical signals */
  const historicalStageRate = Number(
    clamp(STAGE_PROFILE[stage].slip + gauss(0, 0.055), 0.02, 0.88).toFixed(3),
  );

  /* ------------------------------------------------------------ geography */
  const lat = Number((district.lat + gauss(0, district.spread)).toFixed(5));
  const lon = Number((district.lon + gauss(0, district.spread)).toFixed(5));

  /* ------------------------------------------------------------- timeline */
  const milestoneDueDay = stageStartDay + expectedStageDays;
  const assessmentDay = stageStartDay + elapsed;

  return {
    seq,
    district: district.name,
    tehsil,
    village,
    lat,
    lon,
    stage,
    stageIdx,
    stageStartDay,
    expectedStageDays,
    elapsed,
    milestoneDueDay,
    assessmentDay,
    landType,
    areaHa,
    ownership,
    ownershipLevel,
    owners,
    families,
    compensationStatus,
    compCompletion,
    compPendingDays,
    compBand,
    legalDispute,
    legalCases,
    disputeComplexity,
    rrRequired,
    rrProgress,
    rehabCases,
    responsiveness,
    respLevel,
    deptResponseDays,
    docCompleteness,
    verificationStatus,
    approvalStatus,
    inactivityDays,
    possessionStatus,
    rrStatus,
    historicalStageRate,
    work,
    slack,
    surveyNo: `${int(rng, 12, 899)}/${int(rng, 1, 24)}${chance(rng, 0.3) ? pick(rng, ['A', 'B', 'C']) : ''}`,
  };
}

/**
 * Latent delay propensity.
 *
 * Deliberately built from *combinations* of signals with an unobserved
 * heterogeneity term, so no single column determines the outcome and a model
 * has to learn interactions rather than a rule such as
 * "legal_dispute = 1 implies delayed".
 */
function latentLogit(c, project, hidden) {
  const compPendingFrac = c.stageIdx >= 4 ? (100 - c.compCompletion) / 100 : 0.22;
  const rrPendingFrac = c.rrRequired ? (100 - c.rrProgress) / 100 : 0;

  return SIGNAL_GAIN * (
    2.1 * clamp(c.slack, -0.5, 1.2) +
    0.95 * compPendingFrac +
    0.8 * Math.min(1, c.legalCases / 5) +
    0.45 * (LEVEL.dispute.get(c.disputeComplexity) / 3) +
    0.55 * (c.ownershipLevel / 3) +
    0.85 * Math.min(1, c.inactivityDays / 150) +
    0.7 * (1 - c.docCompleteness / 100) +
    0.4 * ((2 - c.respLevel) / 2) +
    0.55 * (c.deptResponseDays / 120) +
    1.1 * (c.historicalStageRate - 0.28) +
    1.2 * (project.districtRate - 0.33) +
    0.95 * (project.authorityRate - 0.33) +
    0.3 * (Math.log1p(c.families) / 2.7) +
    0.35 * rrPendingFrac +
    // interactions
    0.5 * compPendingFrac * Math.min(1, c.legalCases / 5) +
    0.4 * (c.ownershipLevel / 3) * (1 - c.docCompleteness / 100) +
    0.35 * (c.stage === 'Compensation' ? compPendingFrac : 0) +
    0.28 * (c.stage === 'Objection / Claims' ? Math.min(1, c.legalCases / 4) : 0) +
    PRIORITY_EFFECT[project.priority] +
    LAND_TYPE_EFFECT[c.landType] +
    // unobserved heterogeneity: keeps the ceiling below perfect separation
    HIDDEN_WEIGHT * hidden
  );
}

/** Bisect the intercept so the corpus lands on the intended positive rate. */
function calibrateIntercept(projects) {
  const rng = mulberry32(555_1234);
  const gauss = gaussFactory(rng);
  const sample = [];
  for (let i = 0; i < 40000; i++) {
    const project = projects[Math.floor(rng() * projects.length)];
    const c = makeCase(rng, gauss, project, i);
    sample.push(latentLogit(c, project, gauss(0, 1)));
  }
  let lo = -6;
  let hi = 4;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    let mean = 0;
    for (const z of sample) mean += sigmoid(z + mid);
    mean /= sample.length;
    if (mean > TARGET_POSITIVE_RATE) hi = mid;
    else lo = mid;
  }
  return Number(((lo + hi) / 2).toFixed(5));
}

/* ------------------------------------------------------------ CSV writing */

export const CSV_COLUMNS = [
  'case_id',
  'project_id',
  'parcel_id',
  'state',
  'district',
  'tehsil',
  'village',
  'latitude',
  'longitude',
  'project_name',
  'project_type',
  'authority',
  'project_priority',
  'project_land_requirement_ha',
  'project_start_date',
  'target_completion_date',
  'survey_number',
  'land_area_ha',
  'land_type',
  'current_stage',
  'stage_start_date',
  'expected_stage_days',
  'elapsed_stage_days',
  'milestone_due_date',
  'assessment_date',
  'affected_families',
  'ownership_complexity',
  'number_of_owners',
  'compensation_status',
  'compensation_amount_band',
  'compensation_pending_days',
  'compensation_completion_percentage',
  'legal_dispute',
  'legal_case_count',
  'dispute_complexity',
  'rr_required',
  'rr_progress_percentage',
  'rehabilitation_cases',
  'stakeholder_responsiveness',
  'department_response_days',
  'document_completeness',
  'verification_status',
  'approval_status',
  'inactivity_days',
  'possession_status',
  'rr_status',
  'historical_stage_delay_rate',
  'district_historical_delay_rate',
  'authority_historical_delay_rate',
  'label_observed',
  'next_milestone_delayed',
  'delay_risk_category',
  'actual_stage_delay_days',
];

/** Columns where values are deliberately left blank, mimicking field gaps. */
const MISSING_RATES = {
  affected_families: 0.021,
  compensation_amount_band: 0.034,
  document_completeness: 0.028,
  stakeholder_responsiveness: 0.017,
  department_response_days: 0.042,
  number_of_owners: 0.012,
  rr_progress_percentage: 0.019,
};

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
};

/* ------------------------------------------------------------------- main */

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'model'), { recursive: true });

  const projects = buildProjects();
  const intercept = calibrateIntercept(projects);
  console.log(`[generate] ${projects.length} projects · intercept ${intercept}`);

  const csvPath = path.join(DATA_DIR, 'land_acquisition_synthetic_350k.csv');
  const out = fs.createWriteStream(csvPath, { encoding: 'utf8', highWaterMark: 1 << 22 });

  const write = (chunk) =>
    out.write(chunk) ? Promise.resolve() : new Promise((r) => out.once('drain', r));

  await write(`${CSV_COLUMNS.join(',')}\n`);

  const rng = mulberry32(77120926);
  const gauss = gaussFactory(rng);

  /* accumulators ---------------------------------------------------------- */
  const stats = {
    records: 0,
    observed: 0,
    positives: 0,
    riskBand: Object.fromEntries(RISK_BANDS.map((b) => [b, 0])),
    stage: Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, 0])),
    state: {},
    landType: Object.fromEntries(LAND_TYPES.map((s) => [s, 0])),
    ownership: Object.fromEntries(OWNERSHIP_LEVELS.map((s) => [s, 0])),
    compensation: Object.fromEntries(COMPENSATION_STATUSES.map((s) => [s, 0])),
    legalDispute: 0,
    rrRequired: 0,
    missing: Object.fromEntries(Object.keys(MISSING_RATES).map((k) => [k, 0])),
    delayDaysSum: 0,
    delayDaysCount: 0,
    areaSum: 0,
    familiesSum: 0,
    assessmentMonth: {},
  };

  const districtAgg = new Map();
  let buffer = [];
  let caseSeq = 0;

  for (const project of projects) {
    const agg = {
      parcels: 0,
      areaHa: 0,
      families: 0,
      legalCases: 0,
      legalDisputes: 0,
      compensationPaid: 0,
      compCompletionSum: 0,
      possessionComplete: 0,
      rrRequired: 0,
      rrProgressSum: 0,
      rrCases: 0,
      openCases: 0,
      observedCases: 0,
      observedPositives: 0,
      inactivitySum: 0,
      docSum: 0,
      stageCounts: Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, 0])),
      stageOpen: Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, 0])),
      districtCounts: {},
      latSum: 0,
      lonSum: 0,
      ownershipCounts: Object.fromEntries(OWNERSHIP_LEVELS.map((s) => [s, 0])),
      riskBandTruth: Object.fromEntries(RISK_BANDS.map((b) => [b, 0])),
      firstRow: caseSeq,
    };

    for (let k = 0; k < project.parcels; k++) {
      const c = makeCase(rng, gauss, project, caseSeq);
      const hidden = gauss(0, 1);
      const z = latentLogit(c, project, hidden) + intercept;
      const p = sigmoid(z);
      const delayed = rng() < p ? 1 : 0;

      const delayDays = delayed
        ? DELAY_THRESHOLD_DAYS + 1 + Math.round(expo(rng, 22 + 90 * p))
        : Math.round(clamp(gauss(-3, 9), -28, DELAY_THRESHOLD_DAYS - 2));

      const observed = c.milestoneDueDay + DELAY_THRESHOLD_DAYS + 1 <= TODAY_DAY ? 1 : 0;
      const resolved = observed && c.milestoneDueDay + Math.max(0, delayDays) <= TODAY_DAY;
      const band = p >= RISK_BAND_CUTS.critical ? 'Critical' : p >= RISK_BAND_CUTS.high ? 'High' : p >= RISK_BAND_CUTS.medium ? 'Medium' : 'Low';

      const caseId = `LAC-${String(500000 + caseSeq)}`;
      const parcelId = `${project.stateCode}-${c.district.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')}-${String(10000 + (caseSeq % 89999))}`;

      // Deliberate field gaps.
      const miss = (key) => rng() < MISSING_RATES[key];
      const mFamilies = miss('affected_families');
      const mBand = miss('compensation_amount_band');
      const mDoc = miss('document_completeness');
      const mResp = miss('stakeholder_responsiveness');
      const mDept = miss('department_response_days');
      const mOwners = miss('number_of_owners');
      const mRR = c.rrRequired ? miss('rr_progress_percentage') : false;
      if (mFamilies) stats.missing.affected_families++;
      if (mBand) stats.missing.compensation_amount_band++;
      if (mDoc) stats.missing.document_completeness++;
      if (mResp) stats.missing.stakeholder_responsiveness++;
      if (mDept) stats.missing.department_response_days++;
      if (mOwners) stats.missing.number_of_owners++;
      if (mRR) stats.missing.rr_progress_percentage++;

      buffer.push(
        [
          caseId,
          project.id,
          parcelId,
          csvCell(project.state),
          csvCell(c.district),
          csvCell(c.tehsil),
          csvCell(c.village),
          c.lat,
          c.lon,
          csvCell(project.name),
          csvCell(project.type),
          csvCell(project.authority),
          project.priority,
          project.landRequirementHa,
          project.startDate,
          project.targetCompletionDate,
          c.surveyNo,
          c.areaHa,
          csvCell(c.landType),
          csvCell(c.stage),
          isoFromDay(c.stageStartDay),
          c.expectedStageDays,
          c.elapsed,
          isoFromDay(c.milestoneDueDay),
          isoFromDay(c.assessmentDay),
          mFamilies ? '' : c.families,
          c.ownership,
          mOwners ? '' : c.owners,
          csvCell(c.compensationStatus),
          mBand ? '' : c.compBand,
          c.compPendingDays,
          c.compCompletion,
          c.legalDispute,
          c.legalCases,
          c.disputeComplexity,
          c.rrRequired,
          c.rrRequired ? (mRR ? '' : c.rrProgress) : '',
          c.rehabCases,
          mResp ? '' : c.responsiveness,
          mDept ? '' : c.deptResponseDays,
          mDoc ? '' : c.docCompleteness,
          c.verificationStatus,
          csvCell(c.approvalStatus),
          c.inactivityDays,
          csvCell(c.possessionStatus),
          csvCell(c.rrStatus),
          c.historicalStageRate,
          project.districtRate,
          project.authorityRate,
          observed,
          observed ? delayed : '',
          observed ? band : '',
          resolved ? delayDays : '',
        ].join(','),
      );

      /* -------------------------------------------------------- roll-ups */
      agg.parcels++;
      agg.areaHa += c.areaHa;
      agg.families += c.families;
      agg.legalCases += c.legalCases;
      agg.legalDisputes += c.legalDispute;
      agg.compCompletionSum += c.compCompletion;
      if (c.compensationStatus === 'Paid') agg.compensationPaid++;
      if (c.possessionStatus === 'Complete') agg.possessionComplete++;
      agg.rrRequired += c.rrRequired;
      agg.rrProgressSum += c.rrRequired ? c.rrProgress : 0;
      agg.rrCases += c.rehabCases;
      agg.inactivitySum += c.inactivityDays;
      agg.docSum += c.docCompleteness;
      agg.stageCounts[c.stage]++;
      agg.ownershipCounts[c.ownership]++;
      agg.districtCounts[c.district] = (agg.districtCounts[c.district] ?? 0) + 1;
      agg.latSum += c.lat;
      agg.lonSum += c.lon;
      agg.riskBandTruth[band]++;
      if (observed) {
        agg.observedCases++;
        agg.observedPositives += delayed;
      } else {
        agg.openCases++;
        agg.stageOpen[c.stage]++;
      }

      stats.records++;
      stats.observed += observed;
      stats.positives += observed ? delayed : 0;
      stats.riskBand[band]++;
      stats.stage[c.stage]++;
      stats.state[project.state] = (stats.state[project.state] ?? 0) + 1;
      stats.landType[c.landType]++;
      stats.ownership[c.ownership]++;
      stats.compensation[c.compensationStatus]++;
      stats.legalDispute += c.legalDispute;
      stats.rrRequired += c.rrRequired;
      stats.areaSum += c.areaHa;
      stats.familiesSum += c.families;
      if (resolved) {
        stats.delayDaysSum += delayDays;
        stats.delayDaysCount++;
      }
      const ym = isoFromDay(c.assessmentDay).slice(0, 7);
      stats.assessmentMonth[ym] = (stats.assessmentMonth[ym] ?? 0) + 1;

      const dkey = `${project.state}|${c.district}`;
      let d = districtAgg.get(dkey);
      if (!d) {
        d = { state: project.state, district: c.district, cases: 0, open: 0, areaHa: 0, legal: 0, lat: 0, lon: 0 };
        districtAgg.set(dkey, d);
      }
      d.cases++;
      if (!observed) d.open++;
      d.areaHa += c.areaHa;
      d.legal += c.legalDispute;
      d.lat += c.lat;
      d.lon += c.lon;

      caseSeq++;

      if (buffer.length >= 4000) {
        await write(`${buffer.join('\n')}\n`);
        buffer = [];
      }
    }

    project.agg = agg;
    project.actualAreaHa = Number(agg.areaHa.toFixed(1));
    if (project.index % 40 === 0) {
      console.log(`[generate] ${stats.records.toLocaleString('en-IN')} rows…`);
    }
  }

  if (buffer.length) await write(`${buffer.join('\n')}\n`);
  await new Promise((r) => out.end(r));

  /* --------------------------------------------------- project registry */
  const registry = projects.map((p) => {
    const a = p.agg;
    const stages = LIFECYCLE_STAGES.map((name, i) => {
      // Baseline (sanctioned) schedule versus the working schedule, which
      // carries forward the slip already realised in earlier stages.
      const baselineEndDay = p.plannedStart[i] + p.plannedDays[i];
      const actualStartDay = p.stageActualStart[i];
      const expectedEndDay = actualStartDay + p.plannedDays[i];
      const actualEndDay = expectedEndDay + p.slipDays[i];
      // The frontier stage is reported as delayed once its working deadline is
      // behind us, not from the simulated slip draw.
      const status =
        i < p.stageIdx
          ? 'Completed'
          : i === p.stageIdx
            ? expectedEndDay < TODAY_DAY
              ? 'Delayed'
              : 'In Progress'
            : 'Pending';
      return {
        name,
        index: i,
        status,
        plannedStart: isoFromDay(p.plannedStart[i]),
        baselineCompletion: isoFromDay(baselineEndDay),
        expectedCompletion: isoFromDay(expectedEndDay),
        actualStart: i <= p.stageIdx ? isoFromDay(actualStartDay) : null,
        actualCompletion: i < p.stageIdx ? isoFromDay(actualEndDay) : null,
        slipDays: i < p.stageIdx ? p.slipDays[i] : i === p.stageIdx ? Math.max(0, TODAY_DAY - expectedEndDay) : 0,
        plannedDays: p.plannedDays[i],
        daysElapsed: i === p.stageIdx ? TODAY_DAY - actualStartDay : i < p.stageIdx ? actualEndDay - actualStartDay : 0,
        daysRemaining: i === p.stageIdx ? expectedEndDay - TODAY_DAY : i > p.stageIdx ? p.plannedDays[i] : 0,
        openCases: a.stageOpen[name],
        totalCases: a.stageCounts[name],
        milestone: STAGE_MILESTONE[name],
      };
    });

    const current = stages[p.stageIdx];
    const completedStages = p.stageIdx;
    const stageProgress = clamp(current.daysElapsed / Math.max(1, p.plannedDays[p.stageIdx]), 0, 1);
    const progressPct = Number(
      (((completedStages + stageProgress) / LIFECYCLE_STAGES.length) * 100).toFixed(1),
    );
    const compensationPct = Number((a.compCompletionSum / Math.max(1, a.parcels)).toFixed(1));

    return {
      id: p.id,
      name: p.name,
      type: p.type,
      state: p.state,
      stateCode: p.stateCode,
      zone: p.zone,
      districts: p.districts.map((d) => d.name),
      authority: p.authority,
      priority: p.priority,
      startDate: p.startDate,
      targetCompletionDate: p.targetCompletionDate,
      totalParcels: a.parcels,
      openCases: a.openCases,
      observedCases: a.observedCases,
      observedDelayRate: Number((a.observedPositives / Math.max(1, a.observedCases)).toFixed(4)),
      landRequirementHa: p.landRequirementHa,
      parcelAreaHa: Number(a.areaHa.toFixed(1)),
      landAcquiredHa: Number(((a.areaHa * progressPct) / 100).toFixed(1)),
      affectedFamilies: a.families,
      legalCases: a.legalCases,
      legalDisputeParcels: a.legalDisputes,
      compensationCompletionPct: compensationPct,
      compensationStatus:
        compensationPct > 92 ? 'Paid' : compensationPct > 55 ? 'Partially Paid' : compensationPct > 18 ? 'Awarded' : compensationPct > 3 ? 'Assessed' : 'Not Initiated',
      possessionStatus:
        a.possessionComplete / Math.max(1, a.parcels) > 0.9
          ? 'Complete'
          : a.possessionComplete / Math.max(1, a.parcels) > 0.25
            ? 'Partial'
            : p.stageIdx >= 6
              ? 'Notice Issued'
              : 'Not Initiated',
      rrRequiredParcels: a.rrRequired,
      rrCases: a.rrCases,
      rrProgressPct: Number((a.rrProgressSum / Math.max(1, a.rrRequired)).toFixed(1)),
      rrStatus:
        a.rrRequired === 0
          ? 'Not Applicable'
          : a.rrProgressSum / Math.max(1, a.rrRequired) > 95
            ? 'Complete'
            : a.rrProgressSum / Math.max(1, a.rrRequired) > 5
              ? 'In Progress'
              : 'Not Started',
      dominantOwnership: Object.entries(a.ownershipCounts).sort((x, y) => y[1] - x[1])[0][0],
      stakeholderResponsiveness: p.stakeholderResponsiveness,
      avgInactivityDays: Number((a.inactivitySum / Math.max(1, a.parcels)).toFixed(1)),
      avgDocumentCompleteness: Number((a.docSum / Math.max(1, a.parcels)).toFixed(1)),
      districtDelayRate: p.districtRate,
      authorityDelayRate: p.authorityRate,
      budgetCr: p.budgetCr,
      currentStage: current.name,
      currentStageIndex: p.stageIdx,
      currentMilestone: current.milestone,
      milestoneDeadline: current.expectedCompletion,
      progressPct,
      stages,
      lat: Number((a.latSum / Math.max(1, a.parcels)).toFixed(4)),
      lon: Number((a.lonSum / Math.max(1, a.parcels)).toFixed(4)),
      rowRange: [a.firstRow, a.firstRow + a.parcels - 1],
      truthRiskMix: a.riskBandTruth,
    };
  });

  fs.writeFileSync(
    path.join(DATA_DIR, 'projects.raw.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), today: TODAY, projects: registry }, null, 1),
  );

  const districts = Array.from(districtAgg.values()).map((d) => ({
    state: d.state,
    district: d.district,
    cases: d.cases,
    openCases: d.open,
    areaHa: Number(d.areaHa.toFixed(1)),
    legalDisputes: d.legal,
    lat: Number((d.lat / d.cases).toFixed(4)),
    lon: Number((d.lon / d.cases).toFixed(4)),
  }));

  const meta = {
    datasetName: 'land_acquisition_synthetic_350k',
    generatedAt: new Date().toISOString(),
    snapshotDate: TODAY,
    records: stats.records,
    projects: registry.length,
    states: Object.keys(stats.state).length,
    districts: districts.length,
    columns: CSV_COLUMNS.length,
    delayThresholdDays: DELAY_THRESHOLD_DAYS,
    interceptCalibration: intercept,
    labels: {
      observed: stats.observed,
      open: stats.records - stats.observed,
      positives: stats.positives,
      positiveRate: Number((stats.positives / Math.max(1, stats.observed)).toFixed(4)),
    },
    distributions: {
      riskBand: stats.riskBand,
      stage: stats.stage,
      state: stats.state,
      landType: stats.landType,
      ownership: stats.ownership,
      compensation: stats.compensation,
      assessmentMonth: stats.assessmentMonth,
    },
    aggregates: {
      legalDisputeParcels: stats.legalDispute,
      rrRequiredParcels: stats.rrRequired,
      totalAreaHa: Number(stats.areaSum.toFixed(1)),
      totalAffectedFamilies: stats.familiesSum,
      avgObservedStageDelayDays: Number((stats.delayDaysSum / Math.max(1, stats.delayDaysCount)).toFixed(2)),
      resolvedStageOutcomes: stats.delayDaysCount,
    },
    missing: stats.missing,
    missingRates: Object.fromEntries(
      Object.entries(stats.missing).map(([k, v]) => [k, Number((v / stats.records).toFixed(5))]),
    ),
    districtsTable: districts,
  };

  fs.writeFileSync(path.join(DATA_DIR, 'dataset-meta.json'), JSON.stringify(meta, null, 1));

  const bytes = fs.statSync(csvPath).size;
  console.log(
    `[generate] ${stats.records.toLocaleString('en-IN')} rows · ${(bytes / 1048576).toFixed(1)} MB · ` +
      `observed ${stats.observed.toLocaleString('en-IN')} (${((stats.observed / stats.records) * 100).toFixed(1)}%) · ` +
      `positive rate ${(meta.labels.positiveRate * 100).toFixed(2)}% · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  console.log(`[generate] risk band mix: ${JSON.stringify(stats.riskBand)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
