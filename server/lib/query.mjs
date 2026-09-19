/**
 * Query engine over the columnar case store.
 *
 * Filters compile once into a closure over typed arrays, candidate rows come
 * from contiguous project ranges wherever a project-level filter allows it, and
 * results are cached by query signature. A full-corpus scan with a dozen
 * predicates costs single-digit milliseconds.
 */
import { caseRowLite, caseAt, contributorsFor, dayFromISO } from './store.mjs';
import { riskScoreOf } from '../domain/risk.mjs';
import { interventionFor } from './interventions.mjs';

const CACHE_LIMIT = 200;
const cache = new Map();

function cached(key, produce) {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // refresh recency
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = produce();
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return value;
}

export function clearCache() {
  cache.clear();
}

const asArray = (v) => (v === undefined || v === null || v === '' ? null : String(v).split(',').filter(Boolean));

/* -------------------------------------------------------------- predicates */

/**
 * Build the candidate row list. When a project-level filter is present only the
 * matching projects' row ranges are visited.
 */
function candidateProjects(store, f) {
  const states = asArray(f.state);
  const types = asArray(f.projectType);
  const authorities = asArray(f.authority);
  const priorities = asArray(f.priority);
  const ids = asArray(f.projectId);
  const zones = asArray(f.zone);

  if (!states && !types && !authorities && !priorities && !ids && !zones) return null;

  const out = [];
  for (let i = 0; i < store.projects.length; i++) {
    const p = store.projects[i];
    if (ids && !ids.includes(p.id)) continue;
    if (states && !states.includes(p.state)) continue;
    if (types && !types.includes(p.type)) continue;
    if (authorities && !authorities.includes(p.authority)) continue;
    if (priorities && !priorities.includes(p.priority)) continue;
    if (zones && !zones.includes(p.zone)) continue;
    out.push(i);
  }
  return out;
}

