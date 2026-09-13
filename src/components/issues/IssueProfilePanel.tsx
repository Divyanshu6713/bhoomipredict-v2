import { useState } from 'react';
import { ChevronDown, CircleSlash, ListTree } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Card, CardHeader, InfoDot } from '@/components/ui';
import { ProvenanceBadge } from '@/components/brand/Provenance';
import type { IssueProfile, IssueStatus } from '@/data/types';

export const ISSUE_STATUS_CLASS: Record<IssueStatus, { chip: string; dot: string }> = {
  active: { chip: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400', dot: 'bg-rose-500' },
  watch: { chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  clear: { chip: 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  not_captured: { chip: 'border-line bg-surface-2 text-ink-3', dot: 'bg-ink-3' },
};

/**
 * Land-acquisition issue profile: which delay causes this project type is
 * exposed to, which are active, the evidence behind each, and which issues
 * do not apply here (and why).
 */
export function IssueProfilePanel({ profile, subtitle, className, initiallyShown = 6 }: { profile: IssueProfile; subtitle?: string; className?: string; initiallyShown?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = expanded ? profile.issues : profile.issues.slice(0, initiallyShown);
  const s = profile.summary;

  return (
    <Card className={className}>
      <CardHeader
        title="Land-acquisition issue profile"
        subtitle={subtitle ?? `Delay causes that apply to a ${profile.projectType.toLowerCase()} project, read from its dependencies and signals`}
        icon={<ListTree className="h-4 w-4" />}
        action={
          <span className="flex items-center gap-2">
            <ProvenanceBadge mode="model" compact />
            <InfoDot text={profile.basis} />
          </span>
        }
      />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge className={ISSUE_STATUS_CLASS.active.chip} dot={ISSUE_STATUS_CLASS.active.dot}>{s.active} active</Badge>
          <Badge className={ISSUE_STATUS_CLASS.watch.chip} dot={ISSUE_STATUS_CLASS.watch.dot}>{s.watch} watch</Badge>
          <Badge className={ISSUE_STATUS_CLASS.clear.chip} dot={ISSUE_STATUS_CLASS.clear.dot}>{s.clear} no signal</Badge>
          {s.notCaptured > 0 && <Badge className={ISSUE_STATUS_CLASS.not_captured.chip}>{s.notCaptured} not captured</Badge>}
          <Badge>{s.excluded} not applicable</Badge>
        </div>
        {profile.typicalDependencies && (
          <p className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">Typical dependencies · </span>
            {profile.typicalDependencies}
          </p>
        )}
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {shown.map((issue) => {
            const open = openId === issue.id;
            return (
              <li key={issue.id}>
                <button onClick={() => setOpenId(open ? null : issue.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2" aria-expanded={open}>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', ISSUE_STATUS_CLASS[issue.status].dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                      {issue.label}
                      {issue.core && <span className="rounded border border-brand/25 bg-brand/[0.07] px-1 py-px text-[9px] font-bold uppercase tracking-wide text-brand">key for type</span>}
                    </span>
                    <span className="block truncate text-[11px] text-ink-3">{issue.evidence[0]}</span>
                  </span>
                  <span className={cn('hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold sm:inline', ISSUE_STATUS_CLASS[issue.status].chip)}>{issue.statusLabel}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <div className="space-y-2 bg-surface-2 px-3 pb-3 pl-8 pt-1 text-[11.5px] leading-relaxed text-ink-2">
                    <p>{issue.description}</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {issue.evidence.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                    {issue.owners.length > 0 && (
                      <p>
                        <span className="font-semibold text-ink">Owned by: </span>
                        {issue.owners.map((o) => `${o.name}${o.pending ? ' (action pending)' : ''}`).join('; ')}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {profile.issues.length > initiallyShown && (
          <button onClick={() => setExpanded((e) => !e)} className="text-[12px] font-semibold text-brand hover:underline">
            {expanded ? 'Show fewer' : `Show all ${profile.issues.length} applicable issues`}
          </button>
        )}
        {profile.excluded.length > 0 && (
          <div className="border-t border-line pt-3">
            <p className="label-xs mb-1.5 flex items-center gap-1.5">
              <CircleSlash className="h-3 w-3" /> Not applicable here
            </p>
            <ul className="space-y-1">
              {profile.excluded.map((e) => (
                <li key={e.id} className="text-[11px] leading-relaxed text-ink-3">
                  <span className="font-semibold text-ink-2">{e.label}</span> — {e.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
