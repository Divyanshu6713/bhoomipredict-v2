import { lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, ChevronRight, FolderSearch } from 'lucide-react';
import { Card, CardHeader, EmptyState, MetricStrip, PageSection, PageSkeleton, Select } from '@/components/ui';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { ChartLegend, ChartTooltip } from '@/components/charts';
import { AXIS_TICK, AXIS_TICK_STRONG, CHART_COLORS, CHART_CURSOR, RISK_CLASS, RISK_HEX, RISK_ICON, RISK_ORDER, riskFromScore } from '@/lib/risk';
import { STAGE_STATUS_DOT, STAGE_STATUS_LABEL } from '@/lib/status';
import { formatCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useApi, useFilters } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchDashboard, fetchFacets, fetchTrends } from '@/api/client';
import type { DashboardSummary } from '@/data/types';

// three.js loads with this card only, after the rest of the overview has rendered
const PortfolioRelief3D = lazy(() => import('@/components/three/PortfolioRelief3D'));
const webgl2 = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();

const STAGE_COLORS = { inProgress: '#A9BEE8', delayed: RISK_HEX.Medium, blocked: RISK_HEX.Critical };

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { values, set } = useFilters({ sector: 'all', state: 'all', district: 'all', projectType: 'all' });
  const facets = useApi((signal) => fetchFacets(signal), []);
  const summary = useApi((signal) => fetchDashboard({ sector: values.sector, state: values.state, district: values.district, projectType: values.projectType }, signal), [values.sector, values.state, values.district, values.projectType]);
  const trend = useApi((signal) => fetchTrends({ level: values.state !== 'all' ? 'district' : 'state', state: values.state, district: values.district, months: 15, top: 1 }, signal), [values.state, values.district]);
  const s = summary.data;

  const go = (params: Record<string, string>) =>
    navigate(
      `/projects?${new URLSearchParams({ ...(values.sector !== 'all' ? { sector: values.sector } : {}), ...(values.state !== 'all' ? { state: values.state } : {}), ...(values.projectType !== 'all' ? { projectType: values.projectType } : {}), ...params }).toString()}`,
    );

  const filters = (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
      <Select hideLabel className="sm:w-[168px]" label="Sector" value={values.sector} onChange={(v) => set({ sector: v, projectType: 'all' })} options={[{ label: 'All sectors', value: 'all' }, ...(facets.data?.sectors ?? []).filter((x) => x.projectTypes.length).map((x) => ({ label: x.label, value: x.id }))]} />
      <Select hideLabel className="sm:w-[156px]" label="State" value={values.state} onChange={(v) => set({ state: v, district: 'all' })} options={[{ label: 'All States in scope', value: 'all' }, ...(facets.data?.states ?? []).map((x) => ({ label: x, value: x }))]} />
      <Select hideLabel className="sm:w-[156px]" label="District" disabled={values.state === 'all'} value={values.district} onChange={(v) => set({ district: v })} options={[{ label: values.state === 'all' ? 'All districts' : 'All districts', value: 'all' }, ...(facets.data?.districts ?? []).filter((d) => d.state === values.state).map((d) => ({ label: d.district, value: d.district }))]} />
      <Select hideLabel className="sm:w-[168px]" label="Project type" value={values.projectType} onChange={(v) => set({ projectType: v })} options={[{ label: 'All project types', value: 'all' }, ...(facets.data?.projectTypes ?? []).filter((x) => values.sector === 'all' || facets.data?.sectors.find((sec) => sec.id === values.sector)?.projectTypes.includes(x)).map((x) => ({ label: x, value: x }))]} />
    </div>
  );

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  if (!s) return <PageSkeleton blocks={2} />;
  const k = s.kpis;
  const scopeName = values.district !== 'all' ? `${values.district}, ${values.state}` : values.state !== 'all' ? values.state : user?.scopeLabel ?? 'All in scope';

  return (
    <div className={cn('space-y-8', summary.refreshing && 'opacity-80 transition-opacity')}>
      {/* Scope and filters */}
      <div className="-mt-2 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <p className="text-sm text-ink-3">
          <span className="font-medium text-ink-2">{user?.position.organisation.name}</span> · {scopeName} · <span className="num">{formatNumber(s.scope.projects)}</span> projects in view ·{' '}
          <Link to={`/hierarchy${values.sector !== 'all' ? `?sector=${values.sector}` : ''}`} className="link">
            Drill down by geography
          </Link>
        </p>
        {filters}
      </div>

      {s.scope.projects === 0 ? (
        <Card>
          <EmptyState icon={<FolderSearch />} title="No projects in this view" description="Nothing in your jurisdiction matches these filters. Clear a filter or choose another State to see projects and their predicted risk." action={<Link to="/dashboard" className="link text-sm">Clear all filters</Link>} />
        </Card>
      ) : (
        <>
          {/* Headline figures */}
          <MetricStrip
            items={[
              { label: 'Projects in view', value: formatNumber(k.totalProjects), hint: `${formatCompact(k.openCases)} open cases`, onClick: () => go({}) },
              { label: 'Critical risk', value: formatNumber(k.criticalRiskProjects), hint: '≥ 60% of open parcels likely to slip', tone: 'danger', onClick: () => go({ risk: 'Critical' }) },
              { label: 'High risk', value: formatNumber(k.highRiskProjects), hint: '45–60% likely to slip', tone: 'orange', onClick: () => go({ risk: 'High' }) },
              { label: 'Need immediate action', value: formatNumber(k.immediateActionRequired), hint: 'Open critical intervention', onClick: () => go({ flag: 'action' }) },
              { label: 'Behind schedule', value: formatNumber(k.delayedProjects), hint: `${k.blockedProjects} blocked by a dependency`, onClick: () => go({ flag: 'delayed' }) },
              { label: 'Mean delay probability', value: `${Math.round(k.averageDelayProbability * 100)}%`, hint: `~${k.averagePredictedDelayDays} days expected delay at the current step`, onClick: () => go({ sort: 'risk' }) },
            ]}
          />

          {/* What needs attention */}
          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Highest-risk projects"
                subtitle="Ranked by predicted risk of missing the next milestone, with the top recommended action"
                action={
                  <Link to={`/projects?sort=risk${values.state !== 'all' ? `&state=${encodeURIComponent(values.state)}` : ''}`} className="link inline-flex items-center gap-1 text-sm">
                    All projects <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <TopProjects rows={s.topProjects} onOpen={(id) => navigate(`/projects/${id}`)} />
            </Card>
            <RiskDistribution s={s} onSelect={(band) => go({ risk: band })} />
          </div>

          {/* Trend and drivers */}
          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Delay trend"
                subtitle={`${scopeName} · share of milestones more than 30 days late, then the model forecast for open milestones`}
                action={
                  <Link to={`/trends${values.state !== 'all' ? `?level=district&state=${encodeURIComponent(values.state)}` : ''}`} className="link inline-flex items-center gap-1 text-sm">
                    Trends <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="px-5">
                <ChartLegend
                  items={[
                    { label: 'Observed delay rate', color: CHART_COLORS.slate },
                    { label: 'Forecast for open milestones', color: CHART_COLORS.brand, dashed: true },
                  ]}
                />
              </div>
              <div className="h-[260px] px-2 pb-4 pt-2">
                {trend.data ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={(trend.data.series ?? []).map((t) => ({
                        month: formatMonth(t.month),
                        observed: t.overall.observed === null ? null : Math.round(t.overall.observed * 1000) / 10,
                        forecast: t.overall.forecast === null ? null : Math.round(t.overall.forecast * 1000) / 10,
                      }))}
                      margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="rgb(var(--c-line))" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={16} />
                      <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} unit="%" domain={[0, 'auto']} width={44} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={{ stroke: 'rgb(var(--c-line-strong))' }} />
                      <Line dataKey="observed" name="Observed" stroke={CHART_COLORS.slate} strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line dataKey="forecast" name="Forecast" stroke={CHART_COLORS.brand} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5, strokeWidth: 0, fill: CHART_COLORS.brand }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full animate-shimmer rounded-lg bg-surface-2" />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Leading delay drivers" subtitle="Share of risk-increasing model contribution, weighted by open cases" />
              <ol className="space-y-3 px-5 pb-5">
                {s.delayDrivers.map((d, i) => (
                  <li key={d.key}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-ink">{d.key}</span>
                      <span className="font-medium text-ink num">{Math.round(d.share * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full" style={{ width: `${d.share * 100}%`, background: i === 0 ? 'rgb(var(--c-brand))' : 'rgb(var(--c-brand) / 0.5)' }} />
                    </div>
                  </li>
                ))}
              </ol>
              <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Contributions explain predictions; they are not proof of cause.</p>
            </Card>
          </div>

          {/* Geography */}
          <PageSection title="Where risk concentrates" description="Mean predicted project risk — select a State to focus the whole overview">
            {webgl2 && (
              <Card className="mb-5 overflow-hidden">
                <CardHeader
                  title="3D risk relief"
                  subtitle="States raised by mean project risk; pillars are projects. Drag to turn, select a State to focus the overview."
                  action={
                    <Link to={`/map${values.state !== 'all' ? `?state=${encodeURIComponent(values.state)}` : ''}`} className="link text-sm">
                      Open in the risk map
                    </Link>
                  }
                />
                <div className="px-5 pb-5">
                  <Suspense fallback={<div className="grid h-[380px] place-items-center rounded-xl border border-line text-sm text-ink-3">Loading 3D view…</div>}>
                    <PortfolioRelief3D
                      stateRisk={s.stateRisk}
                      selectedState={values.state === 'all' ? null : values.state}
                      onSelectState={(st) => set({ state: st ?? 'all', district: 'all' })}
                    />
                  </Suspense>
                </div>
              </Card>
            )}
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title={values.state === 'all' ? 'By State' : 'By State in view'} />
                <div className="px-2 pb-4" style={{ height: Math.max(200, s.stateRisk.length * 28 + 16) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s.stateRisk} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide domain={[0, 100]} />
                      <YAxis type="category" dataKey="key" tickLine={false} axisLine={false} width={132} tick={AXIS_TICK_STRONG} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={CHART_CURSOR} />
                      <Bar dataKey="avgRisk" name="Mean risk" radius={[0, 3, 3, 0]} barSize={12} className="cursor-pointer" isAnimationActive={false} onClick={(d: { key?: string }) => d?.key && set({ state: d.key, district: 'all' })} label={{ position: 'right', fill: 'rgb(var(--c-ink-2))', fontSize: 11, formatter: (v: number) => `${v}%` }}>
                        {s.stateRisk.map((d) => (
                          <Cell key={d.key} fill={RISK_HEX[riskFromScore(d.avgRisk)]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title="Top districts" subtitle="15 highest by mean project risk" />
                <ul className="divide-y divide-line border-t border-line">
                  {s.districtRisk.map((d) => (
                    <li key={d.key}>
                      <button type="button" onClick={() => go({ district: d.key.split(', ')[0], state: d.key.split(', ')[1] })} className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{d.key}</span>
                          <span className="block text-xs text-ink-3">
                            {d.projects} project{d.projects === 1 ? '' : 's'} · {d.delayed} delayed · {d.blocked} blocked
                          </span>
                        </span>
                        <RiskPill level={riskFromScore(d.avgRisk)} score={d.avgRisk} size="sm" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </PageSection>

          {/* Pipeline */}
          <PageSection title="Acquisition pipeline" description="Where projects sit in the statutory lifecycle, and how each project type is tracking">
            <div className="grid gap-5 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader title="Projects by current stage" subtitle="Select a bar segment to list those projects" />
                <div className="px-5">
                  <ChartLegend
                    items={[
                      { label: 'In progress', color: STAGE_COLORS.inProgress },
                      { label: 'Delayed', color: STAGE_COLORS.delayed },
                      { label: 'Blocked', color: STAGE_COLORS.blocked },
                    ]}
                  />
                </div>
                <div className="h-[280px] px-2 pb-4 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s.stageDistribution.map((d) => ({ ...d, short: d.key.split(' ')[0].replace('/', '') }))} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgb(var(--c-line))" />
                      <XAxis dataKey="short" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} />
                      <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip labelFormatter={(l) => s.stageDistribution.find((d) => d.key.startsWith(String(l)))?.key ?? l} />} cursor={CHART_CURSOR} />
                      <Bar dataKey="inProgress" name="In progress" stackId="a" fill={STAGE_COLORS.inProgress} className="cursor-pointer" isAnimationActive={false} onClick={(d: { key?: string }) => d?.key && go({ stage: d.key })} />
                      <Bar dataKey="delayed" name="Delayed" stackId="a" fill={STAGE_COLORS.delayed} className="cursor-pointer" isAnimationActive={false} onClick={(d: { key?: string }) => d?.key && go({ stage: d.key, status: 'DELAYED' })} />
                      <Bar dataKey="blocked" name="Blocked" stackId="a" fill={STAGE_COLORS.blocked} radius={[3, 3, 0, 0]} className="cursor-pointer" isAnimationActive={false} onClick={(d: { key?: string }) => d?.key && go({ stage: d.key, status: 'BLOCKED' })} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader title="By project type" subtitle="Mean predicted risk — select to filter" />
                <ul className="divide-y divide-line border-t border-line">
                  {[...s.projectTypeRisk]
                    .sort((a, b) => b.avgRisk - a.avgRisk)
                    .map((d) => {
                      const band = riskFromScore(d.avgRisk);
                      return (
                        <li key={d.key}>
                          <button type="button" onClick={() => set({ projectType: d.key })} className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                            <span className="w-32 shrink-0 truncate text-sm text-ink sm:w-40">{d.key}</span>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                              <span className={cn('block h-full rounded-full', RISK_CLASS[band].bar)} style={{ width: `${d.avgRisk}%` }} />
                            </span>
                            <span className="w-10 text-right text-sm font-medium text-ink num">{d.avgRisk}%</span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </Card>
            </div>
          </PageSection>

          {/* Operations */}
          <PageSection title="Operational health" description="Compensation, litigation, rehabilitation and schedule — the work behind the risk scores">
            <Card className="grid gap-px overflow-hidden bg-line sm:grid-cols-2 xl:grid-cols-4 [&>*]:bg-surface">
              <OpsBlock title="Compensation" figure={`${s.compensation.averageCompletionPct}%`} figureLabel="mean disbursement" note={`${s.compensation.backlogProjects} projects with a backlog · ${s.compensation.projectsAtOrPastCompensation} at or past Compensation`} rows={s.compensation.buckets} />
              <OpsBlock title="Legal disputes" figure={formatCompact(s.legal.legalCases)} figureLabel="legal cases" note={`${formatCompact(s.legal.disputedParcels)} disputed parcels · ${s.legal.projectsWithEscalation} escalated`} rows={s.legal.byType.slice(0, 5).map((t) => ({ key: t.key, count: t.legalCases }))} />
              <OpsBlock title="Rehabilitation & resettlement" figure={`${s.rr.averageProgressPct}%`} figureLabel="mean delivery" note={`${formatCompact(s.rr.affectedFamilies)} affected families · ${s.rr.projectsWithRR} projects with R&R due`} rows={s.rr.buckets} />
              <OpsBlock
                title="Schedule adherence"
                figure={formatNumber(s.timeline.onTrack)}
                figureLabel="current stages on track"
                note={
                  <span className="flex flex-wrap gap-x-3">
                    <button type="button" className="link" onClick={() => go({ status: 'DELAYED' })}>
                      {s.timeline.delayed} delayed
                    </button>
                    <button type="button" className="link" onClick={() => go({ status: 'BLOCKED' })}>
                      {s.timeline.blocked} blocked
                    </button>
                  </span>
                }
                rows={s.timeline.overrunBuckets}
                rowsLabel="Forecast overrun"
              />
            </Card>
          </PageSection>

          <Card>
            <CardHeader title="Department bottlenecks" subtitle="Current-stage cases waiting on each type of office" />
            <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-line">
              <div className="relative min-w-0 overflow-x-auto">
              <table className="w-full min-w-[420px] border-t border-line">
                <thead>
                  <tr className="bg-surface-2 text-left text-xs text-ink-3">
                    <th scope="col" className="px-5 py-2 font-medium">Office type</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Projects</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Waiting now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {s.departmentBottlenecks.byRole.slice(0, 8).map((d) => (
                    <tr key={d.key}>
                      <td className="px-5 py-2.5 text-sm text-ink">
                        {d.key}
                        <span className="block text-xs text-ink-3">{formatNumber(d.openCasesPending)} open across all stages</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-ink-2 num">{d.projects}</td>
                      <td className="px-5 py-2.5 text-right text-sm font-medium text-ink num">{formatNumber(d.currentStagePending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="min-w-0 border-t border-line px-5 py-4">
                <p className="text-xs font-medium text-ink-3">Most-loaded named offices</p>
                <ol className="mt-2 space-y-2">
                  {s.departmentBottlenecks.byOffice.slice(0, 6).map((o) => (
                    <li key={o.key} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-ink-2" title={o.key}>
                        {o.key}
                      </span>
                      <span className="shrink-0 font-medium text-ink num">{formatNumber(o.openCasesPending)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function TopProjects({ rows, onOpen }: { rows: DashboardSummary['topProjects']; onOpen: (id: string) => void }) {
  if (!rows.length) return <EmptyState title="No projects to rank" description="There are no open projects in this view." />;
  return (
    <ul className="divide-y divide-line border-t border-line">
      {rows.map((p, i) => (
        <li key={p.id}>
          <button type="button" onClick={() => onOpen(p.id)} className="group flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none sm:items-center">
            <span className="mt-0.5 w-5 shrink-0 text-xs text-ink-3 num sm:mt-0">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                <span>
                  {p.district}, {p.state}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className={cn('h-1.5 w-1.5 rounded-full', STAGE_STATUS_DOT[p.stageStatus])} aria-hidden />
                  {p.stage} · {STAGE_STATUS_LABEL[p.stageStatus]}
                </span>
              </span>
              {p.topAction && <span className="mt-1 block truncate text-xs text-ink-2">Next: {p.topAction}</span>}
            </span>
            <RiskPill level={p.riskBand} score={p.riskScore} size="sm" />
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function RiskDistribution({ s, onSelect }: { s: DashboardSummary; onSelect: (band: string) => void }) {
  const total = s.riskDistribution.reduce((a, r) => a + r.projects, 0) || 1;
  const byBand = new Map(s.riskDistribution.map((r) => [r.key, r.projects]));
  const bands = [...RISK_ORDER].reverse();
  return (
    <Card>
      <CardHeader title="Risk distribution" subtitle="Projects by predicted band — select a band to list them" />
      <div className="px-5 pb-5">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={bands.map((b) => `${b}: ${byBand.get(b) ?? 0}`).join(', ')}>
          {RISK_ORDER.map((b) => (
            <span key={b} style={{ width: `${((byBand.get(b) ?? 0) / total) * 100}%`, background: RISK_HEX[b] }} className="border-r-2 border-surface last:border-r-0" />
          ))}
        </div>
        <ul className="mt-4 divide-y divide-line">
          {bands.map((b) => {
            const Icon = RISK_ICON[b];
            const projects = byBand.get(b) ?? 0;
            const cases = s.caseRiskDistribution.find((c) => c.key === b)?.cases ?? 0;
            return (
              <li key={b}>
                <button type="button" onClick={() => onSelect(b)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-2 focus-ring">
                  <Icon className={cn('h-4 w-4 shrink-0', RISK_CLASS[b].text)} aria-hidden />
                  <span className="flex-1 text-sm text-ink">{b}</span>
                  <span className="text-xs text-ink-3 num">{formatCompact(cases)} cases</span>
                  <span className="w-10 text-right text-sm font-semibold text-ink num">{projects}</span>
                  <span className="w-10 text-right text-xs text-ink-3 num">{Math.round((projects / total) * 100)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

function OpsBlock({ title, figure, figureLabel, note, rows, rowsLabel }: { title: string; figure: string; figureLabel: string; note: React.ReactNode; rows: Array<{ key: string; count: number }>; rowsLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="p-5">
      <h3 className="text-sm font-medium text-ink-2">{title}</h3>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-ink num">{figure}</span>
        <span className="text-xs text-ink-3">{figureLabel}</span>
      </p>
      <div className="mt-0.5 text-xs text-ink-3">{note}</div>
      {rowsLabel && <p className="mt-4 text-2xs text-ink-3">{rowsLabel}</p>}
      <ul className={cn('space-y-1.5', rowsLabel ? 'mt-1.5' : 'mt-4')}>
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-xs">
            <span className="w-[88px] shrink-0 truncate text-ink-3" title={r.key}>
              {r.key}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-slate-400 dark:bg-slate-500" style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="w-9 text-right text-ink-2 num">{formatNumber(r.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