function buildPredicate(store, f) {
  const c = store.col;
  const stages = asArray(f.stage);
  const stageIds = stages ? stages.map((s) => store.stageIndex.get(s)).filter((v) => v !== undefined) : null;
  const bands = asArray(f.risk);
  const bandIds = bands ? bands.map((b) => store.bandNames.indexOf(b)).filter((v) => v >= 0) : null;
  const districts = asArray(f.district);
  const districtIds = districts
    ? districts
        .map((d) => (d.includes('|') ? store.districtByKey.get(d) : store.districtTable.findIndex((x) => x.district === d)))
        .filter((v) => v !== undefined && v >= 0)
    : null;
  const ownership = asArray(f.ownership);
  const ownershipIds = ownership ? ownership.map((o) => store.dicts.ownership.indexOf(o)).filter((v) => v >= 0) : null;
  const comp = asArray(f.compensation);
  const compIds = comp ? comp.map((o) => store.dicts.compStatus.indexOf(o)).filter((v) => v >= 0) : null;
  const landTypes = asArray(f.landType);
  const landTypeIds = landTypes ? landTypes.map((o) => store.dicts.landType.indexOf(o)).filter((v) => v >= 0) : null;

  const status = f.status ?? 'open'; // open | observed | all
  const legal = f.legal === undefined || f.legal === '' ? null : String(f.legal) === '1' || f.legal === 'true';
  const rr = f.rr === undefined || f.rr === '' ? null : String(f.rr) === '1' || f.rr === 'true';
  const minScore = f.minRisk !== undefined && f.minRisk !== '' ? Number(f.minRisk) / 100 : null;
  const maxScore = f.maxRisk !== undefined && f.maxRisk !== '' ? Number(f.maxRisk) / 100 : null;
  const dueBefore = f.dueBefore ? dayFromISO(f.dueBefore) : null;
  const dueAfter = f.dueAfter ? dayFromISO(f.dueAfter) : null;
  const overdue = f.overdue === '1' || f.overdue === 'true';
  const minQuality = f.minQuality !== undefined && f.minQuality !== '' ? Number(f.minQuality) : null;
  const village = f.q ? String(f.q).trim().toLowerCase() : null;

  // Resolve a free-text query against the small dictionaries once, not per row.
  let villageIds = null;
  let caseRow = null;
  if (village) {
    const m = /^lac-(\d+)$/i.exec(village);
    if (m) caseRow = Number(m[1]) - 500000;
    villageIds = new Set();
    store.dicts.village.forEach((v, i) => {
      if (v.toLowerCase().includes(village)) villageIds.add(i);
    });
    store.dicts.tehsil.forEach((v, i) => {
      if (v.toLowerCase().includes(village)) villageIds.add(-1 - i);
    });
  }

  return (row) => {
    if (status === 'open' && c.observed[row] !== 0) return false;
    if (status === 'observed' && c.observed[row] !== 1) return false;
    if (stageIds && !stageIds.includes(c.stageIdx[row])) return false;
    if (bandIds && !bandIds.includes(c.riskBand[row])) return false;
    if (districtIds && !districtIds.includes(c.districtIdx[row])) return false;
    if (ownershipIds && !ownershipIds.includes(c.ownershipIdx[row])) return false;
    if (compIds && !compIds.includes(c.compStatusIdx[row])) return false;
    if (landTypeIds && !landTypeIds.includes(c.landTypeIdx[row])) return false;
    if (legal !== null && (c.legalDispute[row] === 1) !== legal) return false;
    if (rr !== null && (c.rrRequired[row] === 1) !== rr) return false;
    if (minScore !== null && c.score[row] < minScore) return false;
    if (maxScore !== null && c.score[row] > maxScore) return false;
    if (dueBefore !== null && c.dueDay[row] > dueBefore) return false;
    if (dueAfter !== null && c.dueDay[row] < dueAfter) return false;
    if (overdue && c.dueDay[row] >= store.todayDay) return false;
    if (minQuality !== null && c.quality[row] < minQuality) return false;
    if (village) {
      if (caseRow !== null) return row === caseRow;
      if (!villageIds.has(c.villageIdx[row]) && !villageIds.has(-1 - c.tehsilIdx[row])) return false;
    }
    return true;
  };
}

const SORTERS = {
  risk: (c) => (a, b) => c.score[b] - c.score[a],
  riskAsc: (c) => (a, b) => c.score[a] - c.score[b],
  deadline: (c) => (a, b) => c.dueDay[a] - c.dueDay[b],
  inactivity: (c) => (a, b) => c.inactivity[b] - c.inactivity[a],
  area: (c) => (a, b) => c.areaHa[b] - c.areaHa[a],
  families: (c) => (a, b) => c.families[b] - c.families[a],
  legal: (c) => (a, b) => c.legalCases[b] - c.legalCases[a],
  quality: (c) => (a, b) => c.quality[a] - c.quality[b],
  elapsed: (c) => (a, b) => c.elapsedDays[b] - c.elapsedDays[a],
  compensation: (c) => (a, b) => c.compCompletion[a] - c.compCompletion[b],
};

/* ------------------------------------------------------------------ queries */

