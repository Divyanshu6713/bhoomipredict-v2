import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Building2, CalendarClock, ChevronRight, FlaskConical, Flag, Gavel, MapPin, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, EmptyState, InfoDot, PageSkeleton, Progress, Tabs } from '@/components/ui';
import { ErrorState, KeyValue, QualityBadge, RiskPill, RiskVerdict } from '@/components/ui/primitives';
import { Modal, Field, inputClass } from '@/components/ui/Modal';
import { ChartLegend, ChartTooltip } from '@/components/charts';
import { ContributorBars, ContributorChips } from '@/components/explain/Contributors';
import { StageTimeline } from '@/components/lifecycle/StageTimeline';
import { DependencyNetwork } from '@/components/network/DependencyNetwork';
import { AlertRow, InterventionCard, RecommendationList } from '@/components/workflow';
import { StageForecast } from '@/components/lifecycle/StageForecast';
import { ProgressKey } from '@/components/lifecycle/ProgressKey';
import { parcelLine, parcels, stageStory, stepHeadline } from '@/lib/plainStage';
import { DocumentPanel } from '@/components/documents/DocumentPanel';
import { AuditTimeline } from '@/components/workflow/AuditTimeline';
import { IndiaGISMap } from '@/components/gis/IndiaGISMap';
import { ServerTable, type ServerColumn } from '@/components/ui/ServerTable';
import { IssueProfilePanel } from '@/components/issues/IssueProfilePanel';
import { ProvenanceBadge } from '@/components/brand/Provenance';
import { AXIS_TICK, PRIORITY_CLASS, RISK_HEX } from '@/lib/risk';
import { RISK_BASIS_LABEL, STAGE_STATUS_CLASS, STAGE_STATUS_LABEL } from '@/lib/status';
import { formatCompact, formatCrore, formatDate, formatNumber, formatVsTarget } from '@/lib/format';
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
  const casesRef = useRef<HTMLDivElement>(null);

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
  if (detail.loading || !data || !project) return <PageSkeleton blocks={3} />;

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
  const stepsDone = project.stages.filter((s) => s.status === 'COMPLETED').length;
  const story = stageStory(selected);
  const selLine = parcelLine(selected);
  const showStageParcels = () => {
    if (stageIndex === null) setStageIndex(project.currentStageIndex);
    setCasePage(1);
    casesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const openInterventions = items.filter((i) => !['RESOLVED', 'DISMISSED'].includes(i.status));
  // Every number on the risk card comes from one server object (forecast.headline).
  const h = project.forecast?.headline ?? null;

  const caseColumns: ServerColumn<CaseRow>[] = [
    {
      key: 'id',
      header: 'Case / parcel',
      render: (c) => (
        <div>
          <p className="font-mono text-xs font-medium text-ink">{c.caseId}</p>
          <p className="text-xs text-ink-3">
            {c.village}, {c.district}
          </p>
        </div>
      ),
    },
    { key: 'stage', header: 'Stage', render: (c) => <span className="text-sm">{c.stage}</span> },
    { key: 'status', header: 'File status', hideOnMobile: true, render: (c) => <span className="text-sm capitalize">{(c.caseStatus ?? 'OPEN').replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'own', header: 'Ownership', hideOnMobile: true, render: (c) => <span className="text-sm">{c.ownership}</span> },
    { key: 'comp', header: 'Compensation', sortKey: 'compensation', align: 'right', render: (c) => <span className="num text-sm">{c.compensationCompletionPct}%</span> },
    { key: 'legal', header: 'Legal', sortKey: 'legal', align: 'right', render: (c) => <span className={cn('num text-sm', c.legalCases > 0 && 'font-medium text-red-700 dark:text-red-300')}>{c.legalCases}</span> },
    { key: 'deps', header: 'Depts. pending', align: 'right', hideOnMobile: true, render: (c) => <span className="num text-sm">{c.pendingDependencyCount ?? '—'}</span> },
    {
      key: 'due',
      header: 'Milestone due',
      sortKey: 'deadline',
      align: 'right',
      render: (c) => <span className={cn('text-sm num', c.daysToMilestone < 0 && 'font-medium text-red-700 dark:text-red-300')}>{c.daysToMilestone < 0 ? `${Math.abs(c.daysToMilestone)} d overdue` : `${c.daysToMilestone} d left`}</span>,
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
    <div className="space-y-6">
      {/* ------------------------------------------------------ header */}
      <header>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-ink-3">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 rounded hover:text-ink focus-ring">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span aria-hidden className="px-1">
            /
          </span>
          <Link to="/projects" className="hover:text-ink">
            Projects
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span className="font-mono text-xs text-ink-2">{project.id}</span>
        </nav>

        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{project.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {project.districts.join(', ')}, {project.state}
                {project.subDistrict && ` · ${project.subDistrictLabel} ${project.subDistrict}`}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> {project.authority}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Gavel className="h-3.5 w-3.5" /> {project.framework.short}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> {formatDate(project.startDate)} → target {formatDate(project.targetCompletionDate)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge>
                {project.type} · {project.subtype}
              </Badge>
              <Badge className={STAGE_STATUS_CLASS[current.status]}>
                {current.name}: {STAGE_STATUS_LABEL[current.status]}
                {current.delayDays > 0 && current.status !== 'COMPLETED' ? ` · ${current.delayDays} d overdue` : ''}
              </Badge>
              {project.priority !== 'Routine' && <Badge className={PRIORITY_CLASS[project.priority]}>{project.priority} priority</Badge>}
              <ProvenanceBadge mode={data.provenance.record} />
              {project.source !== 'corpus' && <Badge tone="info">Added via {project.source === 'upload' ? 'CSV upload' : 'form'}</Badge>}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to={`/predict?project=${project.id}`}>
              <Button size="sm" variant="secondary" tabIndex={-1}>
                <FlaskConical className="h-3.5 w-3.5" /> Test interventions
              </Button>
            </Link>
            {permissions.advanceStage && nextStage && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setActionError(null);
                  setCompletedOn('');
                  setAdvanceOpen(true);
                }}
              >
                <Flag className="h-3.5 w-3.5" /> Record milestone
              </Button>
            )}
            {permissions.edit && (
              <Link to={`/projects/${project.id}/edit`}>
                <Button size="sm" variant="secondary" tabIndex={-1}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              </Link>
            )}
            {permissions.delete && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-400/10"
                onClick={() => {
                  setActionError(null);
                  setConfirmDelete(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ---------------------------------------- risk, why, next milestone */}
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="flex flex-col p-5">
          <RiskVerdict
            level={project.riskBand}
            score={project.riskScore}
            label={`Chance of a delay of more than 30 days at the ${project.currentStage} step`}
            detail={
              h ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-ink-3">Risk score</dt>
                  <dd>
                    <span className="font-medium text-ink num">{h.riskScore}/100</span> <span className="text-ink-3">— the same {h.riskScore}% on a 0–100 scale</span>
                  </dd>
                  <dt className="text-ink-3">Expected delay</dt>
                  <dd>
                    <span className="font-medium text-ink num">{h.expectedDelayDays} days</span>{' '}
                    <span className="text-ink-3">
                      at {h.stage} (due {formatDate(h.stageDeadline)}
                      {h.overdueDays > 0 ? `, already ${h.overdueDays} days past` : ''}) · about <span className="num">{h.delayIfLateDays}</span> days if it slips
                    </span>
                  </dd>
                  <dt className="text-ink-3">Target</dt>
                  <dd className="font-medium text-ink num">{formatDate(h.targetCompletionDate)}</dd>
                  <dt className="text-ink-3">Forecast finish</dt>
                  <dd>
                    <span className="font-medium text-ink num">{formatDate(h.forecastCompletion)}</span>{' '}
                    <span className={cn('num', h.daysVsTarget > 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300')}>{formatVsTarget(h.daysVsTarget)}</span>
                  </dd>
                </dl>
              ) : (
                <>
                  Risk score <span className="num">{project.riskScore}</span>/100 · expected delay <span className="num">{project.predictedDelayDays ?? '—'}</span> days
                </>
              )
            }
          />
          {h && (
            <p className="mt-2 text-xs text-ink-3">
              Expected delay applies to the current step only. The forecast finish adds the remaining steps and their own delay risk — it is the middle (P50) of {project.forecast?.runs.toLocaleString('en-IN')} simulated schedules, so it is not target + expected delay.
            </p>
          )}
          {project.adjustment && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-ink-2 dark:border-amber-400/20 dark:bg-amber-400/5">
              Recorded edits ({project.adjustment.changedFields.join(', ') || `${project.adjustment.stageAdvances} stage advance`}) moved the risk from the ensemble&rsquo;s {project.previousEnsembleRisk}% by the model&rsquo;s estimate of the change (
              {project.adjustment.profileBefore}% → {project.adjustment.profileAfter}%). Case-level scores refresh at the next retraining.
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
            {project.dataQuality !== null ? <QualityBadge score={project.dataQuality} /> : <span />}
            <InfoDot text={RISK_BASIS_LABEL[project.riskBasis]} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Why it is at risk"
            subtitle={project.contributorBasis === 'treeshap-profile' ? 'Exact TreeSHAP of the deployed model on the project record' : project.contributorBasis === 'surrogate' ? 'Linear reference contributions on the project record' : 'Model contributions, aggregated over open cases'}
          />
          <div className="px-5 pb-5">{project.contributors.length === 0 ? <EmptyState title="Nothing to explain" description="This project has no open cases, so there is no prediction to decompose." /> : <ContributorBars contributors={project.contributors} max={5} />}</div>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="Next milestone" subtitle={`${current.name} · ${project.framework.short}`} />
          <div className="space-y-4 px-5 pb-5">
            <p className="text-base font-medium text-ink">{project.currentMilestone}</p>
            <KeyValue
              columns={2}
              rows={[
                { label: 'Deadline', value: formatDate(project.milestoneDeadline) },
                { label: current.daysRemaining < 0 ? 'Overdue by' : 'Days left', value: `${Math.abs(current.daysRemaining)} days`, tone: current.daysRemaining < 0 ? 'text-red-700 dark:text-red-300' : undefined },
                { label: 'Parcels pending at this step', value: formatNumber(current.openCases) },
                { label: 'Avg. wait for approvals', value: `${current.approvalDelayMean} days`, hint: 'across pending parcels' },
              ]}
            />
            {nextStage && (
              <p className="border-t border-line pt-3 text-sm text-ink-3">
                Then <span className="font-medium text-ink-2">{nextStage.name}</span> — {nextStage.milestone}
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------- actions */}
      <Card>
        <CardHeader
          title="What to do"
          subtitle="From rule and model triggers, ranked by severity and by the risk reduction the model predicts for each action"
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
              items.map((i) => <InterventionCard key={i.id} item={i} showProject={false} canUpdate={permissions.updateIntervention} onChanged={(n) => setInterventions(items.map((x) => (x.id === n.id ? n : x)))} />)
            ) : (
              <EmptyState title="No interventions" description="No Medium-or-higher rule is triggered for this project, so nothing has been routed for action." />
            ))}
          {workTab === 'alerts' &&
            (alertItems.length ? (
              alertItems.map((a) => <AlertRow key={a.id} alert={a} canUpdate={permissions.updateAlert} onChanged={(n) => setAlerts(alertItems.map((x) => (x.id === n.id ? n : x)))} />)
            ) : (
              <EmptyState title="No alerts" description="No alert rule has fired on this project." />
            ))}
        </div>
      </Card>

      {/* ------------------------------------------------ lifecycle */}
      <Card>
        <CardHeader
          title="Lifecycle"
          subtitle={
            <>
              Now at step <span className="num">{project.currentStageIndex + 1}</span> of 9 ({project.currentStage}) · <span className="num">{stepsDone}</span> step{stepsDone === 1 ? '' : 's'} done ·{' '}
              {project.source === 'corpus' ? (
                <>
                  <span className="num">{formatNumber(project.totalParcels - project.openCases)}</span> of <span className="num">{formatNumber(project.totalParcels)}</span> parcels cleared, <span className="num">{formatNumber(project.openCases)}</span> still pending
                </>
              ) : (
                'project-level record (no parcel data)'
              )}
            </>
          }
        />
        <div className="px-5 pb-4">
          <Progress value={project.progressPct} className="h-2" />
        </div>
        <div className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4 xl:grid-cols-8">
          {[
            { label: 'Land area', value: `${formatCompact(project.landRequirementHa)} ha`, hint: `${formatNumber(project.totalParcels)} parcels` },
            { label: 'Affected families', value: formatNumber(project.affectedFamilies) },
            { label: 'Notification', value: project.lifecycle.notificationStatus.split(' — ')[0], hint: project.lifecycle.notificationStatus.split(' — ')[1] },
            { label: 'Compensation paid', value: `${project.compensationCompletionPct.toFixed(0)}%`, hint: `${project.compensationStatus} · avg. per parcel due` },
            { label: 'Possession taken', value: `${(project.possessionCompletionPct ?? 0).toFixed(0)}%`, hint: project.possessionStatus },
            { label: 'R&R delivered', value: project.rrProgressPct === null ? 'N/A' : `${project.rrProgressPct.toFixed(0)}%`, hint: project.rrStatus },
            { label: 'Court cases', value: formatNumber(project.legalCases), hint: `on ${formatNumber(project.legalDisputeParcels)} parcels` },
            { label: 'Documents complete', value: `${project.avgDocumentCompleteness.toFixed(0)}%`, hint: `approvals wait ${summary.approvalDelayDays} d avg` },
          ].map((m) => (
            <div key={m.label} className="bg-surface px-4 py-3">
              <p className="text-xs text-ink-3">{m.label}</p>
              <p className="mt-0.5 text-md font-semibold text-ink num">{m.value}</p>
              {m.hint && <p className="truncate text-xs text-ink-3" title={m.hint}>{m.hint}</p>}
            </div>
          ))}
        </div>
        {project.source === 'corpus' && <ProgressKey stages={project.stages} className="mx-5 mt-4" />}
        <div className="pt-2">
          <StageTimeline
            stages={project.stages}
            currentIndex={project.currentStageIndex}
            selectedIndex={stageIndex ?? undefined}
            onSelect={(i) => {
              setStageIndex(i === stageIndex ? null : i);
              setCasePage(1);
            }}
          />
        </div>
        <div className="border-t border-line bg-surface-2 px-5 py-4">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-3">
                {stageIndex === null ? 'Current step' : 'Selected step'} · {selected.name}
              </p>
              <p className="mt-1 text-base font-medium text-ink">{stepHeadline(selected)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge className={STAGE_STATUS_CLASS[selected.status]}>Project step: {STAGE_STATUS_LABEL[selected.status]}</Badge>
                {selected.totalCases > 0 && <Badge tone={selLine.tone}>{selLine.text}</Badge>}
              </div>
              <p className="mt-2.5 text-sm text-ink-2">
                <span className="font-medium text-ink">What this means: </span>
                {story.means}
              </p>
              {story.todo && (
                <p className="mt-1.5 text-sm text-ink-2">
                  <span className="font-medium text-ink">What to do: </span>
                  {story.todo}
                </p>
              )}
              {selected.blockedBy.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-300">
                  {selected.blockedBy.map((b) => (
                    <li key={b.code}>
                      Held up by {b.name}: action pending on {parcels(b.pendingCases)} ({Math.round(b.share * 100)}% of those pending)
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-xs text-ink-3">Formal milestone: {selected.milestone}</p>
              {project.source === 'corpus' && selected.openCases > 0 && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={showStageParcels}>
                  Show the {parcels(selected.openCases)} pending here
                </Button>
              )}
            </div>
            <KeyValue
              columns={2}
              rows={[
                { label: 'Step done on', value: selected.actualCompletion ? formatDate(selected.actualCompletion) : 'Not yet', hint: selected.actualCompletion ? (selected.delayDays ? `${selected.delayDays} days late` : 'on time') : undefined },
                { label: 'Deadline', value: formatDate(selected.expectedCompletion), hint: `original plan ${formatDate(selected.baselineCompletion)}` },
                { label: 'Parcels cleared', value: selected.totalCases ? `${formatNumber(selected.resolvedCases)} of ${formatNumber(selected.totalCases)}` : '—', hint: selected.totalCases ? `${formatNumber(selected.openCases)} still pending` : 'no parcel records' },
                { label: 'Delay risk', value: selected.riskProbability !== null ? `${Math.round(selected.riskProbability * 100)}%` : '—', hint: selected.riskProbability === null ? 'nothing pending to score' : 'chance the pending parcels slip > 30 days' },
              ]}
            />
          </div>
        </div>
        {project.compensationBasis && <p className="border-t border-line px-5 py-2.5 text-xs text-ink-3">Compensation paid, possession taken and R&R delivered are averages over the parcels for which that step is due, so they can differ from the count of parcels cleared at the step.</p>}
      </Card>

      {project.forecast && <StageForecast forecast={project.forecast} />}

      {/* ------------------------------------------ authorities + issues */}
      <Card>
        <CardHeader
          title="Authorities and departments"
          subtitle={`${project.network.dependencyCount} dependencies for a ${project.type.toLowerCase()} (${project.subtype.toLowerCase()}) in ${project.district}, ${project.state} · coordination score ${project.coordinationScore}/100`}
          action={<InfoDot text="Derived from the authority registry for this framework, project type, State and district. Pending counts come from the case records of the current stage." />}
        />
        <div className="px-5 pb-5">
          <DependencyNetwork nodes={project.network.nodes} framework={project.framework} currentStage={project.currentStage} note={project.network.note} />
        </div>
      </Card>

      <IssueProfilePanel profile={data.issues} />

      {/* -------------------------------------------- GIS + risk trend */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Location" subtitle={`${project.districts.join(', ')}, ${project.state} — open cases coloured by predicted risk`} />
          <div className="px-5 pb-5">
            <IndiaGISMap states={states.data} districts={districts.data} projects={[mapProject]} points={pts} selectedState={project.state} selectedProjectId={project.id} focusBounds={bounds} onSelectCase={(caseId) => navigate(`/cases/${caseId}`)} height={400} showLayersControl />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Risk trend" subtitle="Mean predicted risk of this project's cases by assessment month, with the observed delay rate where milestones have resolved" />
          {trend.length ? (
            <>
              <div className="px-5">
                <ChartLegend
                  items={[
                    { label: 'Mean predicted risk', color: RISK_HEX[project.riskBand] },
                    { label: 'Observed delay rate', color: '#667085', dashed: true },
                  ]}
                />
              </div>
              <div className="h-[280px] px-2 pb-4 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pd-risk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={RISK_HEX[project.riskBand]} stopOpacity={0.16} />
                        <stop offset="100%" stopColor={RISK_HEX[project.riskBand]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgb(var(--c-line))" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={12} />
                    <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} unit="%" width={44} domain={[0, 100]} />
                    <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={{ stroke: 'rgb(var(--c-line-strong))' }} />
                    <Area type="monotone" dataKey="risk" name="Predicted risk" stroke={RISK_HEX[project.riskBand]} strokeWidth={2} fill="url(#pd-risk)" isAnimationActive={false} />
                    <Line type="monotone" dataKey="observed" name="Observed delay rate" stroke="#667085" strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <EmptyState title="No trend yet" description="Projects without case records have no assessment history to chart." />
          )}
          <p className="mt-auto border-t border-line px-5 py-3 text-xs text-ink-3">
            {data.riskSnapshots.length > 1 ? `Headline risk snapshots: ${data.riskSnapshots.map((s) => `${s.riskScore}% (${formatDate(s.at)})`).join(' → ')}` : 'A headline-risk snapshot is recorded whenever the model or the project record changes.'}
          </p>
        </Card>
      </div>

      {/* ------------------------------------------------ case backlog */}
      {project.source === 'corpus' && (
        <div ref={casesRef} className="grid scroll-mt-20 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <Card>
            <CardHeader title="Parcels holding the project back" subtitle="Pending parcels with the highest delay risk, and what is driving each" />
            <ol className="divide-y divide-line border-t border-line">
              {topCases.slice(0, 6).map((c, i) => (
                <li key={c.caseId}>
                  <button type="button" onClick={() => navigate(`/cases/${c.caseId}`)} className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                    <span className="mt-0.5 w-4 shrink-0 text-xs text-ink-3 num">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-xs font-medium text-ink">{c.caseId}</span>
                        <span className="text-xs text-ink-3">
                          {c.village}, {c.tehsil}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        {c.stage} · {c.ownership}
                        {c.legalCases > 0 && ` · ${c.legalCases} legal`}
                        {c.pendingDependencies.length > 0 && ` · ${c.pendingDependencies.length} dept. pending`}
                      </span>
                      <ContributorChips contributors={c.contributors ?? []} className="mt-1.5" max={3} />
                    </span>
                    <RiskPill level={c.riskBand} score={c.riskScore} size="sm" />
                  </button>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader
              title={stageIndex === null ? 'All pending parcels' : `Pending parcels at ${selected.name}`}
              subtitle={stageIndex !== null ? 'Filtered to the step selected in the lifecycle' : 'Click a step in the lifecycle to filter'}
              action={
                <div className="flex gap-2">
                  {stageIndex !== null && (
                    <Button size="sm" variant="ghost" onClick={() => setStageIndex(null)}>
                      Show all steps
                    </Button>
                  )}
                  <Link to={`/cases?projectId=${project.id}`}>
                    <Button size="sm" variant="secondary" tabIndex={-1}>
                      Open in case registry
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
              emptyTitle="Nothing pending here"
              emptyDescription="Every parcel at this step has been cleared. Show all steps to see the rest."
            />
          </Card>
        </div>
      )}

      {/* ------------------------------------------- documents + audit */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Documents" subtitle="Stored against this project, by stage and case" />
          <DocumentPanel projectId={project.id} stages={project.stages.map((s) => s.name)} initial={data.documents} canUpload={permissions.uploadDocument} canReview={permissions.reviewDocument} onChanged={detail.reload} />
        </Card>
        <Card>
          <CardHeader
            title="Activity"
            subtitle="Edits, stage completions, workflow changes and documents"
            action={
              can('audit.view') ? (
                <Link to={`/audit?q=${project.id}`} className="link text-sm">
                  Full audit trail
                </Link>
              ) : undefined
            }
          />
          <div className="px-5 pb-5">
            <AuditTimeline entries={data.activity} empty="No recorded activity on this project yet." />
          </div>
        </Card>
      </div>

      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-sm text-ink-3">
        {project.budgetCr !== null && (
          <div className="flex gap-1.5">
            <dt>Outlay</dt>
            <dd className="font-medium text-ink num">{formatCrore(project.budgetCr)}</dd>
          </div>
        )}
        <div className="flex gap-1.5">
          <dt>Responsible department</dt>
          <dd className="font-medium text-ink">{summary.responsibleDepartment}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt title="If every remaining step now runs exactly to plan, with no further delay">On-plan finish (no further delay)</dt>
          <dd className="font-medium text-ink num">
            {formatDate(project.lifecycle.onPlanCompletion)}
            {project.lifecycle.onPlanOverrunDays > 0 ? ` · ${project.lifecycle.onPlanOverrunDays} days after target` : ''}
          </dd>
        </div>
        <p className="text-xs sm:ml-auto">Synthetic demonstration record — not a real project.</p>
      </dl>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this project?"
        subtitle={`${project.id} · ${project.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete} loading={busy} disabled={reason.trim().length < 5}>
              Delete project
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">The project is removed from every screen and can be restored from Settings. The deletion and your reason are written to the audit trail.</p>
        <Field label="Reason" required hint="At least 5 characters" className="mt-4">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={cn(inputClass, 'h-auto py-2')} />
        </Field>
        {actionError && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {actionError}
          </p>
        )}
      </Modal>

      <Modal
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        title={`Record “${current.name}” milestone achieved`}
        subtitle={current.milestone}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdvanceOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doAdvance} loading={busy}>
              Complete stage and open {nextStage?.name}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          This marks the step as done for the project as a whole. {current.openCases > 0 ? `The ${parcels(current.openCases)} still pending here stay open and remain on your list until each is cleared.` : ''} Risk is re-scored and the change is audited.
        </p>
        <Field label="Completion date" hint={`Between ${formatDate(current.startDate)} and the snapshot date. Leave blank to use the snapshot date.`} className="mt-4">
          <input type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Note" className="mt-3">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. Gazette notification reference" />
        </Field>
        {actionError && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {actionError}
          </p>
        )}
      </Modal>
    </div>
  );
}
