import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, ChevronRight, Gauge, Layers, ShieldAlert, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, CardHeader, DemoDataBadge, InfoDot, SkeletonCard } from '@/components/ui';
import { ChartTooltip } from '@/components/charts';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { ContributorBars } from '@/components/explain/Contributors';
import { FilterBar, allOption, toOptions } from '@/components/ui/FilterBar';
import { CHART_COLORS, RISK_CLASS, RISK_HEX } from '@/lib/risk';
import { formatCompact, formatNumber } from '@/lib/format';
import { useApi, useFilters } from '@/hooks';
import { fetchContributors, fetchFacets, fetchModel, fetchProjects, fetchSummary } from '@/api/client';
import type { RiskLevel } from '@/data/types';

const BANDS: RiskLevel[] = ['Low', 'Medium', 'High', 'Critical'];

export default function RiskAnalysis() {
  const { values, set, reset, activeCount } = useFilters({ state: 'all', stage: 'all', risk: 'all' });

  const summary = useApi((signal) => fetchSummary(signal), []);
  const facets = useApi((signal) => fetchFacets(signal), []);
  const model = useApi((signal) => fetchModel(signal), []);
  const contributors = useApi(
    (signal) => fetchContributors({ state: values.state, stage: values.stage, risk: values.risk }, signal),
    [values.state, values.stage, values.risk],
  );
  const topProjects = useApi(
    (signal) => fetchProjects({ state: values.state, stage: values.stage, sort: 'risk', pageSize: 8 }, signal),
    [values.state, values.stage],
  );

  const s = summary.data;

  const histogram = useMemo(() => {
    if (!s) return [];
    return s.scoreHistogram.map((count, i) => {
      const from = i * 5;
      const mid = from + 2.5;
      return {
        bucket: `${from}`,
        label: `${from}–${from + 5}%`,
        count,
        band: mid >= 78 ? 'Critical' : mid >= 55 ? 'High' : mid >= 30 ? 'Medium' : 'Low',
      };
    });
  }, [s]);

  const calibration = useMemo(() => {
    const rows = (model.data?.metrics as { calibration?: Array<{ bin: string; predicted: number; observed: number; count: number }> })
      ?.calibration;
    return (rows ?? []).map((r) => ({
      bin: r.bin,
      predicted: Number((r.predicted * 100).toFixed(1)),
      observed: Number((r.observed * 100).toFixed(1)),
      count: r.count,
    }));
  }, [model.data]);

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  if (summary.loading || !s) return <SkeletonCard lines={10} />;

  const stageRows = [...s.stages].sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {[
          { label: 'Open cases scored', value: formatCompact(s.totals.openCases) },
          { label: 'Mean predicted risk', value: `${avgRisk(s)}%` },
          { label: 'Critical band', value: formatCompact(s.riskDistribution.Critical), tone: 'text-rose-600 dark:text-rose-400' },
          { label: 'High band', value: formatCompact(s.riskDistribution.High), tone: 'text-orange-600 dark:text-orange-400' },
          { label: 'Riskiest stage', value: stageRows[0]?.stage ?? '—' },
          { label: 'Leading factor', value: s.contributors[0]?.group ?? '—' },
        ].map((m, i) => (
          <Card key={m.label} className="p-4 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
            <p className="label-xs leading-tight">{m.label}</p>
            <p className={cn('mt-1.5 font-display text-[17px] font-extrabold leading-tight num', m.tone ?? 'text-ink')}>
              {m.value}
            </p>
          </Card>
        ))}
      </section>

      <Card className="animate-fade-up">
        <CardHeader
          title="Stage-level risk"
          subtitle="Predicted milestone risk for the open cases in each statutory stage, against the delay rate observed historically"
          icon={<Layers className="h-4 w-4" />}
          action={<DemoDataBadge className="hidden sm:inline-flex" />}
        />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-line">
                {['Stage', 'Milestone', 'Open cases', 'Predicted risk', 'Band mix', 'Observed delay rate', 'Avg slip', ''].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      'py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-3',
                      ['Open cases', 'Predicted risk', 'Observed delay rate', 'Avg slip'].includes(h) ? 'text-right' : 'text-left',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stageRows.map((st) => (
                <tr key={st.stage} className="border-b border-line/70 last:border-0">
                  <td className="py-3 text-[12.5px] font-bold text-ink">{st.stage}</td>
                  <td className="max-w-[260px] py-3 text-[11.5px] text-ink-3">{st.milestone}</td>
                  <td className="py-3 text-right text-[12.5px] font-semibold text-ink num">{formatNumber(st.openCases)}</td>
                  <td className="py-3 text-right">
                    <RiskPill level={st.riskBand} score={st.riskScore} size="sm" />
                  </td>
                  <td className="py-3">
                    <div className="flex h-2 min-w-[120px] overflow-hidden rounded-full bg-surface-3">
                      {BANDS.map((band) => {
                        const width = (st.mix[band] / Math.max(1, st.openCases)) * 100;
                        return width > 0 ? (
                          <span key={band} className={RISK_CLASS[band].bar} style={{ width: `${width}%` }} title={`${band}: ${st.mix[band]}`} />
                        ) : null;
                      })}
                    </div>
                  </td>
                  <td className="py-3 text-right text-[12.5px] font-semibold text-ink num">
                    {(st.observedDelayRate * 100).toFixed(0)}%
                  </td>
                  <td className="py-3 text-right text-[12.5px] text-ink-2 num">{st.avgObservedDelayDays}d</td>
                  <td className="py-3 text-right">
                    <Link
                      to={`/cases?stage=${encodeURIComponent(st.stage)}`}
                      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline"
                    >
                      cases <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-2.5 text-[11px] leading-relaxed text-ink-3">
          Compensation and Objection / Claims carry both the highest predicted risk and the highest observed slip rate —
          the model is reproducing a pattern the history already contains, not inventing one.
        </p>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <Card className="animate-fade-up">
          <CardHeader
            title="Most common predictive contributors"
            subtitle={
              contributors.data
                ? `Aggregated over ${formatNumber(contributors.data.cases)} open cases in the current scope`
                : 'Aggregating…'
            }
            icon={<Sparkles className="h-4 w-4" />}
          />
          <FilterBar
            selects={[
              {
                key: 'state',
                label: 'State',
                value: values.state,
                width: 'w-[150px]',
                options: [allOption('All states'), ...toOptions(facets.data?.states)],
              },
              {
                key: 'stage',
                label: 'Stage',
                value: values.stage,
                width: 'w-[180px]',
                options: [allOption('All stages'), ...toOptions(facets.data?.stages)],
              },
              {
                key: 'risk',
                label: 'Risk band',
                value: values.risk,
                width: 'w-[140px]',
                options: [allOption('All bands'), ...toOptions(BANDS)],
              },
            ]}
            onChange={(key, value) => set({ [key]: value })}
            onReset={reset}
            activeCount={activeCount}
          />
          <div className="px-5 py-4">
            {contributors.data && contributors.data.groups.length > 0 ? (
              <ContributorBars
                contributors={contributors.data.groups.map((g) => ({ group: g.name, value: g.value, share: g.share }))}
                max={8}
              />
            ) : (
              <p className="py-8 text-center text-[12px] text-ink-3">
                {contributors.loading ? 'Aggregating SHAP mass…' : 'No open cases in this scope.'}
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
            <CardHeader
              title="Score distribution"
              subtitle="How the model's predictions are spread across the whole corpus"
              icon={<Activity className="h-4 w-4" />}
              action={
                <InfoDot
                  text={`Band cut-offs: Medium ${Math.round(s.model.riskBands.medium * 100)}%, High ${Math.round(
                    s.model.riskBands.high * 100,
                  )}%, Critical ${Math.round(s.model.riskBands.critical * 100)}%.`}
                />
              }
            />
            <div className="h-[220px] px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogram} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))', fontSize: 9.5 }} interval={1} unit="%" />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} width={48} tickFormatter={(v) => formatCompact(v as number)} />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--c-surface-2))' }}
                    content={<ChartTooltip formatter={(v) => `${formatNumber(v as number)} cases`} labelFormatter={(l) => `${l}–${Number(l) + 5}% predicted risk`} />}
                  />
                  <Bar dataKey="count" name="Cases" radius={[3, 3, 0, 0]} animationDuration={800}>
                    {histogram.map((d, i) => (
                      <Cell key={i} fill={RISK_HEX[d.band as RiskLevel]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <CardHeader
              title="Calibration on the held-out test window"
              subtitle="Predicted probability against the delay rate actually observed in each decile"
              icon={<Gauge className="h-4 w-4" />}
            />
            <div className="h-[220px] px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calibration} margin={{ top: 8, right: 16, left: -14, bottom: 0 }}>
                  <XAxis dataKey="predicted" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))', fontSize: 10 }} unit="%" />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} unit="%" width={46} domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                  <ReferenceLine
                    segment={[
                      { x: 0, y: 0 },
                      { x: 100, y: 100 },
                    ]}
                    stroke="rgb(var(--c-line-strong))"
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="observed"
                    name="Observed delay rate"
                    stroke={CHART_COLORS.brand}
                    strokeWidth={2.4}
                    dot={{ r: 3, fill: CHART_COLORS.brand, strokeWidth: 0 }}
                    animationDuration={900}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
              Points on the dashed diagonal mean a stated 60% risk corresponded to roughly 60% of those milestones
              slipping. Brier score {s.model.test.brier.toFixed(3)}.
            </p>
          </Card>
        </div>
      </section>

      <Card className="animate-fade-up">
        <CardHeader
          title="Highest-risk projects in scope"
          subtitle="Ranked by the predicted risk of their next milestone"
          icon={<ShieldAlert className="h-4 w-4" />}
          action={
            <Link to="/queue" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
              Intervention queue <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="divide-y divide-line">
          {(topProjects.data?.projects ?? []).map((p, i) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-[12px] font-bold text-ink-2 num">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
                  <span>{p.state}</span>
                  <span>·</span>
                  <span>{p.currentStage}</span>
                  <span>·</span>
                  <span className="num">{formatNumber(p.openCases)} open</span>
                  {p.topContributor && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-ink-2">{p.topContributor}</span>
                    </>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <RiskPill level={p.riskBand} score={p.riskScore} />
                <span className="mt-1 block text-[10px] text-ink-3 num">
                  {p.daysRemaining < 0 ? `${Math.abs(p.daysRemaining)}d overdue` : `${p.daysRemaining}d to milestone`}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function avgRisk(s: { riskDistribution: Record<RiskLevel, number>; scoreHistogram: number[] }) {
  const total = s.scoreHistogram.reduce((a, b) => a + b, 0) || 1;
  const weighted = s.scoreHistogram.reduce((acc, count, i) => acc + count * (i * 5 + 2.5), 0);
  return Math.round(weighted / total);
}
