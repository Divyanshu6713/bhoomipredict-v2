import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeIndianRupee,
  CalendarClock,
  ClipboardCheck,
  Gavel,
  MapPin,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Network,
  FileStack,
  History,
} from 'lucide-react';
import { RecommendationList } from '@/components/workflow';
import { AuditTimeline } from '@/components/workflow/AuditTimeline';
import { DocumentPanel } from '@/components/documents/DocumentPanel';
import { Modal, Field, inputClass } from '@/components/ui/Modal';
import { Select, DemoDataBadge } from '@/components/ui';
import { STAGE_STATUS_CLASS, STAGE_STATUS_LABEL, humanise } from '@/lib/status';
import { fetchDocuments, updateCaseStatus } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/cn';
import { Badge, Card, CardHeader, Button, SkeletonCard, InfoDot } from '@/components/ui';
import { ErrorState, KeyValue, QualityBadge, RiskMeter } from '@/components/ui/primitives';
import { ContributorBars } from '@/components/explain/Contributors';
import { RiskGauge } from '@/components/charts';
import { OUTCOME_CLASS, RISK_HEX } from '@/lib/risk';
import { formatDate, formatNumber } from '@/lib/format';
import { useApi } from '@/hooks';
import { fetchCase } from '@/api/client';
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

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} title="Could not load this case" />;
  if (detail.loading || !detail.data) return <SkeletonCard lines={10} />;

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
    <div className="space-y-4">
      <Card className="animate-fade-up overflow-hidden">
        <div className="border-b border-line bg-navy-900 px-5 py-5 grid-lines">
          <button
            onClick={() => navigate(-1)}
            className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/50 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11.5px] font-semibold text-white/45">{c.caseId}</span>
                <Badge className="border-white/15 bg-white/10 text-white/70">Parcel {c.parcelId}</Badge>
                <Badge className="border-white/15 bg-white/10 text-white/70">Survey {c.surveyNumber}</Badge>
                <Badge className="border-white/15 bg-white/10 text-white/80">Case status: {humanise(c.caseStatus ?? 'OPEN')}</Badge>
                <DemoDataBadge />
                <Badge className={OUTCOME_CLASS[c.outcome]}>
                  {c.labelObserved ? `Outcome: ${c.outcome}` : 'Milestone open'}
                </Badge>
              </div>
              <h2 className="mt-2 font-display text-[21px] font-extrabold leading-tight tracking-tight text-white sm:text-[25px]">
                {c.village}, {c.tehsil} {c.subDistrictLabel}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/50">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {c.district}, {c.state}
                </span>
                <Link to={`/projects/${c.projectId}`} className="flex items-center gap-1.5 hover:text-white">
                  <ClipboardCheck className="h-3.5 w-3.5" /> {c.projectName}
                </Link>
                <span className="flex items-center gap-1.5 num">
                  <Users className="h-3.5 w-3.5" /> {c.owners ?? '—'} owners · {c.affectedFamilies ?? '—'} families
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <div
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: `${RISK_HEX[c.riskBand]}55`, background: `${RISK_HEX[c.riskBand]}1a` }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Predicted delay risk</p>
                <p className="mt-1 font-display text-[30px] font-extrabold leading-none num" style={{ color: RISK_HEX[c.riskBand] }}>
                  {c.riskScore}%
                </p>
                <p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: RISK_HEX[c.riskBand] }}>
                  {c.riskBand}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Next milestone</p>
                <p className="mt-1 font-display text-[14px] font-extrabold leading-tight text-white">{c.stage}</p>
                <p className={cn('mt-1 text-[10.5px] num', overdue ? 'font-bold text-rose-300' : 'text-white/50')}>
                  due {formatDate(c.milestoneDueDate)} ·{' '}
                  {overdue ? `${Math.abs(c.daysToMilestone)}d overdue` : `${c.daysToMilestone}d left`}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {[
            { label: 'Parcel area', value: `${c.areaHa} ha`, hint: c.landType },
            { label: 'Ownership', value: c.ownership, hint: `${c.owners ?? '—'} recorded owners` },
            { label: 'Compensation', value: `${c.compensationCompletionPct}%`, hint: c.compensationStatus },
            { label: 'Possession', value: c.possessionStatus, hint: `R&R: ${c.rrStatus}` },
            { label: 'Legal', value: c.legalCases === 0 ? 'Clear' : `${c.legalCases} case${c.legalCases > 1 ? 's' : ''}`, hint: c.disputeComplexity },
            { label: 'Last action', value: `${c.inactivityDays}d ago`, hint: `verification ${c.verificationStatus.toLowerCase()}` },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-line bg-surface-2 p-3.5">
              <p className="label-xs">{m.label}</p>
              <p className="mt-1.5 font-display text-[16px] font-extrabold leading-tight text-ink num">{m.value}</p>
              <p className="mt-0.5 text-[10.5px] text-ink-3">{m.hint}</p>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="animate-fade-up">
          <CardHeader
            title="Predicted milestone risk"
            subtitle={c.labelObserved ? 'Back-test: this milestone has already closed' : 'Live prediction for an open milestone'}
            icon={<ShieldAlert className="h-4 w-4" />}
            action={<InfoDot text="Probability that this case's next milestone slips by more than 30 days, from the deployed gradient-boosted ensemble." />}
          />
          <div className="grid place-items-center px-5 pb-5">
            <RiskGauge score={c.riskScore} label={c.riskBand} sublabel={`assessed ${formatDate(c.assessmentDate)}`} color={RISK_HEX[c.riskBand]} />
            {c.labelObserved && (
              <div className="mt-4 w-full rounded-xl border border-line bg-surface-2 p-3.5">
                <p className="label-xs">Observed outcome</p>
                <p className="mt-1.5 text-[13px] font-bold text-ink">
                  {c.outcome === 'Delayed'
                    ? `Milestone missed${c.actualDelayDays !== null ? ` by ${c.actualDelayDays} days` : ' by more than 30 days'}`
                    : 'Milestone met within the 30-day tolerance'}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                  This case sits in the evaluation history, so its prediction can be checked against what happened.
                </p>
              </div>
            )}
            <div className="mt-4 w-full">
              <QualityBadge score={c.dataQuality} />
            </div>
          </div>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <CardHeader title="Why is this case at risk?" subtitle={explanation.basis} icon={<Sparkles className="h-4 w-4" />} />
          <div className="px-5 pb-5">
            <ContributorBars contributors={c.contributors} max={6} showCaveat={false} />
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">{explanation.caveat}</p>
          </div>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '120ms' }}>
          <CardHeader title="What is holding this case" subtitle="Case-level rules and pending department actions, with owners" icon={<ClipboardCheck className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <RecommendationList items={recommendations} max={6} emptyText="No case-level trigger holds." />
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label-xs">Case status</p>
              <p className="mt-1 text-[13px] font-bold text-ink">{humanise(c.caseStatus ?? 'OPEN')}</p>
              {c.caseStatusNote && <p className="mt-0.5 text-[11.5px] text-ink-2">“{c.caseStatusNote}” — {c.caseStatusUpdatedBy}</p>}
              {permissions.updateCase && can('case.update') && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setStatusOpen(true)}>
                  Update case status
                </Button>
              )}
            </div>
            <OutcomeRecorder caseId={c.caseId} dueDate={c.milestoneDueDate} today={detail.data.outcomeRecordingDate ?? c.assessmentDate} canRecord={Boolean(permissions.recordOutcome)} recorded={detail.data.recordedOutcome} onRecorded={detail.reload} />
            <Link to={`/predict?project=${c.projectId}`} className="block">
              <Button className="w-full gap-2">
                <TrendingUp className="h-4 w-4" /> Scenario scoring for this project
              </Button>
            </Link>
            <Link to={`/projects/${c.projectId}`} className="block">
              <Button variant="outline" className="w-full">
                Open project intelligence
              </Button>
            </Link>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="animate-fade-up">
          <CardHeader title="Stage vs case" subtitle="The project's statutory stage status is separate from this case's resolution" icon={<CalendarClock className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              <Badge className={STAGE_STATUS_CLASS[stage.status]}>
                Project stage "{stage.name}": {STAGE_STATUS_LABEL[stage.status]}
              </Badge>
              <Badge>Case: {humanise(c.caseStatus ?? 'OPEN')}</Badge>
              <Badge>Parcel possession: {c.possessionStatus}</Badge>
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-2">{stage.explanation}</p>
            {stage.status === 'COMPLETED' && !c.labelObserved && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] text-ink-2">
                This is one of the {formatNumber(stage.openCases)} residual cases still open in a stage the project has already completed.
              </p>
            )}
            <p className="text-[11px] text-ink-3">
              Project: <Link to={`/projects/${project.id}`} className="font-semibold text-brand hover:underline">{project.name}</Link> · {project.framework} · primary authority {project.primaryAuthority}
            </p>
          </div>
        </Card>
        <Card className="animate-fade-up">
          <CardHeader title="Pending department actions" subtitle={`${c.pendingDependencies.length} of ${c.dependencyCount ?? network.dependencyCount} dependencies have an action pending on this parcel${c.approvalDelayDays ? ` · approvals outstanding ${c.approvalDelayDays} days` : ''}`} icon={<Network className="h-4 w-4" />} />
          <div className="divide-y divide-line border-t border-line">
            {pendingNodes.map((n) => (
              <div key={n.code} className="px-5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{n.role}{n.gate ? ' · gates stage' : ''}</p>
                <p className="text-[12.5px] font-semibold text-ink">{n.name}</p>
                <p className="text-[11.5px] text-ink-2">{n.pendingActionText}</p>
              </div>
            ))}
            {pendingNodes.length === 0 && <p className="px-5 py-6 text-center text-[12px] text-ink-3">No department action is pending on this parcel.</p>}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="animate-fade-up">
          <CardHeader title="Case documents" icon={<FileStack className="h-4 w-4" />} />
          {caseDocs.data ? <DocumentPanel projectId={c.projectId} caseId={c.caseId} stages={[c.stage]} initial={caseDocs.data} canUpload={can('document.upload')} canReview={can('document.review')} onChanged={detail.reload} /> : <p className="px-5 pb-5 text-[12px] text-ink-3">Loading documents…</p>}
        </Card>
        <Card className="animate-fade-up">
          <CardHeader title="Case activity" icon={<History className="h-4 w-4" />} />
          <div className="px-5 pb-5">
            <AuditTimeline entries={detail.data.activity} empty="No recorded activity on this case." />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="animate-fade-up">
          <CardHeader title="Stage and schedule" subtitle="Where this case sits in the statutory lifecycle" icon={<CalendarClock className="h-4 w-4" />} />
          <div className="px-5 pb-5">
            <KeyValue
              columns={2}
              rows={[
                { label: 'Current stage', value: `${c.stage} (${c.stageIndex + 1}/9)` },
                { label: 'Milestone', value: c.milestone ?? '—' },
                { label: 'Stage started', value: formatDate(c.stageStartDate) },
                { label: 'Days allowed', value: `${c.expectedStageDays}d` },
                { label: 'Days elapsed', value: `${c.elapsedStageDays}d` },
                {
                  label: 'Time consumed',
                  value: `${Math.round((c.elapsedStageDays / Math.max(1, c.expectedStageDays)) * 100)}%`,
                  tone:
                    c.elapsedStageDays / Math.max(1, c.expectedStageDays) > 0.85
                      ? 'text-rose-600 dark:text-rose-400'
                      : undefined,
                },
                { label: 'Milestone due', value: formatDate(c.milestoneDueDate) },
                {
                  label: overdue ? 'Overdue by' : 'Time remaining',
                  value: `${Math.abs(c.daysToMilestone)}d`,
                  tone: overdue ? 'text-rose-600 dark:text-rose-400' : undefined,
                },
              ]}
            />
            <div className="mt-4">
              <RiskMeter score={c.riskScore} level={c.riskBand} label="Predicted delay risk" />
            </div>
          </div>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <CardHeader title="Case record" subtitle="Fields the model consumes, as recorded" icon={<BadgeIndianRupee className="h-4 w-4" />} />
          <div className="px-5 pb-5">
            <KeyValue
              columns={2}
              rows={[
                { label: 'Compensation status', value: c.compensationStatus },
                { label: 'Award band', value: c.compensationBand ?? 'not recorded' },
                { label: 'Compensation pending', value: `${c.compensationPendingDays}d` },
                { label: 'Document completeness', value: c.documentCompleteness !== null ? `${c.documentCompleteness}%` : 'not recorded' },
                { label: 'Verification', value: c.verificationStatus },
                { label: 'Approval', value: c.approvalStatus },
                { label: 'Stakeholder responsiveness', value: c.stakeholderResponsiveness ?? 'not recorded' },
                { label: 'Dept. response time', value: c.departmentResponseDays !== null ? `${c.departmentResponseDays}d` : 'not recorded' },
                { label: 'R&R progress', value: c.rrRequired ? `${c.rrProgressPct ?? '—'}%` : 'not applicable' },
                { label: 'R&R cases', value: formatNumber(c.rehabilitationCases) },
                { label: 'Stage slip history', value: `${(c.historicalStageDelayRate * 100).toFixed(0)}%` },
                { label: 'District delay history', value: c.districtDelayRate !== null ? `${(c.districtDelayRate * 100).toFixed(0)}%` : '—' },
              ]}
            />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              Fields shown as &ldquo;not recorded&rdquo; are genuinely blank in the source record. The model imputes them
              and the case's data-quality score reflects the gap.
            </p>
          </div>
        </Card>
      </section>

      <ParcelSources caseId={c.caseId} />

      <Card className="animate-fade-up">
        <CardHeader
          title="Feature-level contributions"
          subtitle={`${explanation.unit}${explanation.baseValue !== null ? ` · model base value ${explanation.baseValue}` : ''}`}
          icon={<Gavel className="h-4 w-4" />}
        />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-line">
                {['Feature', 'Factor group', 'Direction', 'Contribution'].map((h) => (
                  <th key={h} className="py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(c.featureContributions ?? []).map((f) => (
                <tr key={f.label} className="border-b border-line/70 last:border-0">
                  <td className="py-2.5 text-[12.5px] font-semibold text-ink">{f.label}</td>
                  <td className="py-2.5 text-[12px] text-ink-2">{f.group}</td>
                  <td className="py-2.5">
                    <Badge
                      className={
                        f.direction === 'increases'
                          ? 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {f.direction === 'increases' ? 'raises risk' : 'lowers risk'}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-[12.5px] font-bold text-ink num">
                    {f.value > 0 ? '+' : ''}
                    {f.value.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(c.featureContributions ?? []).length === 0 && (
            <p className="py-6 text-center text-[12px] text-ink-3">No stored contributions for this case.</p>
          )}
        </div>
      </Card>
      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Update case status"
        subtitle={c.caseId}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button onClick={saveStatus} disabled={busy || note.trim().length < 5}>{busy ? 'Saving…' : 'Save'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select label="Status" value={nextStatus} onChange={setNextStatus} options={['OPEN', 'UNDER_REVIEW', 'ESCALATED', 'ON_HOLD', 'RESOLVED_PENDING_RESCORE'].map((v) => ({ label: humanise(v), value: v }))} />
          <Field label="Note (required)" hint="Recorded in the audit trail. Model scores for the case refresh at the next retraining.">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cn(inputClass, 'h-auto py-2')} />
          </Field>
          {statusError && <p className="text-[12px] font-medium text-rose-600">{statusError}</p>}
        </div>
      </Modal>
    </div>
  );
}