export function queryCases(store, f) {
  const key = `cases:${JSON.stringify(f)}`;
  return cached(key, () => {
    const t0 = process.hrtime.bigint();
    const predicate = buildPredicate(store, f);
    const projects = candidateProjects(store, f);
    const matched = [];

    if (projects) {
      for (const pi of projects) {
        const start = store.ranges[pi * 2];
        const end = store.ranges[pi * 2 + 1];
        for (let row = start; row < end; row++) if (predicate(row)) matched.push(row);
      }
    } else {
      for (let row = 0; row < store.rows; row++) if (predicate(row)) matched.push(row);
    }

    const sorter = SORTERS[f.sort ?? 'risk'] ?? SORTERS.risk;
    matched.sort(sorter(store.col));

    const pageSize = Math.min(200, Math.max(1, Number(f.pageSize ?? 25)));
    const pages = Math.max(1, Math.ceil(matched.length / pageSize));
    const page = Math.min(Math.max(1, Number(f.page ?? 1)), pages);
    const slice = matched.slice((page - 1) * pageSize, page * pageSize);

    // Aggregates over the whole result set, not just the page.
    const c = store.col;
    let scoreSum = 0;
    let areaSum = 0;
    let familiesSum = 0;
    let overdue = 0;
    const band = [0, 0, 0, 0];
    const stageMix = new Array(store.stages.length).fill(0);
    for (const row of matched) {
      scoreSum += c.score[row];
      areaSum += c.areaHa[row];
      if (c.families[row] > 0) familiesSum += c.families[row];
      if (c.dueDay[row] < store.todayDay) overdue++;
      band[c.riskBand[row]]++;
      stageMix[c.stageIdx[row]]++;
    }

    return {
      total: matched.length,
      page,
      pageSize,
      pages,
      rows: slice.map((row) => caseRowLite(store, row)),
      aggregate: {
        avgRiskScore: matched.length ? Math.round((scoreSum / matched.length) * 100) : 0,
        totalAreaHa: Number(areaSum.toFixed(1)),
        affectedFamilies: familiesSum,
        overdueMilestones: overdue,
        riskMix: {
          Low: band[0],
          Medium: band[1],
          High: band[2],
          Critical: band[3],
        },
        stageMix: store.stages.map((s, i) => ({ stage: s, cases: stageMix[i] })),
      },
      queryMs: Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2)),
    };
  });
}

/** Matched rows only, for streaming exports. Not cached: the caller streams it. */
export function queryCaseRows(store, f, limit = 20000) {
  const predicate = buildPredicate(store, f);
  const projects = candidateProjects(store, f);
  const matched = [];
  if (projects) {
    for (const pi of projects) {
      const start = store.ranges[pi * 2];
      const end = store.ranges[pi * 2 + 1];
      for (let row = start; row < end; row++) if (predicate(row)) matched.push(row);
    }
  } else {
    for (let row = 0; row < store.rows; row++) if (predicate(row)) matched.push(row);
  }
  const sorter = SORTERS[f.sort ?? 'risk'] ?? SORTERS.risk;
  matched.sort(sorter(store.col));
  return { total: matched.length, rows: matched.slice(0, limit) };
}

