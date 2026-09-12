import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Building2,
  CalendarClock,
  ChevronRight,
  Clock,
  Gauge,
  Layers,
  ListChecks,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, CardHeader, InfoDot, Progress, SkeletonCard, Tabs } from '@/components/ui';
import { StatCard } from '@/components/ui/StatCard';
import { ErrorState, PrototypeNotice, QualityBadge, RiskPill } from '@/components/ui/primitives';
import { ChartLegend, ChartTooltip } from '@/components/charts';
import { ContributorBars, ContributorChips } from '@/components/explain/Contributors';
import { CHART_COLORS, RISK_CLASS, RISK_HEX } from '@/lib/risk';
import { formatCompact, formatDate, formatNumber } from '@/lib/format';
import { useApi, useFilters } from '@/hooks';
import { fetchQueue, fetchSummary } from '@/api/client';
import type { RiskLevel } from '@/data/types';

const RISK_ORDER: RiskLevel[] = ['Low', 'Medium', 'High', 'Critical'];

export default function Dashboard() {
  const navigate = useNavigate();
  const summary = useApi((signal) => fetchSummary(signal), []);
  const queue = useApi((signal) => fetchQueue({ pageSize: 6 }, signal), []);
  const { values, set } = useFilters({ view: 'stage' });

  const s = summary.data;

  const riskData = useMemo(
    () => (s ? RISK_ORDER.map((name) => ({ name, value: s.riskDistribution[name] })) : []),
    [s],
  );
  const riskTotal = riskData.reduce((a, r) => a + r.value, 0) || 1;

  const stageData = useMemo(
    () =>
      (s?.stages ?? []).map((st) => ({
        stage: st.stage.replace(' & ', ' &\n'),
        short: st.stage.split(' ')[0],
        risk: st.riskScore,
        open: st.openCases,
        observed: Number((st.observedDelayRate * 100).toFixed(1)),
        band: st.riskBand,
      })),
    [s],
  );

  const stateData = useMemo(
    () =>
      [...(s?.states ?? [])]
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 12)
        .map((st) => ({ state: st.state, risk: st.riskScore, open: st.openCases, band: st.riskBand })),
    [s],
  );

  const trend = useMemo(
    () =>
      (s?.months ?? []).slice(-18).map((m) => ({
        month: m.month.slice(2),
        predicted: Number((m.meanPredicted * 100).toFixed(1)),
        observed: m.observedDelayRate === null ? null : Number((m.observedDelayRate * 100).toFixed(1)),
      })),
    [s],
  );

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  if (summary.loading || !s) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={6} />
          ))}
        </div>
      </div>
    );
  }

  const t = s.totals;
  const model = s.model;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------- headline metrics */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard index={0} label="Acquisition projects" value={t.projects} icon={Building2} caption={`${t.activeProjects} active · ${t.completedProjects} in closure`} accent="#3B72F0" />
        <StatCard index={1} label="Cases tracked" value={t.cases} icon={Layers} caption={`${formatCompact(t.openCases)} open · ${formatCompact(t.observedCases)} closed out`} accent="#0EA5A4" />
        <StatCard index={2} label="High-risk cases" value={t.highRiskCases} icon={ShieldAlert} caption="High or Critical predicted risk" accent="#F97316" />
        <StatCard index={3} label="Critical cases" value={t.criticalCases} icon={TriangleAlert} caption={`above ${Math.round(model.riskBands.critical * 100)}% predicted risk`} accent="#E11D48" />
        <StatCard index={4} label="Delayed milestones" value={t.delayedMilestones} icon={Clock} caption="projects past their current stage deadline" accent="#F59E0B" />
        <StatCard index={5} label="Upcoming milestones" value={t.upcomingMilestones} icon={CalendarClock} caption="due within 90 days" accent="#7C6CF5" />
      </section>

      {/* -------------------------------------------------- secondary strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {[
          { label: 'Land under acquisition', value: `${formatCompact(t.parcelAreaHa)} ha`, hint: `${formatCompact(t.landRequirementHa)} ha sanctioned` },
          { label: 'Affected families', value: formatCompact(t.affectedFamilies), hint: 'across all recorded parcels' },
          { label: 'Cases with litigation', value: formatCompact(t.legalDisputeCases), hint: `${((t.legalDisputeCases / t.cases) * 100).toFixed(1)}% of the corpus` },
          { label: 'States · districts', value: `${t.states} · ${t.districts}`, hint: 'geographic coverage' },
          { label: 'Portfolio outlay', value: `₹${formatCompact(t.budgetCr)} Cr`, hint: 'indicative project cost' },
          { label: 'Mean data quality', value: `${s.dataQuality.meanScore}%`, hint: `${formatCompact(s.dataQuality.totalMissingCells)} field gaps audited` },
        ].map((m, i) => (
          <Card key={m.label} className="p-4 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
            <p className="label-xs leading-tight">{m.label}</p>
            <p className="mt-1.5 font-display text-[20px] font-extrabold leading-none text-ink num">{m.value}</p>
            <p className="mt-1 text-[10.5px] leading-tight text-ink-3">{m.hint}</p>
          </Card>
        ))}
      </section>

      {/* ---------------------------------------------------------- row one */}
      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="animate-fade-up">
          <CardHeader
            title="Predicted risk distribution"
            subtitle={`${formatNumber(t.openCases)} open cases banded by the deployed model`}
            icon={<Gauge className="h-4 w-4" />}
            action={
              <InfoDot
                text={`Bands are calibrated probability cut-offs: Medium ${Math.round(model.riskBands.medium * 100)}%, High ${Math.round(
                  model.riskBands.high * 100,
                )}%, Critical ${Math.round(model.riskBands.critical * 100)}%.`}
              />
            }
          />
          <div className="px-5 pb-5">
            <div className="relative h-[214px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={3}
                    startAngle={90}
                    endAngle={-270}
                    animationDuration={900}
                    stroke="none"
                  >
                    {riskData.map((d) => (
                      <Cell key={d.name} fill={RISK_HEX[d.name]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatter={(v) => `${formatNumber(v as number)} cases`} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="font-display text-[26px] font-extrabold leading-none text-ink num">
                    {formatCompact(riskTotal)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-ink-3">open cases</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {riskData.map((d) => (
                <Link
                  key={d.name}
                  to={`/cases?risk=${d.name}`}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 transition-colors hover:border-line-strong"
                >
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: RISK_HEX[d.name] }} />
                  <span className="text-[11.5px] font-medium text-ink-2">{d.name}</span>
                  <span className="ml-auto text-[12px] font-bold text-ink num">{formatCompact(d.value)}</span>
                  <span className="text-[10.5px] text-ink-3 num">{((d.value / riskTotal) * 100).toFixed(0)}%</span>
                </Link>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
              <p className="label-xs">Projects by next-milestone risk</p>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
                {RISK_ORDER.map((band) => {
                  const value = s.projectRiskDistribution[band] ?? 0;
                  const width = (value / Math.max(1, t.projects)) * 100;
                  return width > 0 ? (
                    <span key={band} style={{ width: `${width}%`, background: RISK_HEX[band] }} title={`${band}: ${value}`} />
                  ) : null;
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {RISK_ORDER.map((band) => (
                  <span key={band} className="text-[10.5px] text-ink-3">
                    <span className={cn('font-bold num', RISK_CLASS[band].text)}>{s.projectRiskDistribution[band] ?? 0}</span>{' '}
                    {band}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <CardHeader
            title={values.view === 'stage' ? 'Risk by acquisition stage' : 'Risk by state'}
            subtitle={
              values.view === 'stage'
                ? 'Mean predicted milestone risk of the open cases in each stage, against the historically observed delay rate'
                : 'Top 12 states by predicted risk of their open cases'
            }
            icon={<ShieldAlert className="h-4 w-4" />}
            action={
              <Tabs
                tabs={[
                  { id: 'stage', label: 'By stage' },
                  { id: 'state', label: 'By state' },
                ]}
                active={values.view}
                onChange={(v) => set({ view: v })}
              />
            }
          />
          <div className="h-[318px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              {values.view === 'stage' ? (
                <ComposedChart data={stageData} margin={{ top: 8, right: 16, left: -18, bottom: 4 }}>
                  <XAxis
                    dataKey="short"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'rgb(var(--c-ink-3))', fontSize: 10.5 }}
                    interval={0}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} unit="%" width={46} domain={[0, 100]} />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--c-surface-2))' }}
                    content={
                      <ChartTooltip
                        formatter={(v, name) => (name === 'Open cases' ? formatNumber(v as number) : `${v}%`)}
                        labelFormatter={(l) => stageData.find((d) => d.short === l)?.stage.replace('\n', ' ') ?? l}
                      />
                    }
                  />
                  <Bar dataKey="risk" name="Predicted risk" radius={[5, 5, 0, 0]} animationDuration={900} barSize={26}>
                    {stageData.map((d, i) => (
                      <Cell key={i} fill={RISK_HEX[d.band]} />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="observed"
                    name="Observed delay rate"
                    stroke={CHART_COLORS.violet}
                    strokeWidth={2.2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: CHART_COLORS.violet, strokeWidth: 0 }}
                    animationDuration={1100}
                  />
                </ComposedChart>
              ) : (
                <BarChart data={stateData} layout="vertical" margin={{ top: 4, right: 30, left: 96, bottom: 0 }}>
                  <XAxis type="number" hide domain={[0, 100]} />
                  <YAxis
                    type="category"
                    dataKey="state"
                    tickLine={false}
                    axisLine={false}
                    width={92}
                    tick={{ fill: 'rgb(var(--c-ink-2))', fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--c-surface-2))' }}
                    content={<ChartTooltip formatter={(v, name) => (name === 'Open cases' ? formatNumber(v as number) : `${v}%`)} />}
                  />
                  <Bar dataKey="risk" name="Predicted risk" radius={[0, 5, 5, 0]} barSize={15} animationDuration={900}>
                    {stateData.map((d, i) => (
                      <Cell key={i} fill={RISK_HEX[d.band]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
            The dashed series is the delay rate actually observed on closed milestones in the same stage — the model is
            calibrated against it, not fitted to it.
          </p>
        </Card>
      </section>

      {/* ---------------------------------------------------------- row two */}
      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="animate-fade-up">
          <CardHeader
            title="Top cases requiring attention"
            subtitle="Highest-ranked project-stage cells from the intervention queue"
            icon={<ListChecks className="h-4 w-4" />}
            action={
              <Link to="/queue" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
                Full queue <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {queue.error ? (
            <div className="p-5">
              <ErrorState error={queue.error} onRetry={queue.reload} title="Queue unavailable" />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {(queue.data?.items ?? []).map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/projects/${item.projectId}`)}
                  className="flex w-full items-start gap-4 px-5 py-3.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-[12px] font-bold text-ink-2 num">
                    {item.priorityRank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{item.projectName}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
                      <span className="font-semibold text-ink-2">{item.stage}</span>
                      <span>·</span>
                      <span>{item.state}</span>
                      <span>·</span>
                      <span className="num">{formatNumber(item.openCases)} open cases</span>
                      {item.overdueCases > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-rose-500 num">{formatNumber(item.overdueCases)} overdue</span>
                        </>
                      )}
                    </span>
                    <ContributorChips contributors={item.contributors} className="mt-1.5" />
                  </span>
                  <span className="shrink-0 text-right">
                    <RiskPill level={item.riskBand} score={item.riskScore} />
                    <span className="mt-1.5 block text-[10.5px] text-ink-3">
                      due {item.milestoneDeadline ? formatDate(item.milestoneDeadline) : '—'}
                    </span>
                  </span>
                </button>
              ))}
              {queue.loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-5 py-4">
                    <Progress value={40} />
                  </div>
                ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
            <CardHeader
              title="Most common predictive contributors"
              subtitle="Aggregated SHAP mass across every open case"
              icon={<ShieldAlert className="h-4 w-4" />}
            />
            <div className="px-5 pb-5">
              <ContributorBars
                contributors={s.contributors.map((c) => ({ group: c.group, value: c.value, share: c.share }))}
                max={6}
              />
            </div>
          </Card>

          <Card className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <CardHeader title="Model in production" subtitle="Held-out test window" icon={<Gauge className="h-4 w-4" />} />
            <div className="grid grid-cols-2 gap-2.5 px-5 pb-5">
              {[
                ['ROC-AUC', model.test.rocAuc.toFixed(3)],
                ['PR-AUC', model.test.prAuc.toFixed(3)],
                ['Precision', model.test.at_threshold.precision.toFixed(3)],
                ['Recall', model.test.at_threshold.recall.toFixed(3)],
                ['F1', model.test.at_threshold.f1.toFixed(3)],
                ['Brier', model.test.brier.toFixed(3)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                  <p className="label-xs">{label}</p>
                  <p className="mt-1 font-display text-[17px] font-extrabold leading-none text-ink num">{value}</p>
                </div>
              ))}
              <div className="col-span-2 mt-1 flex flex-wrap items-center gap-2">
                <QualityBadge score={s.dataQuality.meanScore} />
                <Link to="/data" className="text-[11.5px] font-semibold text-brand hover:underline">
                  Model card and dataset →
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* -------------------------------------------------------- row three */}
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="animate-fade-up">
          <CardHeader
            title="Predicted versus observed, by month"
            subtitle="Mean predicted risk of cases assessed each month against the delay rate later observed"
            icon={<CalendarClock className="h-4 w-4" />}
            action={
              <ChartLegend
                items={[
                  { label: 'Mean predicted risk', color: CHART_COLORS.brand },
                  { label: 'Observed delay rate', color: CHART_COLORS.saffron },
                ]}
              />
            }
          />
          <div className="h-[268px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))', fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} unit="%" width={44} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={{ stroke: 'rgb(var(--c-line-strong))' }} />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="Mean predicted risk"
                  stroke={CHART_COLORS.brand}
                  strokeWidth={2.4}
                  dot={false}
                  animationDuration={1000}
                />
                <Line
                  type="monotone"
                  dataKey="observed"
                  name="Observed delay rate"
                  stroke={CHART_COLORS.saffron}
                  strokeWidth={2.2}
                  strokeDasharray="5 4"
                  dot={{ r: 2.5, fill: CHART_COLORS.saffron, strokeWidth: 0 }}
                  connectNulls={false}
                  animationDuration={1200}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
            The observed series stops where milestones are still inside their window — those cases carry a prediction
            and no outcome yet.
          </p>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <CardHeader
            title="Stage pipeline"
            subtitle="Where the open book sits, and how each stage has historically performed"
            icon={<Layers className="h-4 w-4" />}
            action={
              <Link to="/risk" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
                Stage risk detail <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {s.stages.map((st) => (
              <Link
                key={st.stage}
                to={`/cases?stage=${encodeURIComponent(st.stage)}`}
                className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{st.stage}</span>
                  <span className="block truncate text-[10.5px] text-ink-3">{st.milestone}</span>
                </span>
                <span className="hidden w-24 shrink-0 sm:block">
                  <span className="flex items-baseline justify-between">
                    <span className="text-[10px] text-ink-3">open</span>
                    <span className="text-[11px] font-bold text-ink num">{formatCompact(st.openCases)}</span>
                  </span>
                  <Progress
                    value={(st.openCases / Math.max(...s.stages.map((x) => x.openCases))) * 100}
                    className="mt-1 h-1"
                    barClassName="bg-brand"
                  />
                </span>
                <span className="shrink-0 text-right">
                  <span className={cn('block text-[13px] font-extrabold num', RISK_CLASS[st.riskBand].text)}>
                    {st.riskScore}%
                  </span>
                  <span className="block text-[10px] text-ink-3 num">
                    {(st.observedDelayRate * 100).toFixed(0)}% observed
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      {/* ------------------------------------------------------------ notice */}
      <PrototypeNotice />
    </div>
  );
}
