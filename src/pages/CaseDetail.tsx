import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ClipboardCheck, FlaskConical, MapPin, Users } from 'lucide-react';
import { RecommendationList } from '@/components/workflow';
import { AuditTimeline } from '@/components/workflow/AuditTimeline';
import { DocumentPanel } from '@/components/documents/DocumentPanel';
import { Modal, Field, inputClass } from '@/components/ui/Modal';
import { Badge, Button, Card, CardHeader, DemoDataBadge, EmptyState, InfoDot, PageSkeleton, Select, Skeleton } from '@/components/ui';
import { ErrorState, KeyValue, QualityBadge, RiskMeter, RiskVerdict } from '@/components/ui/primitives';
import { ContributorBars } from '@/components/explain/Contributors';

// three.js loads only when the 3D explanation is shown
const ExplainOrbit3D = lazy(() => import('@/components/three/ExplainOrbit3D'));
const webgl2 = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();
import { STAGE_STATUS_CLASS, STAGE_STATUS_LABEL, humanise } from '@/lib/status';
import { ParcelPosition } from '@/components/lifecycle/ParcelPosition';
import { OUTCOME_CLASS } from '@/lib/risk';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useApi } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchCase, fetchDocuments, updateCaseStatus } from '@/api/client';
import { ParcelSources } from '@/components/integration/ParcelSources';
import { OutcomeRecorder } from '@/components/workflow/OutcomeRecorder';