/** Intervention queue: the highest-risk open cases, deduplicated per project. */
export function queryQueue(store, f) {
  const key = `queue:${JSON.stringify(f)}`;
  return cached(key, () => {
    const t0 = process.hrtime.bigint();
    const predicate = buildPredicate(store, { ...f, status: 'open' });
    const projects = candidateProjects(store, f);
    const perProject = Math.max(1, Number(f.perProject ?? 3));
    const c = store.col;
    const shapK = store.shapK;

    const byProject = new Map();
    const visit = (row) => {
      if (!predicate(row)) return;
      const pi = c.projectIdx[row];
      const stage = c.stageIdx[row];
      const k = `${pi}:${f.groupBy === 'project' ? 0 : stage}`;
      let entry = byProject.get(k);
      if (!entry) {
        entry = { projectIdx: pi, stage, rows: [], scoreSum: 0, n: 0, band: [0, 0, 0, 0], overdue: 0, shap: new Map() };
        byProject.set(k, entry);
      }
      entry.n++;
      entry.scoreSum += c.score[row];
      entry.band[c.riskBand[row]]++;
      if (c.dueDay[row] < store.todayDay) entry.overdue++;

      // Contributor mass over every case in the cell, read straight from the
      // typed arrays so no per-row objects are allocated on the scan.
      if (store.shapIdx) {
        for (let i = 0; i < shapK; i++) {
          const v = store.shapVal[row * shapK + i];
          if (v <= 0) continue;
          const g = store.featureSpec[store.shapIdx[row * shapK + i]]?.group ?? 'Other';
          entry.shap.set(g, (entry.shap.get(g) ?? 0) + v);
        }
      }
      // keep the worst few rows for the drill-down
      if (entry.rows.length < perProject) entry.rows.push(row);
      else {
        let worstIdx = -1;
        let worstScore = c.score[row];
        for (let i = 0; i < entry.rows.length; i++) {
          if (c.score[entry.rows[i]] < worstScore) {
            worstScore = c.score[entry.rows[i]];
            worstIdx = i;
          }
        }
        if (worstIdx >= 0) entry.rows[worstIdx] = row;
      }
    };

    if (projects) {
      for (const pi of projects) {
        const start = store.ranges[pi * 2];
        const end = store.ranges[pi * 2 + 1];
        for (let row = start; row < end; row++) visit(row);
      }
    } else {
      for (let row = 0; row < store.rows; row++) visit(row);
    }

    // Cells are shrunk toward the portfolio mean so a single very high case
    // cannot outrank a stage carrying hundreds of at-risk parcels. k is the
    // number of notional average cases added to every cell.
    const PRIOR_STRENGTH = 14;
    const priorMean = store.summary.model?.test?.positiveRate ?? 0.36;

    const items = Array.from(byProject.values()).map((e) => {
      const project = store.projects[e.projectIdx];
      const mean = (e.scoreSum + priorMean * PRIOR_STRENGTH) / (e.n + PRIOR_STRENGTH);
      const rawMean = e.scoreSum / e.n;
      const stageName = store.stages[e.stage];
      const stageRisk = project.stageRisk[e.stage];
      const top = e.rows
        .sort((a, b) => c.score[b] - c.score[a])
        .map((row) => caseRowLite(store, row));
      const ranked = Array.from(e.shap.entries()).sort((a, b) => b[1] - a[1]);
      const mass = ranked.reduce((s, r) => s + r[1], 0) || 1;
      const topGroup = ranked[0]?.[0] ?? project.contributors[0]?.group ?? 'Other';
      return {
        id: `${project.id}:${e.stage}`,
        projectId: project.id,
        projectName: project.name,
        state: project.state,
        districts: project.districts,
        authority: project.authority,
        priority: project.priority,
        stage: stageName,
        stageIndex: e.stage,
        milestone: project.stages[e.stage]?.milestone ?? null,
        milestoneDeadline: project.stages[e.stage]?.expectedCompletion ?? null,
        stageStatus: project.stages[e.stage]?.status ?? null,
        daysRemaining: project.stages[e.stage]?.daysRemaining ?? null,
        openCases: e.n,
        overdueCases: e.overdue,
        riskScore: Math.min(99, Math.round(mean * 100)),
        rawRiskScore: Math.min(99, Math.round(rawMean * 100)),
        riskBand: store.bandNames[mean >= store.riskBands.critical ? 3 : mean >= store.riskBands.high ? 2 : mean >= store.riskBands.medium ? 1 : 0],
        stageBand: stageRisk?.band ?? null,
        riskMix: { Low: e.band[0], Medium: e.band[1], High: e.band[2], Critical: e.band[3] },
        contributors: ranked.slice(0, 4).map(([group, value]) => ({
          group,
          share: Number((value / mass).toFixed(4)),
        })),
        topContributor: topGroup,
        intervention: interventionFor(topGroup),
        sampleCases: top,
        // Urgency blends the shrunk risk with deadline pressure and how many
        // parcels the cell actually covers, so the queue ranks by where a
        // reviewer's time buys the most rather than by the single worst case.
        urgency: Number(
          (
            mean * 0.58 +
            Math.min(1, Math.max(0, (120 - (project.stages[e.stage]?.daysRemaining ?? 120)) / 240)) * 0.2 +
            Math.min(1, Math.log10(1 + e.n) / Math.log10(801)) * 0.22
          ).toFixed(4),
        ),
      };
    });

    const sortKey = f.queueSort ?? 'urgency';
    items.sort((a, b) =>
      sortKey === 'risk' ? b.riskScore - a.riskScore
        : sortKey === 'deadline' ? String(a.milestoneDeadline).localeCompare(String(b.milestoneDeadline))
          : sortKey === 'cases' ? b.openCases - a.openCases
            : b.urgency - a.urgency,
    );

    const pageSize = Math.min(100, Math.max(1, Number(f.pageSize ?? 20)));
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(Math.max(1, Number(f.page ?? 1)), pages);

    return {
      total: items.length,
      page,
      pages,
      pageSize,
      items: items.slice((page - 1) * pageSize, page * pageSize).map((it, i) => ({
        ...it,
        priorityRank: (page - 1) * pageSize + i + 1,
      })),
      aggregate: {
        openCases: items.reduce((s, i) => s + i.openCases, 0),
        criticalCells: items.filter((i) => i.riskBand === 'Critical').length,
        highCells: items.filter((i) => i.riskBand === 'High').length,
        overdueCases: items.reduce((s, i) => s + i.overdueCases, 0),
      },
      queryMs: Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2)),
    };
  });
}

