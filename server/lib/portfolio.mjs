/**
 * National portfolio drill-down.
 *
 *   India → Sector ministry → State / UT → District → Project
 *
 * Every level is an aggregation of the same effective projects (and the same
 * model scores) the dashboard, registry and project pages read, limited to
 * the signed-in user's scope. A project belongs to exactly one sector, so
 * sector totals add up to the national total; a multi-district project is
 * counted in each district it spans, which the response states.
 */
import { scopedProjects } from './dashboard.mjs';
import { SECTORS, sectorById, sectorForType, organisations, organisationMatchesProject } from '../domain/hierarchy.mjs';
import { STATES_AND_UTS, stateInfo } from '../domain/india.mjs';
import { ServiceError } from './projects.mjs';

const BAND_ORDER = ['Low', 'Medium', 'High', 'Critical'];

function stats(projects) {
  const n = projects.length;
  const drivers = new Map();
  for (const p of projects) if (p.topContributor) drivers.set(p.topContributor, (drivers.get(p.topContributor) ?? 0) + 1);
  const topDriver = Array.from(drivers.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    projects: n,
    active: projects.filter((p) => p.lifecycle.currentStatus !== 'COMPLETED').length,
    delayed: projects.filter((p) => p.lifecycle.isDelayed).length,
    blocked: projects.filter((p) => p.lifecycle.isBlocked).length,
    highRisk: projects.filter((p) => p.riskBand === 'High').length,
    critical: projects.filter((p) => p.riskBand === 'Critical').length,
    avgRisk: n ? Math.round(projects.reduce((s, p) => s + p.riskScore, 0) / n) : null,
    openCases: projects.reduce((s, p) => s + (p.openCases ?? 0), 0),
    affectedFamilies: projects.reduce((s, p) => s + (p.affectedFamilies ?? 0), 0),
    landRequirementHa: Math.round(projects.reduce((s, p) => s + (p.landRequirementHa ?? 0), 0)),
    topDriver: topDriver ? { group: topDriver[0], projects: topDriver[1] } : null,
  };
}

const worstFirst = (a, b) => (b.stats.critical - a.stats.critical) || (b.stats.highRisk - a.stats.highRisk) || ((b.stats.avgRisk ?? -1) - (a.stats.avgRisk ?? -1));

export function portfolioDrilldown(user, q = {}) {
  const sector = q.sector && q.sector !== 'all' ? sectorById(q.sector) : null;
  if (q.sector && q.sector !== 'all' && !sector) throw new ServiceError(`Unknown sector "${q.sector}"`, 422);
  if (q.state && !stateInfo(q.state)) throw new ServiceError(`"${q.state}" is not a State or Union Territory of India`, 422);
  if (q.district && !q.state) throw new ServiceError('A district needs its state', 422);

  const all = scopedProjects(user);
  let pool = all;
  if (sector) pool = pool.filter((p) => sector.projectTypes.includes(p.type));
  if (q.state) pool = pool.filter((p) => p.state === q.state);
  if (q.district) pool = pool.filter((p) => p.districts.includes(q.district));

  const path = [{ level: 'country', label: 'India', query: {} }];
  if (q.sector) path.push({ level: 'sector', label: sector ? sector.label : 'All sectors', query: { sector: q.sector } });
  if (q.state) path.push({ level: 'state', label: q.state, query: { sector: q.sector ?? 'all', state: q.state } });
  if (q.district) path.push({ level: 'district', label: q.district, query: { sector: q.sector ?? 'all', state: q.state, district: q.district } });

  let level;
  let children;
  let oversight = [];
  let note = null;

  if (!q.sector) {
    level = 'sector';
    children = SECTORS.map((s) => {
      const list = pool.filter((p) => s.projectTypes.includes(p.type));
      const ministry = organisations().byId.get(s.ministryId);
      return {
        id: s.id,
        label: s.label,
        detail: ministry?.name ?? null,
        onboarded: s.projectTypes.length > 0,
        projectTypes: s.projectTypes,
        stats: stats(list),
        query: { sector: s.id },
      };
    }).sort((a, b) => (Number(b.onboarded) - Number(a.onboarded)) || (b.stats.projects - a.stats.projects));
    oversight = organisations()
      .filter((o) => o.lens === 'oversight')
      .map((o) => ({ id: o.id, label: o.short, detail: o.name, description: o.description, stats: stats(pool.filter((p) => organisationMatchesProject(o, p))) }));
    note = 'Each project is grouped under its sector ministry, including state-executed projects in that sector. Oversight lenses overlap sectors and are shown separately.';
  } else if (!q.state) {
    level = 'state';
    const byState = new Map();
    for (const p of pool) byState.set(p.state, [...(byState.get(p.state) ?? []), p]);
    children = STATES_AND_UTS.filter((s) => byState.has(s.name)).map((s) => ({
      id: s.name,
      label: s.name,
      detail: `${s.type} · ${s.zonalCouncil}`,
      stats: stats(byState.get(s.name)),
      query: { sector: q.sector, state: s.name },
    })).sort(worstFirst);
    const without = STATES_AND_UTS.length - children.length;
    note = `${children.length} of ${STATES_AND_UTS.length} States / UTs have projects in this view${without ? `; ${without} have none in the demo corpus` : ''}.`;
  } else if (!q.district) {
    level = 'district';
    const byDistrict = new Map();
    for (const p of pool) for (const d of p.districts) byDistrict.set(d, [...(byDistrict.get(d) ?? []), p]);
    children = Array.from(byDistrict.entries()).map(([d, list]) => ({
      id: d,
      label: d,
      detail: null,
      stats: stats(list),
      query: { sector: q.sector, state: q.state, district: d },
    })).sort(worstFirst);
    note = 'A project spanning several districts is counted in each of them, so district totals can exceed the state total.';
  } else {
    level = 'project';
    children = [...pool].sort((a, b) => b.riskScore - a.riskScore).map((p) => ({
      id: p.id,
      label: p.name,
      detail: `${p.type} · ${p.authority}`,
      projectId: p.id,
      riskScore: p.riskScore,
      riskBand: p.riskBand,
      stage: p.currentStage,
      stageStatus: p.lifecycle.currentStatus,
      predictedDelayDays: p.predictedDelayDays ?? null,
      topDriver: p.topContributor ?? null,
      source: p.source,
      stats: stats([p]),
    }));
  }

  const riskMix = BAND_ORDER.map((b) => ({ band: b, projects: pool.filter((p) => p.riskBand === b).length }));

  return {
    level,
    path,
    totals: stats(pool),
    riskMix,
    children,
    oversight,
    note,
    scope: { projectsInScope: all.length },
    engine: 'Risk figures are the deployed model’s project scores (see each project’s risk basis); the same engine serves every level.',
    dataMode: 'SYNTHETIC DEMO DATA',
  };
}

/** Portfolio stats for a profile page. */
export function positionPortfolio(user) {
  const projects = scopedProjects(user);
  const group = (keyFn, labelFn = (k) => k) => {
    const m = new Map();
    for (const p of projects) {
      const k = keyFn(p);
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return Array.from(m.entries()).map(([k, list]) => ({ key: k, label: labelFn(k), ...stats(list) })).sort((a, b) => b.projects - a.projects);
  };
  return {
    totals: stats(projects),
    bySector: group((p) => sectorForType(p.type)?.id, (k) => sectorById(k)?.label ?? k),
    byState: group((p) => p.state).slice(0, 8),
    byStage: group((p) => p.currentStage),
  };
}
