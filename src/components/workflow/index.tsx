import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Target, TrendingDown, UserCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button } from '@/components/ui';
import { Modal, Field, inputClass } from '@/components/ui/Modal';
import { updateInterventionStatus, updateAlertStatus } from '@/api/client';
import { CATEGORY_LABEL, INTERVENTION_NEXT, INTERVENTION_STATUS_CLASS, INTERVENTION_STATUS_LABEL, SEVERITY_CLASS, ALERT_STATUS_CLASS, humanise } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { AlertItem, CaseRecommendation, InterventionItem, InterventionStatus, Recommendation, Trigger } from '@/data/types';

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  return <Badge className={cn(SEVERITY_CLASS[severity as keyof typeof SEVERITY_CLASS], className)}>{severity}</Badge>;
}

export function TriggerLine({ trigger }: { trigger: Trigger }) {
  const value = typeof trigger.value === 'number' ? (Number.isInteger(trigger.value) ? trigger.value : trigger.value.toFixed(2)) : trigger.value;
  return (
    <p className="font-mono text-[10.5px] text-ink-3">
      trigger · {trigger.source} · {trigger.metric} = {String(value)}
      {trigger.threshold !== null && trigger.operator !== 'top' ? ` (${trigger.operator} ${trigger.threshold})` : ''}
    </p>
  );
}