/** Points for the GIS layer: high-risk first, thinned to a drawable count. */
export function queryMapPoints(store, f) {
  const key = `map:${JSON.stringify(f)}`;
  return cached(key, () => {
    const predicate = buildPredicate(store, { ...f, status: f.status ?? 'open' });
    const limit = Math.min(6000, Math.max(200, Number(f.limit ?? 2500)));
    const c = store.col;
    const buckets = [[], [], [], []];
    const projects = candidateProjects(store, f);

    const visit = (row) => {
      if (!predicate(row)) return;
      buckets[c.riskBand[row]].push(row);
    };
    if (projects) {
      for (const pi of projects) {
        const start = store.ranges[pi * 2];
        const end = store.ranges[pi * 2 + 1];
        for (let row = start; row < end; row++) visit(row);
      }
    } else {
      for (let row = 0; row < store.rows; row++) visit(row);
    }

    const total = buckets.reduce((s, b) => s + b.length, 0);
    // Critical and High are kept whole where possible; Low is thinned hardest,
    // so the map never hides the cases a reviewer is looking for.
    const quota = [0.12, 0.2, 0.3, 0.38].map((q) => Math.round(limit * q));
    const chosen = [];
    for (let b = 3; b >= 0; b--) {
      const bucket = buckets[b];
      const want = Math.min(bucket.length, quota[b] + Math.max(0, limit - chosen.length - quota.slice(0, b).reduce((a, x) => a + x, 0)));
      if (bucket.length <= want) {
        chosen.push(...bucket);
      } else {
        const step = bucket.length / want;
        for (let i = 0; i < want; i++) chosen.push(bucket[Math.floor(i * step)]);
      }
    }

    return {
      total,
      returned: chosen.length,
      points: chosen.map((row) => ({
        r: row,
        id: `LAC-${500000 + row}`,
        lat: Number(c.lat[row].toFixed(4)),
        lon: Number(c.lon[row].toFixed(4)),
        b: c.riskBand[row],
        s: riskScoreOf(c.score[row]),
        st: c.stageIdx[row],
        p: store.projects[c.projectIdx[row]].id,
      })),
    };
  });
}