export default function CaseDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useApi((signal) => fetchCase(id, signal), [id]);
  const { can } = useAuth();
  const caseDocs = useApi((signal) => fetchDocuments({ caseId: id }, signal), [id]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState('UNDER_REVIEW');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [explainView, setExplainView] = useState<'3d' | 'bars'>(webgl2 ? '3d' : 'bars');

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} title="Could not load this case" />;
  if (detail.loading || !detail.data) return <PageSkeleton blocks={2} />;

  const { case: c, explanation, recommendations, network, stage, project, permissions } = detail.data;
  const pendingNodes = network.nodes.filter((n) => c.pendingDependencies.includes(n.code));
  const saveStatus = async () => {
    setBusy(true);
    setStatusError(null);
    try {
      await updateCaseStatus(c.caseId, { status: nextStatus, note });
      setStatusOpen(false);
      setNote('');
      detail.reload();
    } catch (err) {
      setStatusError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const overdue = c.daysToMilestone < 0;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------ header */}
      <header>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-ink-3">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 rounded hover:text-ink focus-ring">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span aria-hidden className="px-1">
            /
          </span>
          <Link to="/cases" className="hover:text-ink">
            Cases
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span className="font-mono text-xs text-ink-2">{c.caseId}</span>
        </nav>

        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {c.village}, {c.tehsil} {c.subDistrictLabel}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {c.district}, {c.state}
              </span>
              <Link to={`/projects/${c.projectId}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                <ClipboardCheck className="h-3.5 w-3.5" /> {c.projectName}
              </Link>
              <span className="inline-flex items-center gap-1.5 num">
                <Users className="h-3.5 w-3.5" /> {c.owners ?? '—'} owners · {c.affectedFamilies ?? '—'} families
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge>Parcel {c.parcelId}</Badge>
              <Badge>Survey {c.surveyNumber}</Badge>
              <Badge>Case file: {humanise(c.caseStatus ?? 'OPEN')}</Badge>
              <Badge>Step: {c.stage}</Badge>
              {c.labelObserved && <Badge className={OUTCOME_CLASS[c.outcome]}>Outcome: {c.outcome}</Badge>}
              <DemoDataBadge />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to={`/predict?project=${c.projectId}`}>
              <Button size="sm" variant="secondary" tabIndex={-1}>
                <FlaskConical className="h-3.5 w-3.5" /> Scenario for this project
              </Button>
            </Link>
            {permissions.updateCase && can('case.update') && (
              <Button size="sm" onClick={() => setStatusOpen(true)}>
                Update case status
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* --------------------------------------------- risk, why, holding */}
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="flex flex-col p-5">
          <RiskVerdict
            level={c.riskBand}
            score={c.riskScore}
            label={c.labelObserved ? 'Back-test — predicted risk for a milestone that has closed' : 'Probability the next milestone slips by more than 30 days'}
            detail={
              <>
                {c.stage} due {formatDate(c.milestoneDueDate)} ·{' '}
                <span className={cn('num', overdue && 'font-medium text-red-700 dark:text-red-300')}>{overdue ? `${Math.abs(c.daysToMilestone)} days overdue` : `${c.daysToMilestone} days left`}</span>
              </>
            }
          />
          {c.labelObserved && (
            <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3.5 py-3">
              <p className="text-xs text-ink-3">Observed outcome</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{c.outcome === 'Delayed' ? `Milestone missed${c.actualDelayDays !== null ? ` by ${c.actualDelayDays} days` : ' by more than 30 days'}` : 'Milestone met within the 30-day tolerance'}</p>
              <p className="mt-0.5 text-xs text-ink-3">This case is part of the evaluation history, so its prediction can be checked against what happened.</p>
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
            <QualityBadge score={c.dataQuality} />
            <span className="inline-flex items-center gap-1 text-xs text-ink-3">
              Assessed {formatDate(c.assessmentDate)}
              <InfoDot text="Probability that this case's next milestone slips by more than 30 days, from the deployed gradient-boosted ensemble." />
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Why this parcel is at risk"
            subtitle={`What raised or lowered its score · method: ${explanation.basis}`}
            action={
              webgl2 ? (
                <div className="inline-flex rounded-lg bg-surface-3 p-0.5" role="radiogroup" aria-label="Explanation view">
                  {(
                    [
                      ['3d', '3D'],
                      ['bars', 'Bars'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={explainView === id}
                      onClick={() => setExplainView(id)}
                      className={cn('h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-ring', explainView === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : undefined
            }
          />
          <div className="px-5 pb-5">
            {explainView === '3d' ? (
              <Suspense fallback={<div className="grid h-[300px] place-items-center rounded-xl border border-line text-sm text-ink-3">Loading 3D view…</div>}>
                <ExplainOrbit3D contributors={c.contributors} band={c.riskBand} unit={explanation.unit} />
              </Suspense>
            ) : (
              <ContributorBars contributors={c.contributors} max={6} showCaveat={false} />
            )}
            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">{explanation.caveat}</p>
          </div>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="What is holding it" subtitle="Case-level rules and pending department actions, with owners" />
          <div className="space-y-4 px-5 pb-5">
            <RecommendationList items={recommendations} max={6} emptyText="No case-level rule is triggered — nothing specific is holding this parcel." />
            {c.caseStatusNote && (
              <p className="text-xs text-ink-3">
                Latest status note: “{c.caseStatusNote}” — {c.caseStatusUpdatedBy}
              </p>
            )}
            <OutcomeRecorder caseId={c.caseId} dueDate={c.milestoneDueDate} today={detail.data.outcomeRecordingDate ?? c.assessmentDate} canRecord={Boolean(permissions.recordOutcome)} recorded={detail.data.recordedOutcome} onRecorded={detail.reload} />
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------- parcel facts */}
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3 xl:grid-cols-6 [&>*]:bg-surface">
        {[
          { label: 'Parcel area', value: `${c.areaHa} ha`, hint: c.landType },
          { label: 'Ownership', value: c.ownership, hint: `${c.owners ?? '—'} recorded owners` },
          { label: 'Compensation', value: `${c.compensationCompletionPct}%`, hint: c.compensationStatus },
          { label: 'Possession', value: c.possessionStatus, hint: `R&R: ${c.rrStatus}` },
          { label: 'Legal', value: c.legalCases === 0 ? 'Clear' : `${c.legalCases} case${c.legalCases > 1 ? 's' : ''}`, hint: c.disputeComplexity },
          { label: 'Last action', value: `${c.inactivityDays} days ago`, hint: `Verification ${c.verificationStatus.toLowerCase()}` },
        ].map((m) => (
          <div key={m.label} className="px-4 py-3.5">
            <p className="text-xs text-ink-3">{m.label}</p>
            <p className="mt-0.5 text-md font-semibold text-ink num">{m.value}</p>
            <p className="truncate text-xs text-ink-3" title={m.hint}>
              {m.hint}
            </p>
          </div>
        ))}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Pending department actions"
            subtitle={`${c.pendingDependencies.length} of ${c.dependencyCount ?? network.dependencyCount} dependencies have an action pending on this parcel${c.approvalDelayDays ? ` · approvals outstanding ${c.approvalDelayDays} days` : ''}`}
          />
          {pendingNodes.length === 0 ? (
            <EmptyState title="Nothing pending" description="No department action is outstanding on this parcel." className="border-t border-line py-8" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {pendingNodes.map((n) => (
                <li key={n.code} className="px-5 py-3">
                  <p className="text-xs text-ink-3">
                    {n.role}
                    {n.gate ? ' · gates this stage' : ''}
                  </p>
                  <p className="text-sm font-medium text-ink">{n.name}</p>
                  <p className="text-sm text-ink-2">{n.pendingActionText}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Step and schedule" subtitle="Where this parcel stands, and how much time it has" />
          <div className="space-y-4 px-5 pb-5">
            <ParcelPosition parcelStageIndex={c.stageIndex} projectStageIndex={project.currentStageIndex} stage={stage} open={!c.labelObserved} />
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
              <span>For the whole project, {stage.name} is</span>
              <Badge className={STAGE_STATUS_CLASS[stage.status]}>{STAGE_STATUS_LABEL[stage.status]}</Badge>
              <span>· this parcel’s case file is</span>
              <Badge>{humanise(c.caseStatus ?? 'OPEN')}</Badge>
            </div>
            <KeyValue
              columns={2}
              rows={[
                { label: 'This parcel’s step', value: `${c.stage} (${c.stageIndex + 1} of 9)` },
                { label: 'Milestone', value: c.milestone ?? '—' },
                { label: 'Step started', value: formatDate(c.stageStartDate) },
                { label: 'Days allowed', value: `${c.expectedStageDays} d` },
                { label: 'Days elapsed', value: `${c.elapsedStageDays} d` },
                { label: 'Time consumed', value: `${Math.round((c.elapsedStageDays / Math.max(1, c.expectedStageDays)) * 100)}%`, tone: c.elapsedStageDays / Math.max(1, c.expectedStageDays) > 0.85 ? 'text-red-700 dark:text-red-300' : undefined },
                { label: 'Milestone due', value: formatDate(c.milestoneDueDate) },
                { label: overdue ? 'Overdue by' : 'Time remaining', value: `${Math.abs(c.daysToMilestone)} d`, tone: overdue ? 'text-red-700 dark:text-red-300' : undefined },
              ]}
            />
            <RiskMeter score={c.riskScore} level={c.riskBand} label="Predicted delay risk (case bands)" />
            <p className="text-xs text-ink-3">
              Project:{' '}
              <Link to={`/projects/${project.id}`} className="link">
                {project.name}
              </Link>{' '}
              · {project.framework} · primary authority {project.primaryAuthority}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Case record" subtitle="Fields the model consumes, as recorded" />
        <div className="px-5 pb-5">
          <KeyValue
            columns={4}
            rows={[
              { label: 'Compensation status', value: c.compensationStatus },
              { label: 'Award band', value: c.compensationBand ?? 'Not recorded' },
              { label: 'Compensation pending', value: `${c.compensationPendingDays} d` },
              { label: 'Document completeness', value: c.documentCompleteness !== null ? `${c.documentCompleteness}%` : 'Not recorded' },
              { label: 'Verification', value: c.verificationStatus },
              { label: 'Approval', value: c.approvalStatus },
              { label: 'Stakeholder responsiveness', value: c.stakeholderResponsiveness ?? 'Not recorded' },
              { label: 'Dept. response time', value: c.departmentResponseDays !== null ? `${c.departmentResponseDays} d` : 'Not recorded' },
              { label: 'R&R progress', value: c.rrRequired ? `${c.rrProgressPct ?? '—'}%` : 'Not applicable' },
              { label: 'R&R cases', value: formatNumber(c.rehabilitationCases) },
              { label: 'Stage slip history', value: `${(c.historicalStageDelayRate * 100).toFixed(0)}%` },
              { label: 'District delay history', value: c.districtDelayRate !== null ? `${(c.districtDelayRate * 100).toFixed(0)}%` : '—' },
            ]}
          />
          <p className="mt-4 text-xs text-ink-3">Fields shown as “Not recorded” are genuinely blank in the source record. The model imputes them and the case&rsquo;s data-quality score reflects the gap.</p>
        </div>
      </Card>

      <ParcelSources caseId={c.caseId} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Documents" subtitle="Stored against this case" />
          {caseDocs.data ? (
            <DocumentPanel projectId={c.projectId} caseId={c.caseId} stages={[c.stage]} initial={caseDocs.data} canUpload={can('document.upload')} canReview={can('document.review')} onChanged={detail.reload} />
          ) : (
            <div className="space-y-2 px-5 pb-5">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Activity" subtitle="Status changes, outcomes and documents on this case" />
          <div className="px-5 pb-5">
            <AuditTimeline entries={detail.data.activity} empty="No recorded activity on this case." />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Feature-level contributions" subtitle={`${explanation.unit}${explanation.baseValue !== null ? ` · model base value ${explanation.baseValue}` : ''}`} />
        {(c.featureContributions ?? []).length === 0 ? (
          <EmptyState title="No stored contributions" description="This case has no feature-level attribution on record." className="border-t border-line" />
        ) : (
          <div className="relative overflow-x-auto border-t border-line">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-surface-2 text-xs text-ink-3">
                  <th scope="col" className="py-2 pl-5 pr-3 text-left font-medium">Feature</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Factor group</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Direction</th>
                  <th scope="col" className="py-2 pl-3 pr-5 text-right font-medium">Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(c.featureContributions ?? []).map((f) => (
                  <tr key={f.label}>
                    <td className="py-2.5 pl-5 pr-3 text-sm text-ink">{f.label}</td>
                    <td className="px-3 py-2.5 text-sm text-ink-3">{f.group}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={f.direction === 'increases' ? 'danger' : 'success'}>{f.direction === 'increases' ? 'Raises risk' : 'Lowers risk'}</Badge>
                    </td>
                    <td className="py-2.5 pl-3 pr-5 text-right text-sm font-medium text-ink num">
                      {f.value > 0 ? '+' : ''}
                      {f.value.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Update case status"
        subtitle={c.caseId}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveStatus} loading={busy} disabled={note.trim().length < 5}>
              Save status
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="Status" value={nextStatus} onChange={setNextStatus} options={['OPEN', 'UNDER_REVIEW', 'ESCALATED', 'ON_HOLD', 'RESOLVED_PENDING_RESCORE'].map((v) => ({ label: humanise(v), value: v }))} />
          <Field label="Note" required hint="At least 5 characters. Recorded in the audit trail; model scores refresh at the next retraining.">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cn(inputClass, 'h-auto py-2')} />
          </Field>
          {statusError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {statusError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