/** Recommendations with reason, trigger, responsible authority, priority and expected action. */
export function RecommendationList({ items, max = 20, emptyText = 'No rule is triggered for this project right now.' }: { items: Array<Recommendation | CaseRecommendation>; max?: number; emptyText?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return <p className="px-1 py-4 text-[12px] text-ink-3">{emptyText}</p>;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {items.slice(0, max).map((r) => {
        const id = 'id' in r ? r.id : r.code;
        const expanded = open === id;
        return (
          <div key={id} className="bg-surface">
            <button onClick={() => setOpen(expanded ? null : id)} className="flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-surface-2">
              <span className="mt-0.5 text-ink-3">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={r.severity} />
                  <Badge className="border-line bg-surface-2 text-ink-3">{r.priority}</Badge>
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">{CATEGORY_LABEL[r.category] ?? r.category}</span>
                </span>
                <span className="mt-1 block text-[13px] font-bold leading-snug text-ink">{r.title}</span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-2">{r.recommendedAction}</span>
                {r.responsibleAuthority && (
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-ink-3">
                    <UserCheck className="h-3 w-3" /> {r.responsibleAuthority.name}
                  </span>
                )}
                {'impact' in r && r.impact && (
                  <span className={cn('mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]', r.impact.material ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-400' : 'border-line bg-surface-2 text-ink-3')} title={r.impact.basis}>
                    <TrendingDown className="h-3 w-3" />
                    {r.impact.material ? (
                      <>
                        Predicted risk −{r.impact.riskPointsReduction} pts → {r.impact.projectedRiskScore}
                      </>
                    ) : (
                      <>No material change predicted</>
                    )}
                    <span className="text-ink-3">· if {r.impact.change.charAt(0).toLowerCase() + r.impact.change.slice(1)}</span>
                  </span>
                )}
              </span>
            </button>
            {expanded && (
              <div className="space-y-1.5 border-t border-line bg-surface-2 px-10 py-3 text-[11.5px] leading-relaxed text-ink-2">
                <p>
                  <span className="font-semibold text-ink">Reason: </span>
                  {r.reason}
                </p>
                {'trigger' in r && r.trigger && <TriggerLine trigger={r.trigger} />}
                <p>
                  <span className="font-semibold text-ink">Acting role: </span>
                  {humanise(r.assignedRole)}
                </p>
                {'supportingAuthorities' in r && r.supportingAuthorities.length > 0 && (
                  <p>
                    <span className="font-semibold text-ink">Supporting: </span>
                    {r.supportingAuthorities.join('; ')}
                  </p>
                )}
                {'expectedOutcome' in r && r.expectedOutcome && (
                  <p>
                    <span className="font-semibold text-ink">Expected outcome: </span>
                    {r.expectedOutcome}
                  </p>
                )}
                {'caseIds' in r && r.caseIds.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">Cases driving this:</span>
                    {r.caseIds.map((c) => (
                      <Link key={c} to={`/cases/${c}`} className="font-mono text-[11px] text-brand hover:underline">
                        {c}
                      </Link>
                    ))}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Status transition + note for one intervention. */
export function InterventionActions({ item, canUpdate, onChanged }: { item: InterventionItem; canUpdate: boolean; onChanged: (next: InterventionItem) => void }) {
  const [target, setTarget] = useState<InterventionStatus | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsNote = target === 'RESOLVED' || target === 'DISMISSED';

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const { intervention } = await updateInterventionStatus(item.id, { status: target, note: note || undefined });
      onChanged(intervention);
      setTarget(null);
      setNote('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge className={INTERVENTION_STATUS_CLASS[item.status]}>{INTERVENTION_STATUS_LABEL[item.status]}</Badge>
      {canUpdate &&
        INTERVENTION_NEXT[item.status].map((s) => (
          <Button key={s} size="sm" variant={s === 'RESOLVED' ? 'primary' : 'outline'} onClick={() => setTarget(s)}>
            {s === 'OPEN' ? 'Reopen' : INTERVENTION_STATUS_LABEL[s]}
          </Button>
        ))}
      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={`Mark as ${target ? INTERVENTION_STATUS_LABEL[target].toLowerCase() : ''}`}
        subtitle={item.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || (needsNote && note.trim().length < 3)}>
              {busy ? 'Saving…' : 'Confirm'}
            </Button>
          </>
        }
      >
        <Field label={needsNote ? 'Note (required)' : 'Note (optional)'} hint="Recorded in the audit trail with your name and role.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cn(inputClass, 'h-auto py-2')} placeholder="What was done, or why this is being closed" />
        </Field>
        {error && <p className="mt-2 text-[12px] font-medium text-rose-600">{error}</p>}
      </Modal>
    </div>
  );
}

/** One intervention card, used by the queue and the project page. */
export function InterventionCard({ item, canUpdate, onChanged, showProject = true }: { item: InterventionItem; canUpdate: boolean; onChanged: (next: InterventionItem) => void; showProject?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={item.severity} />
            <Badge className="border-line bg-surface-2 text-ink-3">{item.priority}</Badge>
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">{CATEGORY_LABEL[item.category] ?? item.category}</span>
            {item.overdue && (
              <Badge className="border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-3 w-3" /> overdue
              </Badge>
            )}
            {(item.escalationLevel ?? 0) > 0 && (
              <Badge className="border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <ArrowUpRight className="h-3 w-3" /> escalated to {item.escalatedToLabel}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-[13.5px] font-bold leading-snug text-ink">{item.title}</p>
          {showProject && (
            <Link to={`/projects/${item.projectId}`} className="text-[12px] font-semibold text-brand hover:underline">
              {item.projectName}
            </Link>
          )}
          <p className="mt-0.5 text-[11px] text-ink-3">
            {item.district}, {item.state} · {item.stage} · risk {item.risk_score}%
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{item.recommended_action}</p>
        </div>
        <div className="min-w-[220px] max-w-sm flex-1 text-[11.5px]">
          <p className="label-xs">Responsible</p>
          <p className="mt-0.5 font-semibold leading-snug text-ink">{item.responsible_department}</p>
          <p className="mt-1 text-ink-3">
            Assigned to {item.assigneeName ? `${item.assigneeName} (${item.assignedRoleLabel})` : item.assignedRoleLabel}
          </p>
          <p className="mt-1 flex items-center gap-1 text-ink-3 num">
            <CalendarClock className="h-3 w-3" /> raised {formatDate(item.created_at)} · due {formatDate(item.due_date)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <InterventionActions item={item} canUpdate={canUpdate} onChanged={onChanged} />
          <button onClick={() => setOpen((o) => !o)} className="text-[11px] font-semibold text-ink-3 hover:text-brand">
            {open ? 'Hide detail' : 'Why & trigger'}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-1.5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[11.5px] leading-relaxed text-ink-2">
          <p>
            <span className="font-semibold text-ink">Reason: </span>
            {item.reason}
          </p>
          <TriggerLine trigger={item.trigger} />
          {item.supportingAuthorities.length > 0 && (
            <p>
              <span className="font-semibold text-ink">Supporting: </span>
              {item.supportingAuthorities.join('; ')}
            </p>
          )}
          <p>
            <span className="font-semibold text-ink">Expected outcome: </span>
            {item.expectedOutcome}
          </p>
          {item.caseIds.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5">
              <Target className="h-3 w-3" /> Cases:
              {item.caseIds.map((c) => (
                <Link key={c} to={`/cases/${c}`} className="font-mono text-brand hover:underline">
                  {c}
                </Link>
              ))}
            </p>
          )}
          {item.note && (
            <p>
              <span className="font-semibold text-ink">Latest note: </span>
              {item.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AlertRow({ alert, canUpdate, onChanged }: { alert: AlertItem; canUpdate: boolean; onChanged: (a: AlertItem) => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (status: string) => {
    setBusy(true);
    try {
      onChanged((await updateAlertStatus(alert.id, status)).alert);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn('flex flex-wrap items-start gap-4 px-5 py-3.5', alert.status === 'UNREAD' && 'bg-brand/[0.03]')}>
      <div className="min-w-[260px] flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={alert.severity} />
          <Badge className={ALERT_STATUS_CLASS[alert.status]}>{humanise(alert.status)}</Badge>
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">{CATEGORY_LABEL[alert.category] ?? alert.category}</span>
        </div>
        <Link to={alert.link} onClick={() => alert.status === 'UNREAD' && canUpdate && void set('ACKNOWLEDGED')} className="mt-1 block text-[13px] font-bold leading-snug text-ink hover:text-brand">
          {alert.title}
        </Link>
        <p className="text-[11.5px] text-ink-3">
          <Link to={`/projects/${alert.projectId}`} className="font-semibold text-ink-2 hover:text-brand">
            {alert.project.name}
          </Link>{' '}
          · {alert.district}, {alert.state}
          {alert.case && (
            <>
              {' '}
              · case{' '}
              <Link to={`/cases/${alert.case}`} className="font-mono text-brand hover:underline">
                {alert.case}
              </Link>
            </>
          )}
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">{alert.reason}</p>
        <TriggerLine trigger={alert.triggered_by} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
        <p className="text-[10.5px] text-ink-3 num">{formatDate(alert.date)}</p>
        <p className="max-w-[220px] text-[11px] text-ink-3">{alert.responsibleAuthority}</p>
        {canUpdate && alert.status !== 'RESOLVED' && (
          <div className="flex gap-1.5">
            {alert.status === 'UNREAD' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => set('ACKNOWLEDGED')}>
                Acknowledge
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => set('RESOLVED')} className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
            </Button>
          </div>
        )}
        {canUpdate && alert.status === 'RESOLVED' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => set('UNREAD')}>
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}
