import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowLeft,
  BadgeIndianRupee,
  Bell,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileStack,
  Flag,
  Gavel,
  Globe2,
  History,
  Layers,
  ListChecks,
  MapPin,
  Network,
  Pencil,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, EmptyState, InfoDot, Progress, SkeletonCard, Tabs } from '@/components/ui';
import { ErrorState, KeyValue, QualityBadge, RiskPill } from '@/components/ui/primitives';
import { Modal, Field, inputClass } from '@/components/ui/Modal';
import { ChartTooltip, RiskGauge } from '@/components/charts';
import { ContributorBars, ContributorChips } from '@/components/explain/Contributors';
import { StageTimeline } from '@/components/lifecycle/StageTimeline';
import { DependencyNetwork } from '@/components/network/DependencyNetwork';
import { AlertRow, InterventionCard, RecommendationList } from '@/components/workflow';
import { StageForecast } from '@/components/lifecycle/StageForecast';
import { DocumentPanel } from '@/components/documents/DocumentPanel';
import { AuditTimeline } from '@/components/workflow/AuditTimeline';
import { IndiaGISMap } from '@/components/gis/IndiaGISMap';
import { ServerTable, type ServerColumn } from '@/components/ui/ServerTable';
import { IssueProfilePanel } from '@/components/issues/IssueProfilePanel';
import { ProvenanceBadge } from '@/components/brand/Provenance';
import { PRIORITY_CLASS, RISK_HEX } from '@/lib/risk';
import { RISK_BASIS_LABEL, STAGE_STATUS_CLASS, STAGE_STATUS_LABEL } from '@/lib/status';
import { formatCompact, formatCrore, formatDate, formatNumber } from '@/lib/format';
import { useApi } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { advanceProjectStage, deleteProject, fetchBoundaries, fetchMapPoints, fetchProject, fetchProjectCases } from '@/api/client';
import type { CaseRow, InterventionItem, AlertItem, MapProject } from '@/data/types';

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [casePage, setCasePage] = useState(1);
  const [workTab, setWorkTab] = useState('recommendations');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [completedOn, setCompletedOn] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const detail = useApi((signal) => fetchProject(id, signal), [id]);
  const data = detail.data;
  const project = data?.project;

  const caseQuery = useMemo(
    () => ({ page: casePage, pageSize: 10, sort: 'risk', stage: stageIndex !== null && project ? project.stages[stageIndex].name : undefined }),
    [casePage, stageIndex, project],
  );
  const cases = useApi((signal) => (id ? fetchProjectCases(id, caseQuery, signal) : Promise.resolve(null)), [id, JSON.stringify(caseQuery)]);
  const points = useApi((signal) => (id ? fetchMapPoints({ projectId: id, limit: 900 }, signal) : Promise.resolve(null)), [id]);
  const states = useApi((signal) => fetchBoundaries('states', undefined, signal), []);
  const districts = useApi((signal) => (project ? fetchBoundaries('districts', project.state, signal) : Promise.resolve(null)), [project?.state]);

  const [interventions, setInterventions] = useState<InterventionItem[] | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const items = interventions ?? data?.interventions ?? [];
  const alertItems = alerts ?? data?.alerts ?? [];

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} title="Could not load this project" />;
  if (detail.loading || !data || !project) return <SkeletonCard lines={12} />;

  const { summary, recommendations, topCases, permissions } = data;
  const current = project.stages[project.currentStageIndex];
  const selected = stageIndex !== null ? project.stages[stageIndex] : current;
  const nextStage = project.stages[project.currentStageIndex + 1] ?? null;
  const trend = project.riskTrend.map((m) => ({ month: m.month.slice(2), risk: m.riskScore, observed: m.observedDelayRate === null ? null : Math.round(m.observedDelayRate * 100) }));
  const mapProject: MapProject = {
    id: project.id,
    name: project.name,
    state: project.state,
    district: project.district,
    districts: project.districts,
    type: project.type,
    stage: project.currentStage,
    stageStatus: current.status,
    riskScore: project.riskScore,
    delayProbability: project.delayProbability,
    riskBand: project.riskBand,
    predictedDelayDays: project.predictedDelayDays,
    primaryAuthority: project.authority,
    lat: project.lat,
    lon: project.lon,
    openCases: project.openCases,
    source: project.source,
  };
  const pts = points.data?.points ?? [];
  const bounds = pts.length
    ? { lat0: Math.min(...pts.map((p) => p.lat), project.lat), lat1: Math.max(...pts.map((p) => p.lat), project.lat), lon0: Math.min(...pts.map((p) => p.lon), project.lon), lon1: Math.max(...pts.map((p) => p.lon), project.lon) }
    : { lat0: project.lat - 0.3, lat1: project.lat + 0.3, lon0: project.lon - 0.3, lon1: project.lon + 0.3 };
  const openInterventions = items.filter((i) => !['RESOLVED', 'DISMISSED'].includes(i.status));

  const caseColumns: ServerColumn<CaseRow>[] = [
    {
      key: 'id',
      header: 'Case / parcel',
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
    { key: 'status', header: 'Case status', render: (c) => <Badge className="border-line bg-surface-2 text-ink-2">{(c.caseStatus ?? 'OPEN').replace(/_/g, ' ').toLowerCase()}</Badge> },
    { key: 'own', header: 'Ownership', render: (c) => <span className="text-[12px]">{c.ownership}</span> },
    { key: 'comp', header: 'Compensation', sortKey: 'compensation', align: 'right', render: (c) => <span className="num text-[12px] font-semibold">{c.compensationCompletionPct}%</span> },
    { key: 'legal', header: 'Legal', sortKey: 'legal', align: 'right', render: (c) => <span className={cn('num text-[12px] font-semibold', c.legalCases > 0 && 'text-rose-600 dark:text-rose-400')}>{c.legalCases}</span> },
    { key: 'deps', header: 'Dept. pending', align: 'right', render: (c) => <span className="num text-[12px]">{c.pendingDependencyCount ?? '—'}</span> },
    {
      key: 'due',
      header: 'Milestone due',
      sortKey: 'deadline',
      align: 'right',
      render: (c) => (
        <span className={cn('text-[11.5px] num', c.daysToMilestone < 0 && 'font-semibold text-rose-500')}>
          {c.daysToMilestone < 0 ? `${Math.abs(c.daysToMilestone)}d overdue` : `${c.daysToMilestone}d left`}
        </span>
      ),
    },
    { key: 'risk', header: 'Risk', sortKey: 'risk', align: 'right', render: (c) => <RiskPill level={c.riskBand} score={c.riskScore} size="sm" /> },
  ];

  const doDelete = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await deleteProject(project.id, reason);
      navigate('/projects');
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const doAdvance = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await advanceProjectStage(project.id, { completedOn: completedOn || (undefined as unknown as string), note: reason || undefined });
      setAdvanceOpen(false);
      setReason('');
      setInterventions(null);
      setAlerts(null);
      detail.reload();
      cases.reload();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------- overview */}
      <Card className="animate-fade-up overflow-hidden">
        <div className="border-b border-line bg-navy-900 px-5 py-5 grid-lines">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/50 transition-colors hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="flex flex-wrap gap-2">
              {permissions.edit && (
                <Link to={`/projects/${project.id}/edit`}>
                  <Button size="sm" variant="outline" className="gap-1.5 border-white/20 text-white hover:bg-white/10">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </Link>
              )}
              {permissions.advanceStage && nextStage && (
                <Button size="sm" variant="outline" className="gap-1.5 border-white/20 text-white hover:bg-white/10" onClick={() => { setActionError(null); setCompletedOn(''); setAdvanceOpen(true); }}>
                  <Flag className="h-3.5 w-3.5" /> Record milestone achieved
                </Button>
              )}
              {permissions.delete && (
                <Button size="sm" variant="outline" className="gap-1.5 border-rose-400/40 text-rose-200 hover:bg-rose-500/20" onClick={() => { setActionError(null); setConfirmDelete(true); }}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11.5px] font-semibold text-white/40">{project.id}</span>
                <Badge className="border-white/15 bg-white/10 text-white/80">{project.type}</Badge>
                <Badge className="border-white/15 bg-white/10 text-white/60">{project.subtype}</Badge>
                <Badge className={PRIORITY_CLASS[project.priority]}>{project.priority}</Badge>
                <Badge className={STAGE_STATUS_CLASS[current.status]}>
                  {current.name}: {STAGE_STATUS_LABEL[current.status]}
                  {current.delayDays > 0 && current.status !== 'COMPLETED' ? ` · ${current.delayDays}d overdue` : ''}
                </Badge>
                <ProvenanceBadge mode={data.provenance.record} />
                <ProvenanceBadge mode="model" compact className="border-violet-300/30 bg-violet-400/10 text-violet-200" />
                {project.source !== 'corpus' && <Badge className="border-sky-400/30 bg-sky-400/10 text-sky-200">Added via {project.source === 'upload' ? 'CSV upload' : 'form'}</Badge>}
              </div>
              <h2 className="mt-2 font-display text-[22px] font-extrabold leading-tight tracking-tight text-white sm:text-[26px]">{project.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/55">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {project.districts.join(', ')}, {project.state}
                  {project.subDistrict && ` · ${project.subDistrictLabel} ${project.subDistrict}`}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> {project.authority}
                </span>
                <span className="flex items-center gap-1.5">
                  <Gavel className="h-3.5 w-3.5" /> {project.framework.short}
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> {formatDate(project.startDate)} → target {formatDate(project.targetCompletionDate)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-stretch gap-3">
              <div className="rounded-2xl border px-4 py-3" style={{ borderColor: `${RISK_HEX[project.riskBand]}55`, background: `${RISK_HEX[project.riskBand]}1a` }}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Delay probability · next milestone</p>
                <p className="mt-1 font-display text-[30px] font-extrabold leading-none num" style={{ color: RISK_HEX[project.riskBand] }}>
                  {Math.round(project.delayProbability * 100)}%
                </p>
                <p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: RISK_HEX[project.riskBand] }}>
                  {project.riskBand} risk · score {project.riskScore}/100
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Expected slip</p>
                <p className="mt-1 font-display text-[26px] font-extrabold leading-none text-white num">{project.predictedDelayDays ?? '—'}<span className="text-[13px] text-white/50"> days</span></p>
                <p className="mt-1 text-[10.5px] text-white/50">forecast completion {formatDate(project.lifecycle.forecastCompletion)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12.5px] font-semibold text-ink">Lifecycle progress</p>
            <p className="text-[12.5px] text-ink-3">
              stage <span className="font-bold text-ink num">{project.currentStageIndex + 1}</span> of 9 · <span className="font-bold text-ink num">{project.progressPct.toFixed(1)}%</span> ·{' '}
              {project.source === 'corpus' ? (
                <>
                  <span className="num">{formatNumber(project.openCases)}</span> of <span className="num">{formatNumber(project.totalParcels)}</span> cases open
                </>
              ) : (
                'project-level record (no case data)'
              )}
            </p>
          </div>
          <Progress value={project.progressPct} className="mt-2 h-2.5" barClassName={project.progressPct > 70 ? 'bg-emerald-500' : project.progressPct > 40 ? 'bg-brand' : 'bg-amber-500'} />
        </div>

        <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            { label: 'Land area', value: `${formatCompact(project.landRequirementHa)} ha`, icon: Layers, hint: `${formatNumber(project.totalParcels)} parcels` },
            { label: 'Affected families', value: formatNumber(project.affectedFamilies), icon: Users },
            { label: 'Notification', value: project.lifecycle.notificationStatus.split(' — ')[0], hint: project.lifecycle.notificationStatus.split(' — ')[1], icon: Flag },
            { label: 'Compensation', value: `${project.compensationCompletionPct.toFixed(0)}%`, hint: project.compensationStatus, icon: BadgeIndianRupee },
            { label: 'Possession', value: `${(project.possessionCompletionPct ?? 0).toFixed(0)}%`, hint: project.possessionStatus, icon: ClipboardCheck },
            { label: 'R&R', value: project.rrProgressPct === null ? 'N/A' : `${project.rrProgressPct.toFixed(0)}%`, hint: project.rrStatus, icon: Users },
            { label: 'Legal disputes', value: formatNumber(project.legalCases), hint: `${formatNumber(project.legalDisputeParcels)} parcels`, icon: Gavel },
            { label: 'Documentation', value: `${project.avgDocumentCompleteness.toFixed(0)}%`, hint: `approvals pending ${summary.approvalDelayDays}d avg`, icon: FileStack },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-center gap-2">
                <m.icon className="h-3.5 w-3.5 text-ink-3" />
                <p className="label-xs">{m.label}</p>
              </div>
              <p className="mt-1.5 font-display text-[15px] font-extrabold leading-tight text-ink num">{m.value}</p>
              {m.hint && <p className="mt-0.5 text-[10.5px] leading-tight text-ink-3">{m.hint}</p>}
            </div>
          ))}
        </div>
        {project.compensationBasis && <p className="border-t border-line px-5 py-2 text-[10.5px] text-ink-3">Compensation, possession and R&R percentages are measured across parcels for which that step is due.</p>}
      </Card>

      {/* ------------------------------------------- authorities + risk */}
      <section className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card className="animate-fade-up">
          <CardHeader
            title="Authority & department network"
            subtitle={`${project.network.dependencyCount} dependencies for a ${project.type.toLowerCase()} (${project.subtype.toLowerCase()}) project in ${project.district}, ${project.state} · coordination score ${project.coordinationScore}/100`}
            icon={<Network className="h-4 w-4" />}
            action={<InfoDot text="Derived from the authority registry for this framework, project type, state and district. Pending counts come from the case records of the current stage." />}
          />
          <div className="px-5 pb-5">
            <DependencyNetwork nodes={project.network.nodes} framework={project.framework} currentStage={project.currentStage} note={project.network.note} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="animate-fade-up">
            <CardHeader title="AI risk" subtitle={RISK_BASIS_LABEL[project.riskBasis]} icon={<ShieldAlert className="h-4 w-4" />} />
            <div className="grid place-items-center px-5 pb-5">
              <RiskGauge score={project.riskScore} label={project.riskBand} sublabel={`${Math.round(project.delayProbability * 100)}% chance ${project.currentStage} slips >30 days`} color={RISK_HEX[project.riskBand]} />
              {project.adjustment && (
                <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
                  Recorded edits ({project.adjustment.changedFields.join(', ') || `${project.adjustment.stageAdvances} stage advance`}) moved the risk from the ensemble's {project.previousEnsembleRisk}% by the deployed model's estimate of the change on the project profile
                  ({project.adjustment.profileBefore}% → {project.adjustment.profileAfter}%). Case-level scores refresh at the next retraining.
                </p>
              )}
              <div className="mt-4 w-full">
                <KeyValue
                  columns={2}
                  rows={[
                    { label: 'Risk score', value: `${project.riskScore}/100` },
                    { label: 'Delay probability', value: `${Math.round(project.delayProbability * 100)}%` },
                    { label: 'Risk category', value: project.riskBand, tone: 'text-ink' },
                    { label: 'Predicted delay', value: project.predictedDelayDays !== null ? `${project.predictedDelayDays} days` : '—', hint: 'P(delay) × expected slip if delayed' },
                  ]}
                />
              </div>
              {project.dataQuality !== null && (
                <div className="mt-3 w-full">
                  <QualityBadge score={project.dataQuality} />
                </div>
              )}
            </div>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader
              title="Why is it at risk?"
              subtitle={project.contributorBasis === 'treeshap-profile' ? 'Exact TreeSHAP of the deployed model on the project record' : project.contributorBasis === 'surrogate' ? 'Linear reference contributions on the project record' : 'TreeSHAP contributions of the deployed model, aggregated over open cases'}
              icon={<Sparkles className="h-4 w-4" />}
            />
            <div className="px-5 pb-5">
              {project.contributors.length === 0 ? <EmptyState title="No contributions recorded" description="This project has no open cases to explain." /> : <ContributorBars contributors={project.contributors} max={6} />}
            </div>
          </Card>
        </div>
      </section>

      <IssueProfilePanel className="animate-fade-up" profile={data.issues} />

      {/* --------------------------------------------------- lifecycle */}
      <Card className="animate-fade-up">
        <CardHeader title="Stage timeline" subtitle="Statutory stage status, with the case backlog attached to each stage shown separately" icon={<CalendarClock className="h-4 w-4" />} />
        <StageTimeline
          stages={project.stages}
          currentIndex={project.currentStageIndex}
          selectedIndex={stageIndex ?? undefined}
          onSelect={(i) => {
            setStageIndex(i === stageIndex ? null : i);
            setCasePage(1);
          }}
        />
        <div className="border-t border-line bg-surface-2 px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="min-w-0">
              <p className="label-xs">{stageIndex === null ? 'Current stage' : 'Selected stage'} · {selected.name}</p>
              <p className="mt-1 text-[13px] font-semibold text-ink">{selected.milestone}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge className={STAGE_STATUS_CLASS[selected.status]}>Stage: {STAGE_STATUS_LABEL[selected.status]}</Badge>
                {selected.totalCases > 0 && (
                  <Badge className={selected.openCases > 0 ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600'}>
                    Case backlog: {selected.openCases > 0 ? `${formatNumber(selected.openCases)} open` : 'cleared'}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{selected.explanation}</p>
              {selected.blockedBy.length > 0 && (
                <ul className="mt-2 space-y-1 text-[12px] text-rose-700 dark:text-rose-400">
                  {selected.blockedBy.map((b) => (
                    <li key={b.code}>
                      Blocked by {b.name}: pending on {formatNumber(b.pendingCases)} cases ({Math.round(b.share * 100)}%)
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <KeyValue
              columns={2}
              rows={[
                { label: 'Stage completion', value: selected.actualCompletion ? formatDate(selected.actualCompletion) : '—', hint: selected.actualCompletion ? (selected.delayDays ? `${selected.delayDays} days late` : 'on time') : undefined },
                { label: 'Working deadline', value: formatDate(selected.expectedCompletion), hint: `baseline ${formatDate(selected.baselineCompletion)}` },
                { label: 'Cases', value: selected.totalCases ? `${formatNumber(selected.resolvedCases)} / ${formatNumber(selected.totalCases)}` : '—', hint: selected.resolutionPct !== null ? `${selected.resolutionPct}% resolved` : 'no case records' },
                { label: 'Milestone risk', value: selected.riskProbability !== null ? `${Math.round(selected.riskProbability * 100)}%` : '—', hint: selected.riskProbability === null ? 'no open cases to score' : 'mean over open cases' },
              ]}
            />
          </div>
        </div>
      </Card>

      {project.forecast && <StageForecast className="animate-fade-up" forecast={project.forecast} />}

      {/* ------------------------------------ next milestone + workflow */}
      <section className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <Card className="animate-fade-up">
          <CardHeader title="Next milestone" subtitle={`${current.name} · ${project.framework.short}`} icon={<Flag className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <p className="text-[14px] font-bold leading-snug text-ink">{project.currentMilestone}</p>
            <KeyValue
              columns={2}
              rows={[
                { label: 'Deadline', value: formatDate(project.milestoneDeadline) },
                { label: current.daysRemaining < 0 ? 'Overdue by' : 'Days left', value: `${Math.abs(current.daysRemaining)} days`, tone: current.daysRemaining < 0 ? 'text-rose-600 dark:text-rose-400' : undefined },
                { label: 'Open cases in stage', value: formatNumber(current.openCases) },
                { label: 'Approvals pending', value: `${current.approvalDelayMean} days`, hint: 'mean over open cases' },
              ]}
            />
            {nextStage && (
              <p className="text-[12px] text-ink-3">
                Then: <span className="font-semibold text-ink-2">{nextStage.name}</span> — {nextStage.milestone}
              </p>
            )}
            <Link to={`/predict?project=${project.id}`} className="block">
              <Button variant="outline" className="w-full gap-2">
                <TrendingUp className="h-4 w-4" /> Test interventions in Scenario Scoring
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader
            title="Recommended actions"
            subtitle="Generated from rule and model triggers, with owners — ranked by severity, then by the risk reduction the deployed model predicts for the action"
            icon={<ListChecks className="h-4 w-4" />}
            action={
              <Tabs
                tabs={[
                  { id: 'recommendations', label: 'Recommendations', count: recommendations.length },
                  { id: 'interventions', label: 'Interventions', count: openInterventions.length },
                  { id: 'alerts', label: 'Alerts', count: alertItems.filter((a) => a.status !== 'RESOLVED').length },
                ]}
                active={workTab}
                onChange={setWorkTab}
              />
            }
          />
          <div className={cn(workTab === 'recommendations' ? 'px-5 pb-5' : 'divide-y divide-line border-t border-line')}>
            {workTab === 'recommendations' && <RecommendationList items={recommendations} />}
            {workTab === 'interventions' &&
              (items.length ? (
                items.map((i) => (
                  <InterventionCard key={i.id} item={i} showProject={false} canUpdate={permissions.updateIntervention} onChanged={(n) => setInterventions(items.map((x) => (x.id === n.id ? n : x)))} />
                ))
              ) : (
                <p className="px-5 py-8 text-center text-[12px] text-ink-3">No interventions — no Medium-or-higher rule is triggered.</p>
              ))}
            {workTab === 'alerts' &&
              (alertItems.length ? (
                alertItems.map((a) => <AlertRow key={a.id} alert={a} canUpdate={permissions.updateAlert} onChanged={(n) => setAlerts(alertItems.map((x) => (x.id === n.id ? n : x)))} />)
              ) : (
                <p className="px-5 py-8 text-center text-[12px] text-ink-3">No alerts on this project.</p>
              ))}
          </div>
        </Card>
      </section>

      {/* -------------------------------------------- GIS + risk trend */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="animate-fade-up">
          <CardHeader title="Location" subtitle={`${project.districts.join(', ')}, ${project.state} — open cases coloured by predicted risk`} icon={<Globe2 className="h-4 w-4" />} />
          <div className="px-5 pb-5">
            <IndiaGISMap
              states={states.data}
              districts={districts.data}
              projects={[mapProject]}
              points={pts}
              selectedState={project.state}
              selectedProjectId={project.id}
              focusBounds={bounds}
              onSelectCase={(caseId) => navigate(`/cases/${caseId}`)}
              height={400}
              showLayersControl
            />
          </div>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader title="Risk trend" subtitle="Mean predicted risk of this project's cases by assessment month, with the observed delay rate where milestones have resolved" icon={<TrendingUp className="h-4 w-4" />} />
          {trend.length ? (
            <div className="h-[300px] px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pd-risk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={RISK_HEX[project.riskBand]} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={RISK_HEX[project.riskBand]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))', fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} unit="%" width={44} domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                  <Area type="monotone" dataKey="risk" name="Mean predicted risk" stroke={RISK_HEX[project.riskBand]} strokeWidth={2.2} fill="url(#pd-risk)" />
                  <Line type="monotone" dataKey="observed" name="Observed delay rate" stroke="#64748B" strokeDasharray="4 4" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No trend yet" description="Projects without case records have no assessment history." />
          )}
          <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
            {data.riskSnapshots.length > 1
              ? `Headline risk snapshots: ${data.riskSnapshots.map((s) => `${s.riskScore}% (${formatDate(s.at)})`).join(' → ')}`
              : 'A headline-risk snapshot is recorded whenever the model or the project record changes.'}
          </p>
        </Card>
      </section>

      {/* ------------------------------------------------ case backlog */}
      {project.source === 'corpus' && (
        <section className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
          <Card className="animate-fade-up">
            <CardHeader title="Cases holding the project back" subtitle="Highest predicted risk among open cases, with the factors behind each" icon={<ShieldAlert className="h-4 w-4" />} />
            <div className="divide-y divide-line">
              {topCases.slice(0, 6).map((c, i) => (
                <button key={c.caseId} onClick={() => navigate(`/cases/${c.caseId}`)} className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-3 text-[11px] font-bold text-ink-2 num">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11.5px] font-semibold text-ink">{c.caseId}</span>
                      <span className="text-[11px] text-ink-3">
                        {c.village}, {c.tehsil}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-3">
                      {c.stage} · {c.ownership}
                      {c.legalCases > 0 && ` · ${c.legalCases} legal`}
                      {c.pendingDependencies.length > 0 && ` · ${c.pendingDependencies.length} dept. pending`}
                    </span>
                    <ContributorChips contributors={c.contributors ?? []} className="mt-1.5" max={3} />
                  </span>
                  <RiskPill level={c.riskBand} score={c.riskScore} size="sm" />
                </button>
              ))}
            </div>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader
              title={stageIndex === null ? 'Case & parcel backlog' : `Cases in ${selected.name}`}
              subtitle={`Open cases, paged server-side${stageIndex !== null ? ' — filtered to the selected stage' : ''}`}
              icon={<Layers className="h-4 w-4" />}
              action={
                <div className="flex gap-2">
                  {stageIndex !== null && (
                    <Button size="sm" variant="ghost" onClick={() => setStageIndex(null)}>
                      Clear stage
                    </Button>
                  )}
                  <Link to={`/cases?projectId=${project.id}`}>
                    <Button size="sm" variant="outline">
                      Case registry
                    </Button>
                  </Link>
                </div>
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
              minWidth={960}
            />
          </Card>
        </section>
      )}

      {/* ------------------------------------------- documents + audit */}
      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="animate-fade-up">
          <CardHeader title="Documents" subtitle="Stored against this project, by stage and case" icon={<Upload className="h-4 w-4" />} />
          <DocumentPanel projectId={project.id} stages={project.stages.map((s) => s.name)} initial={data.documents} canUpload={permissions.uploadDocument} canReview={permissions.reviewDocument} onChanged={detail.reload} />
        </Card>
        <Card className="animate-fade-up">
          <CardHeader title="Activity & audit history" subtitle="Edits, stage completions, workflow changes and documents on this project" icon={<History className="h-4 w-4" />} action={can('audit.view') ? <Link to={`/audit?q=${project.id}`} className="text-[12px] font-semibold text-brand hover:underline">Full audit</Link> : undefined} />
          <div className="px-5 pb-5">
            <AuditTimeline entries={data.activity} empty="No recorded activity on this project yet." />
          </div>
        </Card>
      </section>

      <Card className="animate-fade-up p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-ink-3">
          <p className="label-xs">Project meta</p>
          {project.budgetCr !== null && (
            <span>
              Outlay <span className="font-bold text-ink num">{formatCrore(project.budgetCr)}</span>
            </span>
          )}
          <span>
            Responsible department <span className="font-bold text-ink">{summary.responsibleDepartment}</span>
          </span>
          <span>
            Timeline overrun <span className="font-bold text-ink num">{project.lifecycle.timelineOverrunDays} days</span>
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Synthetic demo data — not a real project record
          </span>
        </div>
      </Card>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete project"
        subtitle={`${project.id} · ${project.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete} disabled={busy || reason.trim().length < 5}>
              {busy ? 'Deleting…' : 'Delete project'}
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-ink-2">The project is removed from every screen and can be restored from Administration. The deletion and your reason are written to the audit trail.</p>
        <Field label="Reason (required)" className="mt-3">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={cn(inputClass, 'h-auto py-2')} />
        </Field>
        {actionError && <p className="mt-2 text-[12px] font-medium text-rose-600">{actionError}</p>}
      </Modal>

      <Modal
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        title={`Record "${current.name}" milestone achieved`}
        subtitle={current.milestone}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdvanceOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doAdvance} disabled={busy}>
              {busy ? 'Saving…' : `Complete stage and open ${nextStage?.name}`}
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          This closes the statutory stage for the project. {current.openCases > 0 ? `${formatNumber(current.openCases)} cases attached to it stay open as residual backlog.` : ''} Risk is re-scored and the change is audited.
        </p>
        <Field label="Completion date" hint={`Between ${formatDate(current.startDate)} and the snapshot date; leave blank to use the snapshot date`} className="mt-3">
          <input type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Note" className="mt-3">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. Gazette notification reference" />
        </Field>
        {actionError && <p className="mt-2 text-[12px] font-medium text-rose-600">{actionError}</p>}
      </Modal>
    </div>
  );
}
