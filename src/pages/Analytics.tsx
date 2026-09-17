import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { BarChart3, ChevronRight, Layers, Table2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, CardHeader, DemoDataBadge, MetricStrip, PageSkeleton, Tabs } from '@/components/ui';
import { ChartTooltip, ChartLegend } from '@/components/charts';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { AXIS_TICK, CHART_COLORS, RISK_HEX, riskFromScore, shortStage } from '@/lib/risk';
import { formatCompact, formatNumber } from '@/lib/format';
import { useApi, useFilters } from '@/hooks';
import { fetchBreakdown, fetchProjects, fetchSummary } from '@/api/client';

const DIMENSIONS: Array<{ id: string; label: string }> = [
  { id: 'stage', label: 'Stage' },
  { id: 'state', label: 'State' },
  { id: 'district', label: 'District' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'compensation', label: 'Compensation' },
  { id: 'landType', label: 'Land type' },
  { id: 'projectType', label: 'Project type' },
  { id: 'authority', label: 'Authority' },
  { id: 'verification', label: 'Verification' },
  { id: 'dispute', label: 'Dispute complexity' },
];

export default function Analytics() {
  const { values, set } = useFilters({ by: 'state', scope: 'open' });

  const summary = useApi((signal) => fetchSummary(signal), []);
  const breakdown = useApi(
    (signal) => fetchBreakdown({ by: values.by, status: values.scope }, signal),
    [values.by, values.scope],
  );
  const projects = useApi((signal) => fetchProjects({ sort: 'highRisk', pageSize: 100 }, signal), []);

  const s = summary.data;

  const rows = useMemo(() => {
    const data = breakdown.data?.rows ?? [];
    return [...data].sort((a, b) => b.cases - a.cases).slice(0, 16);
  }, [breakdown.data]);

  const scatter = useMemo(
    () =>
      (projects.data?.projects ?? []).map((p) => ({
        x: p.legalCases,
        y: p.riskScore,
        z: p.totalParcels,
        name: p.name,
        band: p.riskBand,
      })),
    [projects.data],
  );

  const throughput = useMemo(
    () =>
      (s?.stages ?? []).map((st) => ({
        stage: st.stage.split(' ')[0],
        full: st.stage,
        median: st.medianStageDays,
        slip: Number((st.observedDelayRate * 100).toFixed(1)),
        avgDelay: st.avgObservedDelayDays,
        cases: st.cases,
      })),
    [s],
  );

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  if (summary.loading || !s) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Portfolio breakdown"
          subtitle="Any dimension of the corpus, aggregated server-side across all 350,000 records"
          icon={<Table2 className="h-4 w-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Tabs
                tabs={[
                  { id: 'open', label: 'Open cases' },
                  { id: 'observed', label: 'Closed milestones' },
                  { id: 'all', label: 'All records' },
                ]}
                active={values.scope}
                onChange={(v) => set({ scope: v })}
              />
              <DemoDataBadge className="hidden lg:inline-flex" />
            </div>
          }
        />
        <div className="border-b border-line px-5 pb-4">
          <p className="label-xs mb-2">Group by</p>
          <div className="flex flex-wrap gap-1.5">
            {DIMENSIONS.map((d) => (
              <button
                key={d.id}
                onClick={() => set({ by: d.id })}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  values.by === d.id
                    ? 'border-brand/45 bg-brand/[0.08] text-brand'
                    : 'border-line bg-surface-2 text-ink-2 hover:border-line-strong',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 px-5 py-4 xl:grid-cols-[1.1fr_1fr]">
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, left: 120, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="key"
                  tickLine={false}
                  axisLine={false}
                  width={118}
                  tick={{ fill: 'rgb(var(--c-ink-2))', fontSize: 10.5 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgb(var(--c-surface-2))' }}
                  content={<ChartTooltip formatter={(v) => formatNumber(v as number)} />}
                />
                <Bar dataKey="cases" name="Cases" radius={[0, 5, 5, 0]} barSize={14} animationDuration={800}>
                  {rows.map((r, i) => (
                    <Cell key={i} fill={RISK_HEX[riskFromScore(r.riskScore)]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[440px]">
              <thead>
                <tr className="border-b border-line">
                  {['Group', 'Cases', 'Risk', 'High risk', 'Observed delay'].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'py-2.5 text-xs font-medium text-ink-3',
                        i === 0 ? 'text-left' : 'text-right',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-line/70 last:border-0">
                    <td className="max-w-[180px] truncate py-2.5 text-sm font-semibold text-ink">{r.key}</td>
                    <td className="py-2.5 text-right text-sm text-ink-2 num">{formatNumber(r.cases)}</td>
                    <td className="py-2.5 text-right">
                      <RiskPill level={riskFromScore(r.riskScore)} score={r.riskScore} size="sm" />
                    </td>
                    <td className="py-2.5 text-right text-sm font-semibold text-orange-700 dark:text-orange-300 num">
                      {formatNumber(r.highRisk)}
                    </td>
                    <td className="py-2.5 text-right text-sm text-ink-2 num">
                      {r.observedDelayRate === null ? '—' : `${(r.observedDelayRate * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {breakdown.loading && <p className="py-6 text-center text-xs text-ink-3">Aggregating…</p>}
          </div>
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader
            title="Stage throughput and slip"
            subtitle="Median allowed duration per stage against the share of milestones that slipped"
            icon={<Layers className="h-4 w-4" />}
            action={
              <ChartLegend
                items={[
                  { label: 'Median stage days', color: CHART_COLORS.brand },
                  { label: 'Observed slip rate', color: CHART_COLORS.saffron },
                ]}
              />
            }
          />
          <div className="h-[300px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={throughput} margin={{ top: 8, right: 18, left: -16, bottom: 4 }}>
                <XAxis dataKey="stage" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} tickFormatter={shortStage} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} width={42} unit="d" />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} width={40} unit="%" domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: 'rgb(var(--c-surface-2))' }}
                  content={
                    <ChartTooltip
                      labelFormatter={(l) => throughput.find((t) => t.stage === l)?.full ?? l}
                      formatter={(v, name) => (name === 'Observed slip rate' ? `${v}%` : `${v} days`)}
                    />
                  }
                />
                <Bar yAxisId="left" dataKey="median" name="Median stage days" radius={[5, 5, 0, 0]} fill={CHART_COLORS.brand} barSize={22} animationDuration={800} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="slip"
                  name="Observed slip rate"
                  stroke={CHART_COLORS.saffron}
                  strokeWidth={2.4}
                  dot={{ r: 3, fill: CHART_COLORS.saffron, strokeWidth: 0 }}
                  animationDuration={1000}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="border-t border-line px-5 py-2.5 text-xs text-ink-3">
            Compensation and R&amp;R are both the longest stages and the ones most likely to slip — length and fragility
            compound rather than offset.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Litigation load against predicted risk"
            subtitle="One point per project; bubble size is its parcel count"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <div className="h-[300px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 20, left: -14, bottom: 4 }}>
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Open legal cases"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'rgb(var(--c-ink-3))' }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Predicted risk"
                  unit="%"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'rgb(var(--c-ink-3))' }}
                  width={44}
                  domain={[0, 100]}
                />
                <ZAxis type="number" dataKey="z" range={[25, 260]} />
                <Tooltip
                  content={
                    <ChartTooltip
                      formatter={(v, name) => (name === 'Predicted risk' ? `${v}%` : formatNumber(v as number))}
                    />
                  }
                />
                <Scatter name="Projects" data={scatter} animationDuration={900}>
                  {scatter.map((d, i) => (
                    <Cell key={i} fill={RISK_HEX[d.band]} fillOpacity={0.62} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="border-t border-line px-5 py-2.5 text-xs text-ink-3">
            Litigation load and predicted risk move together, but the spread is wide: projects with the same case count
            land in different bands once compensation progress, documentation and inactivity are taken into account.
          </p>
        </Card>
      </section>

      <Card>
        <CardHeader
          title="Project comparison"
          subtitle="Highest concentrations of high-risk cases, with lifecycle position"
          icon={<BarChart3 className="h-4 w-4" />}
          action={
            <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              Full registry <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="relative overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-line">
                {['Project', 'State', 'Stage', 'Parcels', 'Open', 'High risk', 'Compensation', 'Risk'].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      'py-2.5 text-xs font-medium text-ink-3',
                      i < 3 ? 'text-left' : 'text-right',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(projects.data?.projects ?? []).slice(0, 12).map((p) => (
                <tr key={p.id} className="border-b border-line/70 last:border-0">
                  <td className="max-w-[240px] truncate py-2.5">
                    <Link to={`/projects/${p.id}`} className="text-sm font-semibold text-ink hover:text-brand">
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2.5 text-xs text-ink-2">{p.state}</td>
                  <td className="py-2.5 text-xs text-ink-2">{p.currentStage}</td>
                  <td className="py-2.5 text-right text-xs text-ink-2 num">{formatNumber(p.totalParcels)}</td>
                  <td className="py-2.5 text-right text-xs text-ink-2 num">{formatNumber(p.openCases)}</td>
                  <td className="py-2.5 text-right text-xs font-semibold text-orange-700 dark:text-orange-300 num">
                    {formatNumber(p.highRiskCases)}
                  </td>
                  <td className="py-2.5 text-right text-xs text-ink-2 num">{p.compensationCompletionPct.toFixed(0)}%</td>
                  <td className="py-2.5 text-right">
                    <RiskPill level={p.riskBand} score={p.riskScore} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <MetricStrip
        items={[
          { label: 'States covered', value: formatNumber(s.totals.states) },
          { label: 'Districts covered', value: formatNumber(s.totals.districts) },
          { label: 'Closed milestones analysed', value: formatCompact(s.totals.observedCases) },
          { label: 'Assessment months spanned', value: formatNumber(s.months.length) },
        ]}
      />
    </div>
  );
}
