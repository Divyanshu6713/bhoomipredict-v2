/**
 * Delay trends and performance indicators.
 *
 * Trends are keyed on the milestone due month, in two clearly separated parts:
 *
 *   observed  share of milestones that actually slipped more than 30 days, from
 *             labelled cases (including newly recorded outcomes after a rebuild)
 *   forecast  expected share of open milestones that will slip, from the
 *             deployed model's probabilities for cases still open
 *
 * The two never overlap in time, so the chart cannot be read as the model
 * "agreeing" with outcomes it was trained on. Groups are states, or the
 * districts of one state, restricted to the viewer's jurisdiction.
 *
 * Performance indicators rank the bodies that act on acquisitions — acquiring
 * authorities, the offices behind each dependency and districts — on observed
 * delay, predicted risk, pending work and how fast their interventions close.
 */
import { isoFromDay } from './store.mjs';
import { scopedProjects } from './dashboard.mjs';
import { allInterventions } from './workflow.mjs';
import { getState } from './persistence.mjs';

const round = (v, d = 3) => Number(v.toFixed(d));
const monthOf = (day) => isoFromDay(day).slice(0, 7);

export function delayTrends(store, user, { level = 'state', state, district, months = 18, forecastMonths = 6, top = 8 } = {}) {
  const projects = scopedProjects(user, state ? { state } : {}).filter((p) => p.storeIndex !== undefined);
  const c = store.col;
  // Months up to the effective date (the snapshot, or the advanced simulation clock) are history.
  const todayMonth = (getState().learning?.simulationDate ?? store.today).slice(0, 7);
  const groups = new Map();
  const overall = new Map();
  const bump = (map, key, month, delayed, prob, observed) => {
    const g = map.get(key) ?? new Map();
    const e = g.get(month) ?? { obsN: 0, obsDelayed: 0, openN: 0, probSum: 0 };
    if (observed) {
      e.obsN++;
      e.obsDelayed += delayed;
    } else {
      e.openN++;
      e.probSum += prob;
    }
    g.set(month, e);
    map.set(key, g);
  };
  const totals = new Map();
  for (const p of projects) {
    const start = store.ranges[p.storeIndex * 2];
    const end = store.ranges[p.storeIndex * 2 + 1];
    for (let row = start; row < end; row++) {
      const d = store.districtTable[c.districtIdx[row]];
      if (district && d.district !== district) continue;
      const key = level === 'district' ? d.district : p.state;
      const observed = c.observed[row] === 1;
      const month = monthOf(c.dueDay[row]);
      const delayed = c.delayed[row] === 1 ? 1 : 0;
      bump(groups, key, month, delayed, c.score[row], observed);
      bump(overall, 'All', month, delayed, c.score[row], observed);
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
  }
  const keys = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k]) => k);
  const allMonths = new Set();
  for (const g of overall.values()) for (const m of g.keys()) allMonths.add(m);
  const sorted = Array.from(allMonths).sort();
  const lastObserved = sorted.filter((m) => m < todayMonth);
  const window = [...lastObserved.slice(-months), ...sorted.filter((m) => m >= todayMonth).slice(0, forecastMonths)];

  const pointFor = (g, m) => {
    const e = g?.get(m);
    if (!e) return { observed: null, forecast: null, observedCases: 0, openCases: 0 };
    const isFuture = m >= todayMonth;
    return {
      observed: !isFuture && e.obsN >= 20 ? round(e.obsDelayed / e.obsN) : null,
      forecast: isFuture && e.openN >= 20 ? round(e.probSum / e.openN) : null,
      observedCases: e.obsN,
      openCases: e.openN,
    };
  };
  const series = window.map((m) => ({
    month: m,
    phase: m >= todayMonth ? 'forecast' : 'observed',
    overall: pointFor(overall.get('All'), m),
    groups: Object.fromEntries(keys.map((k) => [k, pointFor(groups.get(k), m)])),
  }));
  const summary = keys.map((k) => {
    const g = groups.get(k);
    let obsN = 0, obsD = 0, openN = 0, prob = 0, recentN = 0, recentD = 0, priorN = 0, priorD = 0;
    const recentFrom = lastObserved.slice(-6)[0];
    const priorFrom = lastObserved.slice(-12)[0];
    for (const [m, e] of g) {
      if (m >= todayMonth) {
        if (window.includes(m)) {
          openN += e.openN;
          prob += e.probSum;
        }
        continue;
      }
      obsN += e.obsN;
      obsD += e.obsDelayed;
      if (recentFrom && m >= recentFrom) {
        recentN += e.obsN;
        recentD += e.obsDelayed;
      } else if (priorFrom && m >= priorFrom) {
        priorN += e.obsN;
        priorD += e.obsDelayed;
      }
    }
    const recent = recentN ? recentD / recentN : null;
    const prior = priorN ? priorD / priorN : null;
    return {
      key: k,
      cases: totals.get(k),
      observedDelayRate: obsN ? round(obsD / obsN) : null,
      last6MonthsRate: recent === null ? null : round(recent),
      previous6MonthsRate: prior === null ? null : round(prior),
      direction: recent === null || prior === null ? 'n/a' : recent - prior > 0.02 ? 'worsening' : prior - recent > 0.02 ? 'improving' : 'steady',
      forecastDelayShare: openN ? round(prob / openN) : null,
      forecastOpenMilestones: openN,
    };
  });
  return {
    level,
    state: state ?? null,
    district: district ?? null,
    snapshotMonth: todayMonth,
    groups: keys,
    series,
    summary,
    definitions: {
      observed: 'Share of milestones due that month which slipped more than 30 days (recorded outcomes).',
      forecast: 'Mean deployed-model probability for open milestones due that month — the expected share that will slip.',
    },
  };
}

