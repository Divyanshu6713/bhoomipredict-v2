import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Building2, CalendarClock, Gauge, Landmark, TrendingUp } from 'lucide-react';
import { Badge, Card, CardHeader, Select, SkeletonCard, Tabs } from '@/components/ui';
import { StatCard } from '@/components/ui/StatCard';
import { ErrorState, PrototypeNotice, RiskPill } from '@/components/ui/primitives';
import { ChartTooltip } from '@/components/charts';
import { useApi, useFilters } from '@/hooks';
import { fetchFacets, fetchPerformance, fetchTrends } from '@/api/client';
import { RISK_HEX, riskFromScore } from '@/lib/risk';
import { formatNumber } from '@/lib/format';
import type { DelayTrends, PerformanceRow } from '@/data/types';

const tick = { fill: 'rgb(var(--c-ink-3))', fontSize: 11 };
const PALETTE = ['#3B72F0', '#F59E0B', '#10B981', '#E11D48', '#7C6CF5', '#0EA5E9', '#EA580C', '#14B8A6'];
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

/**
 * Delay trends across States and districts, and the performance indicators of
 * the bodies that act on acquisitions. Observed history and model forecast are
 * drawn as separate lines that never overlap in time.
 */
export default function Trends() {
  const { values, set } = useFilters({ level: 'state', state: 'all', view: 'authority' });
  const facets = useApi((signal) => fetchFacets(signal), []);
  const level = values.level === 'district' && values.state !== 'all' ? 'district' : 'state';
  const trends = useApi((signal) => fetchTrends({ level, state: values.state, months: 18, top: 8 }, signal), [level, values.state]);
  const perf = useApi((signal) => fetchPerformance({ state: values.state }, signal), [values.state]);

  if (trends.error) return <ErrorState error={trends.error} onRetry={trends.reload} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <p className="label-xs">Delay trends</p>
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">Solid</span> lines are the observed share of milestones that slipped more than 30 days, by due month.{' '}
            <span className="font-semibold text-ink">Dashed</span> lines are the deployed model’s expected share for open milestones due in coming months. They never overlap, so the chart never shows the model “agreeing” with data it was trained on.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            className="w-[170px]"
            label="Compare"
            value={level}
            onChange={(v) => set({ level: v })}
            options={[
              { label: 'States', value: 'state' },
              { label: 'Districts of a State', value: 'district' },
            ]}
          />
          <Select className="w-[190px]" label="State" value={values.state} onChange={(v) => set({ state: v, level: v === 'all' ? 'state' : values.level })} options={[{ label: 'All in scope', value: 'all' }, ...(facets.data?.states ?? []).map((x) => ({ label: x, value: x }))]} />
        </div>
      </div>
      {values.level === 'district' && values.state === 'all' && <p className="text-[12px] text-amber-600">Choose a State to compare its districts.</p>}

      {!trends.data ? <SkeletonCard lines={8} /> : <TrendCharts data={trends.data} />}

      <PrototypeNotice compact />

      <section className="space-y-4">
        <div>
          <p className="label-xs">Performance indicators</p>
          <p className="text-[12.5px] text-ink-2">How the bodies acting on acquisitions are doing on observed delay, predicted risk, pending work and intervention closure.</p>
        </div>
        {perf.error ? (
          <ErrorState error={perf.error} onRetry={perf.reload} />
        ) : !perf.data ? (
          <SkeletonCard lines={6} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              {[
                { label: 'On track (current stage)', value: Math.round((perf.data.kpis.onTrackShare ?? 0) * 100), unit: '%', icon: Gauge, caption: `${perf.data.kpis.projects} projects`, accent: '#10B981' },
                { label: 'Observed delay rate', value: Math.round((perf.data.kpis.observedDelayRate ?? 0) * 100), unit: '%', icon: Activity, caption: 'resolved milestones > 30 days late', accent: '#F59E0B' },
                { label: 'Forecast > 6 months late', value: perf.data.kpis.severeOverrunLikely ?? 0, icon: CalendarClock, caption: `median forecast completion; ${perf.data.kpis.projectsLikelyToMissTarget} projects P(miss target) ≥ 50%`, accent: RISK_HEX.Critical },
                { label: 'Open interventions', value: perf.data.kpis.interventionsOpen, icon: TrendingUp, caption: `${perf.data.kpis.interventionsOverdue} overdue`, accent: '#3B72F0' },
                { label: 'Escalated', value: perf.data.kpis.interventionsEscalated, icon: ArrowUpRight, caption: 'overdue and moved up a level', accent: '#BE123C' },
                { label: 'Mean resolution', value: perf.data.kpis.meanResolutionDays ?? 0, unit: 'days', icon: CalendarClock, caption: `${Math.round((perf.data.kpis.interventionResolutionRate ?? 0) * 100)}% of interventions closed`, accent: '#7C6CF5' },
              ].map((c, i) => (
                <StatCard key={c.label} index={i} {...c} />
              ))}
            </div>
            <Card>
              <CardHeader
                title="League tables"
                subtitle="Sorted by mean predicted risk; resolution times come from the intervention workflow"
                icon={<Landmark className="h-4 w-4" />}
                action={
                  <Tabs
                    active={values.view}
                    onChange={(v) => set({ view: v })}
                    tabs={[
                      { id: 'authority', label: 'Acquiring authorities', count: perf.data.byAuthority.length },
                      { id: 'office', label: 'Offices', count: perf.data.byOffice.length },
                      { id: 'district', label: 'Districts', count: perf.data.byDistrict.length },
                      { id: 'state', label: 'States', count: perf.data.byState.length },
                    ]}
                  />
                }
              />
              {values.view === 'office' ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-[12px]">
                    <thead className="bg-surface-2 text-left text-[10.5px] uppercase tracking-wider text-ink-3">
                      <tr>
                        <th className="px-5 py-2">Office</th>
                        <th className="px-3 py-2">Level</th>
                        <th className="px-3 py-2 text-right">Projects</th>
                        <th className="px-3 py-2 text-right">Current-stage cases waiting</th>
                        <th className="px-3 py-2 text-right">Open actions</th>
                        <th className="px-3 py-2 text-right">Overdue</th>
                        <th className="px-5 py-2 text-right">Mean resolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {perf.data.byOffice.map((o) => (
                        <tr key={o.key} className="hover:bg-surface-2">
                          <td className="px-5 py-2">
                            <p className="font-semibold text-ink">{o.key}</p>
                            <p className="text-[10.5px] text-ink-3">{o.role}</p>
                          </td>
                          <td className="px-3 py-2 capitalize text-ink-2">{o.level.replace('_', '-')}</td>
                          <td className="px-3 py-2 text-right num">{o.projects}</td>
                          <td className="px-3 py-2 text-right font-bold num">{formatNumber(o.currentStagePending)}</td>
                          <td className="px-3 py-2 text-right num">{o.interventionsOpen}</td>
                          <td className="px-3 py-2 text-right num">{o.interventionsOverdue}</td>
                          <td className="px-5 py-2 text-right num">{o.meanResolutionDays === null ? '—' : `${o.meanResolutionDays} d`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <LeagueTable rows={values.view === 'authority' ? perf.data.byAuthority : values.view === 'district' ? perf.data.byDistrict : perf.data.byState} label={values.view === 'authority' ? 'Acquiring authority' : values.view === 'district' ? 'District' : 'State / UT'} />
              )}
            </Card>
          </>
        )}
      </section>
    </div>
  );
}

function TrendCharts({ data }: { data: DelayTrends }) {
  const rows = useMemo(
    () =>
      data.series.map((s) => {
        const row: Record<string, string | number | null> = { month: s.month.slice(2), phase: s.phase };
        for (const g of data.groups) {
          const p = s.groups[g];
          row[`${g}|obs`] = p?.observed === null || p?.observed === undefined ? null : Math.round(p.observed * 1000) / 10;
          row[`${g}|fc`] = p?.forecast === null || p?.forecast === undefined ? null : Math.round(p.forecast * 1000) / 10;
        }
        row['All|obs'] = s.overall.observed === null ? null : Math.round(s.overall.observed * 1000) / 10;
        row['All|fc'] = s.overall.forecast === null ? null : Math.round(s.overall.forecast * 1000) / 10;
        return row;
      }),
    [data],
  );
  const firstForecast = data.series.find((s) => s.phase === 'forecast')?.month.slice(2);
  const [focus, setFocus] = useState<string | null>(null);
  const shown = focus ? [focus] : data.groups;

  return (
    <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHeader
          title={`${data.level === 'district' ? `District-wise delay trend — ${data.state}` : 'State-wise delay trend'}`}
          subtitle="Share of milestones slipping > 30 days · solid = observed · dashed = model forecast · click a name to isolate it"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <div className="h-[340px] px-2 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 18, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="rgb(var(--c-line))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tick} />
              <YAxis tickLine={false} axisLine={false} tick={tick} unit="%" domain={[0, 'auto']} />
              <Tooltip content={<ChartTooltip formatter={(v, n) => `${v}%${String(n).endsWith('(forecast)') ? ' expected' : ''}`} />} />
              {firstForecast && <ReferenceLine x={firstForecast} stroke="rgb(var(--c-ink-3))" strokeDasharray="2 4" label={{ value: 'forecast →', position: 'insideTopLeft', fill: 'rgb(var(--c-ink-3))', fontSize: 10 }} />}
              {shown.map((g) => {
                const color = PALETTE[data.groups.indexOf(g) % PALETTE.length];
                return [
                  <Line key={`${g}o`} dataKey={`${g}|obs`} name={g} stroke={color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />,
                  <Line key={`${g}f`} dataKey={`${g}|fc`} name={`${g} (forecast)`} stroke={color} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} legendType="none" isAnimationActive={false} />,
                ];
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          <button onClick={() => setFocus(null)} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:border-brand/50">
            All
          </button>
          {data.groups.map((g, i) => (
            <button key={g} onClick={() => setFocus(focus === g ? null : g)} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: focus === g ? PALETTE[i % PALETTE.length] : 'rgb(var(--c-line))' }}>
              <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} /> {g}
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Direction of travel" subtitle="Observed delay rate, last 6 months vs the 6 before, and the forecast share for the next 6" icon={<Activity className="h-4 w-4" />} />
        <div className="divide-y divide-line">
          {data.summary.map((g, i) => (
            <div key={g.key} className="flex items-center gap-3 px-5 py-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-ink">{g.key}</span>
                <span className="block text-[10.5px] text-ink-3 num">
                  {pct(g.previous6MonthsRate)} → {pct(g.last6MonthsRate)} observed · {formatNumber(g.forecastOpenMilestones)} open milestones
                </span>
              </span>
              <DirectionBadge direction={g.direction} />
              <span className="w-14 text-right">
                <span className="block text-[13px] font-bold num" style={{ color: g.forecastDelayShare === null ? undefined : RISK_HEX[riskFromScore(g.forecastDelayShare * 100)] }}>
                  {pct(g.forecastDelayShare)}
                </span>
                <span className="block text-[9.5px] text-ink-3">forecast</span>
              </span>
            </div>
          ))}
        </div>
        <p className="border-t border-line px-5 py-2.5 text-[10.5px] leading-relaxed text-ink-3">{data.definitions.forecast}</p>
      </Card>
    </section>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  if (direction === 'worsening')
    return (
      <Badge className="border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400">
        <ArrowUpRight className="h-3 w-3" /> worsening
      </Badge>
    );
  if (direction === 'improving')
    return (
      <Badge className="border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <ArrowDownRight className="h-3 w-3" /> improving
      </Badge>
    );
  return (
    <Badge className="border-line bg-surface-2 text-ink-3">
      <ArrowRight className="h-3 w-3" /> {direction === 'n/a' ? 'n/a' : 'steady'}
    </Badge>
  );
}

function LeagueTable({ rows, label }: { rows: PerformanceRow[]; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-[12px]">
        <thead className="bg-surface-2 text-left text-[10.5px] uppercase tracking-wider text-ink-3">
          <tr>
            <th className="px-5 py-2">{label}</th>
            <th className="px-3 py-2 text-right">Projects</th>
            <th className="px-3 py-2">Mean risk</th>
            <th className="px-3 py-2 text-right">Observed delay</th>
            <th className="px-3 py-2 text-right">High / Critical</th>
            <th className="px-3 py-2 text-right">Delayed · blocked</th>
            <th className="px-3 py-2 text-right">Approval delay</th>
            <th className="px-3 py-2 text-right">Expected slip</th>
            <th className="px-3 py-2 text-right">Open · overdue actions</th>
            <th className="px-5 py-2 text-right">Mean resolution</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-surface-2">
              <td className="max-w-[320px] px-5 py-2">
                <Link to={`/projects?${label === 'Acquiring authority' ? `authority=${encodeURIComponent(r.key)}` : label === 'District' ? `district=${encodeURIComponent(r.key.split(', ')[0])}&state=${encodeURIComponent(r.key.split(', ')[1])}` : `state=${encodeURIComponent(r.key)}`}`} className="block truncate font-semibold text-ink hover:text-brand" title={r.key}>
                  {r.key}
                </Link>
              </td>
              <td className="px-3 py-2 text-right num">{r.projects}</td>
              <td className="px-3 py-2">
                <RiskPill level={riskFromScore(r.avgRisk)} score={r.avgRisk} size="sm" />
              </td>
              <td className="px-3 py-2 text-right num">{pct(r.observedDelayRate)}</td>
              <td className="px-3 py-2 text-right num">{r.highOrCriticalProjects}</td>
              <td className="px-3 py-2 text-right num">
                {r.delayedProjects} · {r.blockedProjects}
              </td>
              <td className="px-3 py-2 text-right num">{r.avgApprovalDelayDays === null ? '—' : `${r.avgApprovalDelayDays} d`}</td>
              <td className="px-3 py-2 text-right num">{r.avgPredictedSlipDays} d</td>
              <td className="px-3 py-2 text-right num">
                {r.interventionsOpen} · <span className={r.interventionsOverdue ? 'font-bold text-rose-600' : ''}>{r.interventionsOverdue}</span>
              </td>
              <td className="px-5 py-2 text-right num">{r.meanResolutionDays === null ? '—' : `${r.meanResolutionDays} d`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex items-center gap-1.5 border-t border-line px-5 py-2.5 text-[10.5px] text-ink-3">
        <Building2 className="h-3 w-3" /> Observed delay is on resolved milestones; mean risk is the deployed model on open ones. Resolution times fill in as interventions close.
      </p>
    </div>
  );
}