/** Aggregate any dimension of the open book — used by the analytics screens. */
export function queryBreakdown(store, f) {
  const key = `breakdown:${JSON.stringify(f)}`;
  return cached(key, () => {
    const dimension = f.by ?? 'stage';
    const predicate = buildPredicate(store, { ...f, status: f.status ?? 'open' });
    const c = store.col;
    const keyOf = {
      stage: (row) => store.stages[c.stageIdx[row]],
      state: (row) => store.projects[c.projectIdx[row]].state,
      district: (row) => store.districtTable[c.districtIdx[row]].district,
      ownership: (row) => store.dicts.ownership[c.ownershipIdx[row]],
      compensation: (row) => store.dicts.compStatus[c.compStatusIdx[row]],
      landType: (row) => store.dicts.landType[c.landTypeIdx[row]],
      projectType: (row) => store.projects[c.projectIdx[row]].type,
      authority: (row) => store.projects[c.projectIdx[row]].authority,
      priority: (row) => store.projects[c.projectIdx[row]].priority,
      verification: (row) => store.dicts.verification[c.verifIdx[row]],
      possession: (row) => store.dicts.possession[c.possessionIdx[row]],
      rrStatus: (row) => store.dicts.rrStatus[c.rrStatusIdx[row]],
      dispute: (row) => store.dicts.dispute[c.disputeIdx[row]],
    }[dimension];
    if (!keyOf) return { error: `unknown dimension "${dimension}"` };

    const map = new Map();
    for (let row = 0; row < store.rows; row++) {
      if (!predicate(row)) continue;
      const k = keyOf(row);
      let e = map.get(k);
      if (!e) {
        e = { key: k, cases: 0, scoreSum: 0, band: [0, 0, 0, 0], areaSum: 0, observed: 0, delayed: 0, delaySum: 0, delayN: 0 };
        map.set(k, e);
      }
      e.cases++;
      e.scoreSum += c.score[row];
      e.band[c.riskBand[row]]++;
      e.areaSum += c.areaHa[row];
      if (c.observed[row] === 1) {
        e.observed++;
        if (c.delayed[row] === 1) e.delayed++;
        if (c.actualDelay[row] !== -9999) {
          e.delaySum += c.actualDelay[row];
          e.delayN++;
        }
      }
    }

    return {
      dimension,
      rows: Array.from(map.values())
        .map((e) => ({
          key: e.key,
          cases: e.cases,
          riskScore: Math.round((e.scoreSum / e.cases) * 100),
          riskMix: { Low: e.band[0], Medium: e.band[1], High: e.band[2], Critical: e.band[3] },
          highRisk: e.band[2] + e.band[3],
          areaHa: Number(e.areaSum.toFixed(1)),
          observedDelayRate: e.observed ? Number((e.delayed / e.observed).toFixed(4)) : null,
          avgDelayDays: e.delayN ? Number((e.delaySum / e.delayN).toFixed(1)) : null,
        }))
        .sort((a, b) => b.cases - a.cases),
    };
  });
}

/** Contributor leaderboard over a filtered slice of the open book. */
export function queryContributors(store, f) {
  const key = `contrib:${JSON.stringify(f)}`;
  return cached(key, () => {
    if (!store.shapIdx) return { groups: [], features: [] };
    const predicate = buildPredicate(store, { ...f, status: 'open' });
    const c = store.col;
    const k = store.shapK;
    const groups = new Map();
    const features = new Map();
    let cases = 0;
    for (let row = 0; row < store.rows; row++) {
      if (!predicate(row)) continue;
      cases++;
      for (let i = 0; i < k; i++) {
        const v = store.shapVal[row * k + i];
        if (v <= 0) continue;
        const spec = store.featureSpec[store.shapIdx[row * k + i]];
        if (!spec) continue;
        const g = spec.group ?? 'Other';
        groups.set(g, (groups.get(g) ?? 0) + v);
        const fk = spec.label ?? spec.name;
        features.set(fk, (features.get(fk) ?? 0) + v);
      }
    }
    const norm = (m) => {
      const total = Array.from(m.values()).reduce((a, b) => a + b, 0) || 1;
      return Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value: Number(value.toFixed(2)), share: Number((value / total).toFixed(4)) }));
    };
    return { cases, groups: norm(groups), features: norm(features).slice(0, 14) };
  });
}

export { caseAt, contributorsFor };