export function performanceIndicators(store, user, f = {}) {
  const projects = scopedProjects(user, f);
  const ids = new Set(projects.map((p) => p.id));
  const interventions = allInterventions().filter((i) => ids.has(i.projectId));
  const resolutionDays = (i) => {
    const done = i.history?.find((h) => ['RESOLVED', 'DISMISSED'].includes(h.to?.status));
    return done ? (new Date(done.at).getTime() - new Date(i.created_at).getTime()) / 86400000 : null;
  };
  const agg = (keyFn, label) => {
    const m = new Map();
    for (const p of projects) {
      for (const key of [].concat(keyFn(p))) {
        if (!key) continue;
        const e = m.get(key) ?? { key, projects: 0, openCases: 0, observed: 0, delayedObs: 0, riskSum: 0, high: 0, delayedProjects: 0, blocked: 0, approvalSum: 0, approvalN: 0, predictedSlipSum: 0 };
        e.projects++;
        e.openCases += p.openCases ?? 0;
        e.observed += p.observedCases ?? 0;
        e.delayedObs += Math.round((p.observedDelayRate ?? 0) * (p.observedCases ?? 0));
        e.riskSum += p.riskScore;
        if (['High', 'Critical'].includes(p.riskBand)) e.high++;
        if (p.lifecycle.isDelayed) e.delayedProjects++;
        if (p.lifecycle.isBlocked) e.blocked++;
        if (p.approvalDelayDays) {
          e.approvalSum += p.approvalDelayDays;
          e.approvalN++;
        }
        e.predictedSlipSum += p.predictedDelayDays ?? 0;
        m.set(key, e);
      }
    }
    return Array.from(m.values()).map((e) => {
      const items = interventions.filter((i) => [].concat(label(i)).includes(e.key));
      const closed = items.map(resolutionDays).filter((d) => d !== null);
      return {
        key: e.key,
        projects: e.projects,
        openCases: e.openCases,
        observedDelayRate: e.observed ? round(e.delayedObs / e.observed) : null,
        avgRisk: Math.round(e.riskSum / e.projects),
        highOrCriticalProjects: e.high,
        delayedProjects: e.delayedProjects,
        blockedProjects: e.blocked,
        avgApprovalDelayDays: e.approvalN ? Math.round(e.approvalSum / e.approvalN) : null,
        avgPredictedSlipDays: Math.round(e.predictedSlipSum / e.projects),
        interventionsOpen: items.filter((i) => !['RESOLVED', 'DISMISSED'].includes(i.status)).length,
        interventionsOverdue: items.filter((i) => i.overdue).length,
        interventionsResolved: closed.length,
        meanResolutionDays: closed.length ? round(closed.reduce((a, b) => a + b, 0) / closed.length, 1) : null,
      };
    });
  };
  const byAuthority = agg((p) => p.authority, (i) => effectiveAuthority(projects, i)).sort((a, b) => b.avgRisk - a.avgRisk);
  const byDistrict = agg((p) => `${p.district}, ${p.state}`, (i) => `${i.district}, ${i.state}`).sort((a, b) => b.avgRisk - a.avgRisk);
  const byState = agg((p) => p.state, (i) => i.state).sort((a, b) => b.avgRisk - a.avgRisk);

  const offices = new Map();
  for (const p of projects) {
    for (const n of p.network.nodes) {
      const e = offices.get(n.name) ?? { key: n.name, role: n.role, level: n.level, projects: 0, openCasesPending: 0, currentStagePending: 0 };
      e.projects++;
      e.openCasesPending += n.pendingOpenCases ?? 0;
      e.currentStagePending += n.pendingCurrentStage ?? 0;
      offices.set(n.name, e);
    }
  }
  const byOffice = Array.from(offices.values())
    .map((o) => {
      const items = interventions.filter((i) => i.responsible_department === o.key);
      const closed = items.map(resolutionDays).filter((d) => d !== null);
      return { ...o, interventionsOpen: items.filter((i) => !['RESOLVED', 'DISMISSED'].includes(i.status)).length, interventionsOverdue: items.filter((i) => i.overdue).length, meanResolutionDays: closed.length ? round(closed.reduce((a, b) => a + b, 0) / closed.length, 1) : null };
    })
    .filter((o) => o.openCasesPending > 0 || o.interventionsOpen > 0)
    .sort((a, b) => b.currentStagePending - a.currentStagePending)
    .slice(0, 25);

  const closedAll = interventions.map(resolutionDays).filter((d) => d !== null);
  return {
    scope: { projects: projects.length, filters: f },
    kpis: {
      projects: projects.length,
      onTrackShare: projects.length ? round(projects.filter((p) => p.lifecycle.currentStatus === 'IN_PROGRESS').length / projects.length) : null,
      observedDelayRate: (() => {
        const obs = projects.reduce((a, p) => a + (p.observedCases ?? 0), 0);
        const del = projects.reduce((a, p) => a + (p.observedDelayRate ?? 0) * (p.observedCases ?? 0), 0);
        return obs ? round(del / obs) : null;
      })(),
      meanRisk: projects.length ? Math.round(projects.reduce((a, p) => a + p.riskScore, 0) / projects.length) : null,
      medianForecastOverrunDays: (() => {
        const v = projects.map((p) => p.forecast?.completion?.p50OverrunDays ?? 0).sort((a, b) => a - b);
        return v.length ? v[Math.floor(v.length / 2)] : null;
      })(),
      projectsLikelyToMissTarget: projects.filter((p) => (p.forecast?.completion?.probabilityMissTarget ?? 0) >= 0.5).length,
      severeOverrunLikely: projects.filter((p) => (p.forecast?.completion?.p50OverrunDays ?? 0) > 180).length,
      interventionsOpen: interventions.filter((i) => !['RESOLVED', 'DISMISSED'].includes(i.status)).length,
      interventionsOverdue: interventions.filter((i) => i.overdue).length,
      interventionsEscalated: interventions.filter((i) => i.escalationLevel > 0).length,
      interventionResolutionRate: interventions.length ? round(closedAll.length / interventions.length) : null,
      meanResolutionDays: closedAll.length ? round(closedAll.reduce((a, b) => a + b, 0) / closedAll.length, 1) : null,
    },
    byState,
    byDistrict: byDistrict.slice(0, 30),
    byAuthority: byAuthority.slice(0, 30),
    byOffice,
  };
}

function effectiveAuthority(projects, i) {
  return projects.find((p) => p.id === i.projectId)?.authority ?? null;
}

export { monthOf };
