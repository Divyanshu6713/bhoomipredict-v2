import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CalendarClock, CheckCircle2, ChevronRight, Filter, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, Tabs } from '@/components/ui';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { ContributorChips } from '@/components/explain/Contributors';
import { formatDate, formatNumber } from '@/lib/format';
import { useApi, useFilters } from '@/hooks';
import { fetchQueue } from '@/api/client';
import type { QueueItem } from '@/data/types';

/**
 * Early warnings are not a separate data source — they are the top of the
 * intervention queue, framed as things to look at this fortnight. Keeping one
 * source means an officer can never see a warning here that the queue disagrees
 * with.
 */
const severityOf = (item: QueueItem) =>
  item.riskBand === 'Critical' ? 'Critical' : item.riskBand === 'High' ? 'High' : item.overdueCases > 0 ? 'Medium' : 'Info';

const SEVERITY_CLASS: Record<string, string> = {
  Critical: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
  High: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25',
  Medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
  Info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25',
};

export default function Alerts() {
  const { values, set } = useFilters({ scope: 'overdue' });
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const query = useMemo(
    () => ({
      pageSize: 40,
      queueSort: values.scope === 'deadline' ? 'deadline' : 'urgency',
      overdue: values.scope === 'overdue' ? '1' : undefined,
      risk: values.scope === 'critical' ? 'Critical' : undefined,
    }),
    [values.scope],
  );

  const queue = useApi((signal) => fetchQueue(query, signal), [JSON.stringify(query)]);
  const items = queue.data?.items ?? [];

  const counts = useMemo(() => {
    const out: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Info: 0 };
    for (const i of items) out[severityOf(i)]++;
    return out;
  }, [items]);

  const toggle = (id: string) =>
    setAcknowledged((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (queue.error) return <ErrorState error={queue.error} onRetry={queue.reload} />;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(['Critical', 'High', 'Medium', 'Info'] as const).map((sev, i) => (
          <Card key={sev} className="p-4 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-center justify-between">
              <p className="label-xs">{sev} warnings</p>
              <Badge className={SEVERITY_CLASS[sev]}>{sev}</Badge>
            </div>
            <p className="mt-2 font-display text-[24px] font-extrabold leading-none text-ink num">{counts[sev]}</p>
          </Card>
        ))}
      </section>

      <Card className="animate-fade-up">
        <CardHeader
          title="Early warnings"
          subtitle="Milestones the model flags for review, drawn from the same scoring that drives the intervention queue"
          icon={<Bell className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-2">
              <DemoDataBadge className="hidden sm:inline-flex" />
              <Tabs
                tabs={[
                  { id: 'overdue', label: 'Past deadline' },
                  { id: 'critical', label: 'Critical only' },
                  { id: 'deadline', label: 'Next due' },
                ]}
                active={values.scope}
                onChange={(v) => set({ scope: v })}
              />
            </div>
          }
        />

        <div className="divide-y divide-line">
          {items.map((item) => {
            const sev = severityOf(item);
            const ack = acknowledged.has(item.id);
            return (
              <div key={item.id} className={cn('flex flex-wrap items-start gap-4 px-5 py-4 transition-opacity', ack && 'opacity-55')}>
                <span className={cn('mt-0.5 h-fit shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold', SEVERITY_CLASS[sev])}>
                  {sev}
                </span>

                <div className="min-w-[240px] flex-1">
                  <p className="text-[13.5px] font-bold text-ink">
                    {item.stage} milestone at risk — {item.overdueCases > 0 ? `${formatNumber(item.overdueCases)} cases already past deadline` : `${formatNumber(item.openCases)} open cases`}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                    The model puts the {item.stage.toLowerCase()} milestone for{' '}
                    <Link to={`/projects/${item.projectId}`} className="font-semibold text-ink hover:text-brand">
                      {item.projectName}
                    </Link>{' '}
                    at <span className="font-bold text-ink num">{item.riskScore}%</span> predicted risk. Leading
                    contributor: {item.topContributor}.
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
                    <span>{item.state}</span>
                    <span>·</span>
                    <span>{item.authority}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      due {item.milestoneDeadline ? formatDate(item.milestoneDeadline) : '—'}
                    </span>
                  </div>
                  <ContributorChips contributors={item.contributors} className="mt-2" max={3} />
                </div>

                <div className="min-w-[220px] max-w-sm flex-1">
                  <p className="label-xs">Recommended review</p>
                  <p className="mt-1 text-[12.5px] font-semibold leading-snug text-ink">{item.intervention.action}</p>
                  <p className="mt-1 text-[11px] text-ink-3">{item.intervention.owner}</p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <RiskPill level={item.riskBand} score={item.riskScore} />
                  <Button size="sm" variant={ack ? 'ghost' : 'outline'} className="gap-1.5" onClick={() => toggle(item.id)}>
                    <CheckCircle2 className={cn('h-3.5 w-3.5', ack && 'text-emerald-500')} />
                    {ack ? 'Acknowledged' : 'Acknowledge'}
                  </Button>
                </div>
              </div>
            );
          })}

          {queue.loading && <p className="px-5 py-10 text-center text-[12px] text-ink-3">Scoring the open book…</p>}
          {!queue.loading && items.length === 0 && (
            <p className="px-5 py-12 text-center text-[12.5px] text-ink-3">Nothing flagged in this view.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-[11px] text-ink-3">
            Acknowledgement is session-local in this prototype — a deployment would write it back to the case file.
          </p>
          <Link to="/queue" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
            Open the ranked queue <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Card>

      <Card className="animate-fade-up p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <ShieldAlert className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-ink">Why these and not others</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
              A warning fires when a project-stage cell combines high predicted milestone risk with deadline pressure.
              Severity follows the cell's risk band, not a fixed rule about any single field — which is why two projects
              with the same number of legal cases can appear at different severities, or not at all.
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <Filter className="h-3.5 w-3.5" /> {items.length} shown of {formatNumber(queue.data?.total ?? 0)} cells
          </span>
        </div>
      </Card>
    </div>
  );
}
