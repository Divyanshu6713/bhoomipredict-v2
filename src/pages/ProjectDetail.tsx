import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowLeft,
  BadgeIndianRupee,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Gavel,
  Globe2,
  Layers,
  MapPin,
  ShieldAlert,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, EmptyState, InfoDot, Progress, SkeletonCard } from '@/components/ui';
import { ErrorState, KeyValue, QualityBadge, RiskPill } from '@/components/ui/primitives';
import { ChartTooltip, RiskGauge } from '@/components/charts';
import { ContributorBars, ContributorChips } from '@/components/explain/Contributors';
import { StageTimeline } from '@/components/lifecycle/StageTimeline';
import { IndiaGeoMap, GeoLegend } from '@/components/gis/IndiaGeoMap';
import { ServerTable, type ServerColumn } from '@/components/ui/ServerTable';
import { PRIORITY_CLASS, RISK_CLASS, RISK_HEX, STAGE_STATUS_CLASS } from '@/lib/risk';
import { formatCompact, formatCrore, formatDate, formatNumber } from '@/lib/format';
import { useApi } from '@/hooks';
import { fetchMapPoints, fetchProject, fetchProjectCases } from '@/api/client';
import type { CaseRow, RiskLevel } from '@/data/types';

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [casePage, setCasePage] = useState(1);

  const detail = useApi((signal) => fetchProject(id, signal), [id]);
  const project = detail.data?.project;

  const caseQuery = useMemo(
    () => ({
      page: casePage,
      pageSize: 10,
      sort: 'risk',
      stage: stageIndex !== null && project ? project.stages[stageIndex].name : undefined,
    }),
    [casePage, stageIndex, project],
  );
  const cases = useApi(
    (signal) => (id ? fetchProjectCases(id, caseQuery, signal) : Promise.resolve(null)),
    [id, JSON.stringify(caseQuery)],
  );

  const points = useApi(
    (signal) => (id ? fetchMapPoints({ projectId: id, limit: 1200 }, signal) : Promise.resolve(null)),
    [id],
  );

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} title="Could not load this project" />;
  if (detail.loading || !detail.data || !project) return <SkeletonCard lines={12} />;

  const { stageRisk, riskHistory, intervention, contributors, topCases } = detail.data;
  const current = project.stages[project.currentStageIndex];
  const selected = stageIndex !== null ? project.stages[stageIndex] : current;
  const selectedRisk = stageRisk[selected.index];

  const stageChart = stageRisk.map((r) => ({
    stage: r.stage.split(' ')[0],
    full: r.stage,
    risk: r.riskScore ?? 0,
    open: r.openCases,
    band: r.band ?? 'Low',
    hasRisk: r.riskScore !== null,
  }));

  const historyChart = riskHistory.map((h) => ({ month: h.month.slice(2), risk: h.riskScore }));

  const caseColumns: ServerColumn<CaseRow>[] = [
    {
      key: 'id',
      header: 'Case',
      render: (c) => (
        <div>
          <p className="font-mono text-[11.5px] font-semibold text-ink">{c.caseId}</p>
          <p className="text-[11px] text-ink-3">
            {c.village}, {c.district}
          </p>
        </div>
      ),
    },
    { key: 'stage', header: 'Stage', render: (c) => <span className="text-[12px]">{c.stage}</span> },
    { key: 'area', header: 'Area', align: 'right', sortKey: 'area', render: (c) => <span className="num">{c.areaHa} ha</span> },
    { key: 'own', header: 'Ownership', render: (c) => <Badge className="border-line bg-surface-2 text-ink-2">{c.ownership}</Badge> },
    {
      key: 'comp',
      header: 'Compensation',
      sortKey: 'compensation',
      align: 'right',
      render: (c) => (
        <div>
          <span className="num text-[12px] font-semibold">{c.compensationCompletionPct}%</span>
          <p className="truncate text-[10.5px] text-ink-3">{c.compensationStatus}</p>
        </div>
      ),
    },
    {
      key: 'legal',
      header: 'Legal',
      sortKey: 'legal',
      align: 'right',
      render: (c) => (
        <span className={cn('num text-[12px] font-semibold', c.legalCases > 0 && 'text-rose-600 dark:text-rose-400')}>
          {c.legalCases}
        </span>
      ),
    },
    {
      key: 'inactivity',
      header: 'Inactive',
      sortKey: 'inactivity',
      align: 'right',
      render: (c) => <span className="num text-[12px]">{c.inactivityDays}d</span>,
    },
    {
      key: 'due',
      header: 'Milestone due',
      sortKey: 'deadline',
      align: 'right',
      render: (c) => (
        <div>
          <span className="text-[11.5px] num">{formatDate(c.milestoneDueDate)}</span>
          <p
            className={cn(
              'text-[10.5px] num',
              c.daysToMilestone < 0 ? 'font-semibold text-rose-500' : 'text-ink-3',
            )}
          >
            {c.daysToMilestone < 0 ? `${Math.abs(c.daysToMilestone)}d overdue` : `${c.daysToMilestone}d left`}
          </p>
        </div>
      ),
    },
    { key: 'risk', header: 'Risk', sortKey: 'risk', align: 'right', render: (c) => <RiskPill level={c.riskBand} score={c.riskScore} /> },
  ];

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ header */}
      <Card className="animate-fade-up overflow-hidden">
        <div className="border-b border-line bg-navy-900 px-5 py-5 grid-lines">
          <button
            onClick={() => navigate(-1)}
            className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/50 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11.5px] font-semibold text-white/40">{project.id}</span>
                <Badge className="border-white/15 bg-white/10 text-white/70">{project.type}</Badge>
                <Badge className={PRIORITY_CLASS[project.priority]}>{project.priority}</Badge>
                <Badge className={STAGE_STATUS_CLASS[current.status]}>
                  {current.status === 'Delayed' ? `Milestone ${Math.abs(current.daysRemaining)}d overdue` : current.status}
                </Badge>
              </div>
              <h2 className="mt-2 font-display text-[22px] font-extrabold leading-tight tracking-tight text-white sm:text-[26px]">
                {project.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/50">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {project.state} · {project.districts.join(', ')}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> {project.authority}
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> Sanctioned {formatDate(project.startDate)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-stretch gap-3">
              <div
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: `${RISK_HEX[project.riskBand]}55`, background: `${RISK_HEX[project.riskBand]}1a` }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Predicted risk — next milestone
                </p>
                <p
                  className="mt-1 font-display text-[30px] font-extrabold leading-none num"
                  style={{ color: RISK_HEX[project.riskBand] }}
                >
                  {project.riskScore}%
                </p>
                <p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: RISK_HEX[project.riskBand] }}>
                  {project.riskBand} risk
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Current stage</p>
                <p className="mt-1 font-display text-[15px] font-extrabold leading-tight text-white">{current.name}</p>
                <p className="mt-1 text-[10.5px] text-white/50">
                  due {formatDate(current.expectedCompletion)} ·{' '}
                  {current.daysRemaining < 0 ? `${Math.abs(current.daysRemaining)}d overdue` : `${current.daysRemaining}d left`}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12.5px] font-semibold text-ink">Lifecycle progress</p>
            <p className="text-[12.5px] text-ink-3">
              stage <span className="font-bold text-ink num">{project.currentStageIndex + 1}</span> of 9 ·{' '}
              <span className="font-bold text-ink num">{project.progressPct.toFixed(1)}%</span> ·{' '}
              <span className="num">{formatNumber(project.openCases)}</span> of{' '}
              <span className="num">{formatNumber(project.totalParcels)}</span> parcels still open
            </p>
          </div>
          <Progress
            value={project.progressPct}
            className="mt-2 h-2.5"
            barClassName={project.progressPct > 70 ? 'bg-emerald-500' : project.progressPct > 40 ? 'bg-brand' : 'bg-amber-500'}
          />
        </div>

        <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[
            { label: 'Land sanctioned', value: `${formatCompact(project.landRequirementHa)} ha`, icon: Layers },
            { label: 'Total parcels', value: formatNumber(project.totalParcels), icon: Layers },
            { label: 'Affected families', value: formatNumber(project.affectedFamilies), icon: Users },
            { label: 'Compensation', value: `${project.compensationCompletionPct.toFixed(0)}%`, hint: project.compensationStatus, icon: BadgeIndianRupee },
            { label: 'Possession', value: project.possessionStatus, icon: ClipboardCheck },
            { label: 'R&R status', value: project.rrStatus, hint: `${formatNumber(project.rrCases)} cases`, icon: Users },
            { label: 'Open legal cases', value: formatNumber(project.legalCases), hint: `${formatNumber(project.legalDisputeParcels)} parcels`, icon: Gavel },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center gap-2">
                <m.icon className="h-3.5 w-3.5 text-ink-3" />
                <p className="label-xs">{m.label}</p>
              </div>
              <p className="mt-2 font-display text-[16px] font-extrabold leading-tight text-ink num">{m.value}</p>
              {m.hint && <p className="mt-0.5 text-[10.5px] text-ink-3">{m.hint}</p>}
            </div>
          ))}
        </div>
      </Card>

      {/* --------------------------------------------------------- lifecycle */}
      <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
        <CardHeader
          title="Acquisition lifecycle"
          subtitle="Nine statutory stages with their working deadlines and the model's risk for the open cases in each"
          icon={<CalendarClock className="h-4 w-4" />}
          action={
            <div className="flex flex-wrap items-center gap-3">
              {(['Completed', 'In Progress', 'Delayed', 'Pending'] as const).map((st) => (
                <span key={st} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      st === 'Completed' ? 'bg-emerald-500' : st === 'In Progress' ? 'bg-brand' : st === 'Delayed' ? 'bg-rose-500' : 'bg-line',
                    )}
                  />
                  <span className="text-[11px] font-medium text-ink-2">{st}</span>
                </span>
              ))}
            </div>
          }
        />
        <StageTimeline
          stages={project.stages}
          risk={stageRisk}
          currentIndex={project.currentStageIndex}
          selectedIndex={stageIndex ?? undefined}
          onSelect={(i) => {
            setStageIndex(i === stageIndex ? null : i);
            setCasePage(1);
          }}
        />
        <div className="border-t border-line bg-surface-2 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-xl">
              <p className="label-xs">
                {stageIndex === null ? 'Current stage' : 'Selected stage'} · {selected.name}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-ink">{selected.milestone}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
                {selected.status === 'Completed'
                  ? `Closed on ${formatDate(selected.actualCompletion ?? selected.expectedCompletion)}${
                      selected.slipDays > 0 ? `, ${selected.slipDays} days beyond its working deadline.` : ', within its working deadline.'
                    }`
                  : selected.status === 'Pending'
                    ? `Not yet started. Planned to run ${selected.plannedDays} days from ${formatDate(selected.plannedStart)}.`
                    : `Running since ${formatDate(selected.actualStart ?? selected.plannedStart)} — ${selected.daysElapsed} of ${
                        selected.plannedDays
                      } planned days used, deadline ${formatDate(selected.expectedCompletion)}.`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
                <p className="label-xs">Open cases</p>
                <p className="mt-1 font-display text-[17px] font-extrabold text-ink num">{formatNumber(selectedRisk?.openCases ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
                <p className="label-xs">Stage risk</p>
                <p
                  className={cn(
                    'mt-1 font-display text-[17px] font-extrabold num',
                    selectedRisk?.band ? RISK_CLASS[selectedRisk.band].text : 'text-ink-3',
                  )}
                >
                  {selectedRisk?.riskScore !== null && selectedRisk?.riskScore !== undefined ? `${selectedRisk.riskScore}%` : '—'}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
                <p className="label-xs">Baseline date</p>
                <p className="mt-1 text-[12.5px] font-bold text-ink num">{formatDate(selected.baselineCompletion)}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
                <p className="label-xs">Working deadline</p>
                <p className="mt-1 text-[12.5px] font-bold text-ink num">{formatDate(selected.expectedCompletion)}</p>
              </div>
            </div>
          </div>
          {selectedRisk?.basis === 'no-open-cases' && (
            <p className="mt-3 text-[11px] text-ink-3">
              No open cases sit in this stage, so there is no live prediction for it — the platform does not invent one.
            </p>
          )}
          {selected.status === 'Completed' && (selectedRisk?.openCases ?? 0) > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              The project has moved past this stage, but {formatNumber(selectedRisk?.openCases ?? 0)} parcels are still
              sitting in it. Stragglers like these are scored on their own milestone, not the project's.
            </p>
          )}
        </div>
      </Card>

      {/* --------------------------------------------- risk + explanation */}
      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="animate-fade-up">
          <CardHeader
            title="Next-milestone risk"
            subtitle={`${selected.name} stage`}
            icon={<ShieldAlert className="h-4 w-4" />}
            action={<InfoDot text="Probability that this stage's next milestone is missed by more than 30 days, averaged over its open cases." />}
          />
          <div className="grid place-items-center px-5 pb-5">
            <RiskGauge
              score={selectedRisk?.riskScore ?? project.riskScore}
              label={(selectedRisk?.band ?? project.riskBand) as string}
              sublabel={`${formatNumber(selectedRisk?.openCases ?? project.openCases)} open cases scored`}
              color={RISK_HEX[(selectedRisk?.band ?? project.riskBand) as RiskLevel]}
            />
            <p className="mt-4 text-center text-[12.5px] leading-relaxed text-ink-2">
              There is a{' '}
              <span className="font-bold text-ink num">{selectedRisk?.riskScore ?? project.riskScore}%</span> predicted
              probability that the <span className="font-semibold text-ink">{selected.name}</span> stage misses its next
              milestone by more than 30 days.
            </p>
            <div className="mt-4 grid w-full grid-cols-4 gap-2">
              {(['Low', 'Medium', 'High', 'Critical'] as RiskLevel[]).map((band, i) => (
                <div key={band} className="rounded-lg border border-line bg-surface-2 p-2 text-center">
                  <p className="text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: RISK_HEX[band] }}>
                    {band}
                  </p>
                  <p className="font-display text-[15px] font-extrabold text-ink num">
                    {formatCompact((selectedRisk?.mix?.[i] ?? 0) as number)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 w-full">
              <QualityBadge score={project.dataQuality} />
            </div>
          </div>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <CardHeader
            title="Why is this project at risk?"
            subtitle="Top predictive contributors across the open book"
            icon={<Sparkles className="h-4 w-4" />}
          />
          <div className="px-5 pb-5">
            {contributors.length === 0 ? (
              <EmptyState title="No contributions recorded" description="This project has no open cases to explain." />
            ) : (
              <ContributorBars contributors={contributors} max={6} />
            )}
          </div>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '120ms' }}>
          <CardHeader title="Recommended intervention" subtitle="Prompted by the leading contributor" icon={<ClipboardCheck className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <div className="rounded-xl border border-brand/25 bg-brand/[0.06] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand">Prioritise</p>
              <p className="mt-1.5 text-[13.5px] font-bold leading-snug text-ink">{intervention.action}</p>
              {intervention.detail && (
                <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{intervention.detail}</p>
              )}
              <p className="mt-2.5 text-[11px] text-ink-3">Owner: {intervention.owner}</p>
            </div>
            <KeyValue
              columns={2}
              rows={[
                { label: 'Stakeholder responsiveness', value: project.stakeholderResponsiveness },
                { label: 'Avg inactivity', value: `${project.avgInactivityDays.toFixed(0)}d` },
                { label: 'Document completeness', value: `${project.avgDocumentCompleteness.toFixed(0)}%` },
                { label: 'Dominant ownership', value: project.dominantOwnership },
                { label: 'District delay history', value: `${(project.districtDelayRate * 100).toFixed(0)}%` },
                { label: 'Authority delay history', value: `${(project.authorityDelayRate * 100).toFixed(0)}%` },
              ]}
            />
            <Link to={`/predict?project=${project.id}`} className="block">
              <Button variant="outline" className="w-full gap-2">
                <TrendingUp className="h-4 w-4" /> Test an intervention scenario
              </Button>
            </Link>
            <p className="text-[11px] leading-relaxed text-ink-3">
              The platform prompts a review; it does not action anything itself. Every recommendation is for a named
              human owner to accept, defer or reject.
            </p>
          </div>
        </Card>
      </section>

      {/* ------------------------------------------------ stage risk + trend */}
      <section className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card className="animate-fade-up">
          <CardHeader
            title="Risk by stage"
            subtitle="Open cases in each stage and their mean predicted milestone risk"
            icon={<Layers className="h-4 w-4" />}
          />
          <div className="h-[280px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageChart} margin={{ top: 8, right: 16, left: -18, bottom: 4 }}>
                <XAxis dataKey="stage" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))', fontSize: 10 }} interval={0} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} unit="%" width={44} domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: 'rgb(var(--c-surface-2))' }}
                  content={
                    <ChartTooltip
                      formatter={(v, name) => (name === 'Open cases' ? formatNumber(v as number) : `${v}%`)}
                      labelFormatter={(l) => stageChart.find((d) => d.stage === l)?.full ?? l}
                    />
                  }
                />
                <Bar dataKey="risk" name="Stage risk" radius={[5, 5, 0, 0]} barSize={24} animationDuration={900}>
                  {stageChart.map((d, i) => (
                    <Cell key={i} fill={d.hasRisk ? RISK_HEX[d.band as RiskLevel] : 'rgb(var(--c-surface-3))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
            Grey bars are stages with no open cases — closed, or not yet reached.
          </p>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <CardHeader
            title="Risk trend"
            subtitle="Monthly re-scoring of this project over the last year"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <div className="h-[280px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyChart} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="pd-risk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={RISK_HEX[project.riskBand]} stopOpacity={0.34} />
                    <stop offset="100%" stopColor={RISK_HEX[project.riskBand]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))', fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} unit="%" width={44} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={{ stroke: 'rgb(var(--c-line-strong))' }} />
                <Area
                  type="monotone"
                  dataKey="risk"
                  name="Predicted risk"
                  stroke={RISK_HEX[project.riskBand]}
                  strokeWidth={2.4}
                  fill="url(#pd-risk)"
                  animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-line px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-ink-3">
              Observed history for this project: {formatNumber(project.observedCases)} closed milestones, of which{' '}
              <span className="font-semibold text-ink-2 num">{(project.observedDelayRate * 100).toFixed(0)}%</span> were
              delayed beyond 30 days.
            </p>
          </div>
        </Card>
      </section>

      {/* ------------------------------------------------------------ GIS */}
      <section className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <Card className="animate-fade-up">
          <CardHeader
            title="Parcel locations"
            subtitle="Open cases for this project, coloured by predicted risk"
            icon={<Globe2 className="h-4 w-4" />}
          />
          <div className="px-5 pb-5">
            <IndiaGeoMap
              districts={[]}
              points={points.data?.points ?? []}
              onSelectCase={(caseId) => navigate(`/cases/${caseId}`)}
            />
            <div className="mt-2 border-t border-line pt-3">
              <GeoLegend pointsShown={points.data?.returned} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              Positions are schematic — district centroids with jitter, not surveyed parcel boundaries. Click a point to
              open the case.
            </p>
          </div>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <CardHeader
            title="Highest-risk cases"
            subtitle="Ranked by predicted milestone risk, with the factors behind each"
            icon={<ShieldAlert className="h-4 w-4" />}
            action={
              <Link
                to={`/cases?projectId=${project.id}`}
                className="text-[12px] font-semibold text-brand hover:underline"
              >
                Open in case registry
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {topCases.slice(0, 6).map((c, i) => (
              <button
                key={c.caseId}
                onClick={() => navigate(`/cases/${c.caseId}`)}
                className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-3 text-[11px] font-bold text-ink-2 num">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11.5px] font-semibold text-ink">{c.caseId}</span>
                    <span className="text-[11px] text-ink-3">
                      {c.village}, {c.district}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-3">
                    {c.stage} · {c.areaHa} ha · {c.ownership}
                    {c.legalCases > 0 && ` · ${c.legalCases} legal case${c.legalCases > 1 ? 's' : ''}`}
                  </span>
                  <ContributorChips contributors={c.contributors ?? []} className="mt-1.5" max={3} />
                </span>
                <span className="shrink-0 text-right">
                  <RiskPill level={c.riskBand} score={c.riskScore} />
                  <span className="mt-1 block text-[10px] text-ink-3 num">
                    {c.daysToMilestone < 0 ? `${Math.abs(c.daysToMilestone)}d overdue` : `${c.daysToMilestone}d left`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </section>

      {/* ------------------------------------------------------ case table */}
      <Card className="animate-fade-up">
        <CardHeader
          title={stageIndex === null ? 'Cases in this project' : `Cases in ${selected.name}`}
          subtitle={`Open cases, paged server-side${stageIndex !== null ? ' — filtered to the selected stage' : ''}`}
          icon={<Layers className="h-4 w-4" />}
          action={
            stageIndex !== null && (
              <Button size="sm" variant="ghost" onClick={() => setStageIndex(null)}>
                Clear stage filter
              </Button>
            )
          }
        />
        <ServerTable
          rows={cases.data?.rows ?? []}
          columns={caseColumns}
          rowKey={(c) => c.caseId}
          onRowClick={(c) => navigate(`/cases/${c.caseId}`)}
          total={cases.data?.total ?? 0}
          page={cases.data?.page ?? 1}
          pages={cases.data?.pages ?? 1}
          pageSize={cases.data?.pageSize ?? 10}
          onPage={setCasePage}
          loading={cases.loading}
          refreshing={cases.refreshing}
          dense
          minWidth={1000}
        />
      </Card>

      <Card className="animate-fade-up p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-ink-3">
          <p className="label-xs">Project meta</p>
          <span>
            Outlay <span className="font-bold text-ink num">{formatCrore(project.budgetCr)}</span>
          </span>
          <span>
            Baseline completion <span className="font-bold text-ink num">{formatDate(project.targetCompletionDate)}</span>
          </span>
          <span>
            Observed milestones <span className="font-bold text-ink num">{formatNumber(project.observedCases)}</span>
          </span>
          <span>
            Open cases <span className="font-bold text-ink num">{formatNumber(project.openCases)}</span>
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5" /> Synthetic prototype data
          </span>
        </div>
      </Card>
    </div>
  );
}
