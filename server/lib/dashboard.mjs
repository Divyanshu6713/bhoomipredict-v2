/**
 * Dashboard aggregation over the effective projects in the user's scope.
 *
 * Every figure is computed here from the same project objects the registry,
 * project page, GIS, queue and alerts read, so a number on the dashboard can
 * always be reproduced by filtering one of those screens.
 */
import { effectiveProjects } from './projects.mjs';
import { allInterventions } from './workflow.mjs';
import { inScope } from '../domain/roles.mjs';
import { LIFECYCLE_STAGES } from '../domain/registry.mjs';
import { severityRank } from '../domain/rules.mjs';
import { sectorById } from '../domain/hierarchy.mjs';

const BANDS = ['Low', 'Medium', 'High', 'Critical'];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (v) => Number(v.toFixed(1));

export function scopedProjects(user, f = {}) {
  return effectiveProjects().list.filter((p) => {
    if (!inScope(user, p)) return false;
    if (f.state && p.state !== f.state) return false;
    if (f.district && !p.districts.includes(f.district)) return false;
    if (f.projectType && p.type !== f.projectType) return false;
    if (f.sector && f.sector !== 'all' && !(sectorById(f.sector)?.projectTypes ?? []).includes(p.type)) return false;
    return true;
  });
}

export function dashboardSummary(user, f = {}, store) {
  const projects = scopedProjects(user, f);
  const ids = new Set(projects.map((p) => p.id));
  const openActions = allInterventions().filter((i) => ids.has(i.projectId) && !['RESOLVED', 'DISMISSED'].includes(i.status));
  // Immediate action: an open Critical (P1) intervention — blocked stage, severe compensation backlog, long overdue milestone or Critical model risk.
  const immediate = new Set(openActions.filter((i) => severityRank(i.severity) >= 3).map((i) => i.projectId));

  const group = (keyFn) => {
    const m = new Map();
    for (const p of projects) {
      const k = keyFn(p);
      const e = m.get(k) ?? { key: k, projects: 0, riskSum: 0, high: 0, critical: 0, delayed: 0, blocked: 0, openCases: 0, probSum: 0 };
      e.projects++;
      e.riskSum += p.riskScore;
      e.probSum += p.delayProbability;
      if (p.riskBand === 'High') e.high++;
      if (p.riskBand === 'Critical') e.critical++;
      if (p.lifecycle.isDelayed) e.delayed++;
      if (p.lifecycle.isBlocked) e.blocked++;
      e.openCases += p.openCases ?? 0;
      m.set(k, e);
    }
    return Array.from(m.values()).map((e) => ({
      key: e.key,
      projects: e.projects,
      avgRisk: Math.round(e.riskSum / e.projects),
      avgDelayProbability: Number((e.probSum / e.projects).toFixed(3)),
      highRisk: e.high,
      critical: e.critical,
      delayed: e.delayed,
      blocked: e.blocked,
      openCases: e.openCases,
    }));
  };

  // Delay drivers: SHAP contribution shares, weighted by each project's open book.
  const drivers = new Map();
  let driverWeight = 0;
  for (const p of projects) {
    const w = Math.max(1, p.openCases ?? 1);
    for (const c of p.contributors ?? []) {
      drivers.set(c.group, (drivers.get(c.group) ?? 0) + c.share * w);
    }
    driverWeight += w;
  }

  // Department bottlenecks: open cases waiting on each dependency role, and the named offices behind them.
  const roles = new Map();
  const offices = new Map();
  for (const p of projects) {
    for (const n of p.network.nodes) {
      if (!n.pendingOpenCases) continue;
      const r = roles.get(n.role) ?? { key: n.role, code: n.code, openCasesPending: 0, currentStagePending: 0, projects: 0 };
      r.openCasesPending += n.pendingOpenCases;
      r.currentStagePending += n.pendingCurrentStage ?? 0;
      r.projects++;
      roles.set(n.role, r);
      const o = offices.get(n.name) ?? { key: n.name, role: n.role, openCasesPending: 0, projects: 0 };
      o.openCasesPending += n.pendingOpenCases;
      o.projects++;
      offices.set(n.name, o);
    }
  }

  const bucket = (values, edges) =>
    edges.slice(0, -1).map((lo, i) => ({ key: `${lo}–${edges[i + 1]}%`, count: values.filter((v) => v >= lo && (i === edges.length - 2 ? v <= edges[i + 1] : v < edges[i + 1])).length }));

  const compProjects = projects.filter((p) => p.currentStageIndex >= 5);
  const rrProjects = projects.filter((p) => (p.rrRequiredParcels ?? 0) > 0 && p.rrProgressPct !== null && p.rrProgressPct !== undefined);

  // Scoped monthly trend from each project's own data-derived trend.
  const months = new Map();
  for (const p of projects) {
    for (const m of p.riskTrend ?? []) {
      const e = months.get(m.month) ?? { month: m.month, cases: 0, riskSum: 0, observedSum: 0, observedN: 0 };
      e.cases += m.cases;
      e.riskSum += m.riskScore * m.cases;
      if (m.observedDelayRate !== null) {
        e.observedSum += m.observedDelayRate * m.cases;
        e.observedN += m.cases;
      }
      months.set(m.month, e);
    }
  }

  return {
    today: store.today,
    dataMode: 'SYNTHETIC DEMO DATA',
    scope: { filters: f, projects: projects.length },
    kpis: {
      totalProjects: projects.length,
      highRiskProjects: projects.filter((p) => p.riskBand === 'High').length,
      criticalRiskProjects: projects.filter((p) => p.riskBand === 'Critical').length,
      delayedProjects: projects.filter((p) => p.lifecycle.isDelayed).length,
      blockedProjects: projects.filter((p) => p.lifecycle.isBlocked).length,
      immediateActionRequired: immediate.size,
      averageDelayProbability: Number(mean(projects.map((p) => p.delayProbability)).toFixed(3)),
      openInterventions: openActions.length,
      openCases: projects.reduce((a, p) => a + (p.openCases ?? 0), 0),
      residualBacklogCases: projects.reduce((a, p) => a + p.lifecycle.residualBacklog, 0),
      affectedFamilies: projects.reduce((a, p) => a + (p.affectedFamilies ?? 0), 0),
      landRequirementHa: Math.round(projects.reduce((a, p) => a + (p.landRequirementHa ?? 0), 0)),
      averagePredictedDelayDays: Math.round(mean(projects.map((p) => p.predictedDelayDays ?? 0))),
      likelyToMissTarget: projects.filter((p) => (p.forecast?.completion?.probabilityMissTarget ?? 0) >= 0.5).length,
      // Median forecast more than six months beyond the sanctioned target — the overruns worth escalating.
      severeOverrunLikely: projects.filter((p) => (p.forecast?.completion?.p50OverrunDays ?? 0) > 180).length,
    },
    riskDistribution: BANDS.map((b) => ({ key: b, projects: projects.filter((p) => p.riskBand === b).length })),
    caseRiskDistribution: BANDS.map((b) => ({ key: b, cases: projects.reduce((a, p) => a + (p.riskMix?.[b] ?? 0), 0) })),
    stateRisk: group((p) => p.state).sort((a, b) => b.avgRisk - a.avgRisk),
    districtRisk: group((p) => `${p.district}, ${p.state}`).sort((a, b) => b.avgRisk - a.avgRisk).slice(0, 15),
    projectTypeRisk: group((p) => p.type).sort((a, b) => b.avgRisk - a.avgRisk),
    stageDistribution: LIFECYCLE_STAGES.map((s, i) => {
      const inStage = projects.filter((p) => p.currentStageIndex === i);
      return {
        key: s,
        projects: inStage.length,
        inProgress: inStage.filter((p) => p.lifecycle.currentStatus === 'IN_PROGRESS').length,
        delayed: inStage.filter((p) => p.lifecycle.currentStatus === 'DELAYED').length,
        blocked: inStage.filter((p) => p.lifecycle.currentStatus === 'BLOCKED').length,
        avgRisk: Math.round(mean(inStage.map((p) => p.riskScore))),
      };
    }),
    delayDrivers: Array.from(drivers.entries())
      .map(([key, v]) => ({ key, share: Number((v / Math.max(1, driverWeight)).toFixed(4)) }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 10),
    compensation: {
      projectsAtOrPastCompensation: compProjects.length,
      averageCompletionPct: round1(mean(compProjects.map((p) => p.compensationCompletionPct))),
      buckets: bucket(compProjects.map((p) => p.compensationCompletionPct), [0, 25, 50, 75, 90, 100]),
      backlogProjects: projects.filter((p) => p.recommendations.some((r) => r.code === 'COMPENSATION_BACKLOG')).length,
    },
    legal: {
      legalCases: projects.reduce((a, p) => a + (p.legalCases ?? 0), 0),
      disputedParcels: projects.reduce((a, p) => a + (p.legalDisputeParcels ?? 0), 0),
      projectsWithEscalation: projects.filter((p) => p.recommendations.some((r) => r.code === 'LEGAL_ESCALATION')).length,
      byType: group((p) => p.type).map((g) => ({ key: g.key, legalCases: projects.filter((p) => p.type === g.key).reduce((a, p) => a + (p.legalCases ?? 0), 0) })).sort((a, b) => b.legalCases - a.legalCases),
    },
    rr: {
      projectsWithRR: rrProjects.length,
      averageProgressPct: round1(mean(rrProjects.map((p) => p.rrProgressPct))),
      buckets: bucket(rrProjects.map((p) => p.rrProgressPct), [0, 25, 50, 75, 90, 100]),
      affectedFamilies: rrProjects.reduce((a, p) => a + (p.affectedFamilies ?? 0), 0),
    },
    timeline: {
      onTrack: projects.filter((p) => p.lifecycle.currentStatus === 'IN_PROGRESS').length,
      delayed: projects.filter((p) => p.lifecycle.currentStatus === 'DELAYED').length,
      blocked: projects.filter((p) => p.lifecycle.currentStatus === 'BLOCKED').length,
      // Same figure as each project's risk card: forecast (P50) finish minus target.
      overrunBuckets: (() => {
        const v = projects.map((p) => p.forecast?.headline.daysVsTarget ?? 0);
        return [
          { key: 'On or ahead of target', count: v.filter((d) => d <= 0).length },
          { key: '1–90 days', count: v.filter((d) => d > 0 && d <= 90).length },
          { key: '91–240 days', count: v.filter((d) => d > 90 && d <= 240).length },
          { key: 'Over 240 days', count: v.filter((d) => d > 240).length },
        ];
      })(),
    },
    departmentBottlenecks: {
      byRole: Array.from(roles.values()).sort((a, b) => b.currentStagePending - a.currentStagePending),
      byOffice: Array.from(offices.values()).sort((a, b) => b.openCasesPending - a.openCasesPending).slice(0, 12),
    },
    trend: Array.from(months.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-18)
      .map((m) => ({ month: m.month, predicted: round1(m.riskSum / Math.max(1, m.cases)), observed: m.observedN ? round1((m.observedSum / m.observedN) * 100) : null, cases: m.cases })),
    topProjects: [...projects]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        name: p.name,
        state: p.state,
        district: p.district,
        type: p.type,
        stage: p.currentStage,
        stageStatus: p.lifecycle.currentStatus,
        riskScore: p.riskScore,
        riskBand: p.riskBand,
        predictedDelayDays: p.predictedDelayDays,
        topAction: p.recommendations.find((r) => r.intervention)?.title ?? null,
      })),
  };
}
