import { CheckCircle2, FastForward, Hourglass } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtN, parcels } from '@/lib/plainStage';
import type { ProjectStage } from '@/data/types';

/**
 * "How to read this" for the lifecycle: why a step can be done while parcels
 * attached to it are still pending. Shown on the project page and, compactly,
 * on the case page.
 */
export function ProgressKey({ stages, className }: { stages: ProjectStage[]; className?: string }) {
  const leftOver = stages.filter((s) => s.status === 'COMPLETED' && s.openCases > 0);
  const leftOverTotal = leftOver.reduce((a, s) => a + s.openCases, 0);
  const worst = [...leftOver].sort((a, b) => b.openCases - a.openCases)[0];
  const early = stages.filter((s) => s.status === 'PENDING').reduce((a, s) => a + s.totalCases, 0);

  return (
    <div className={cn('rounded-xl border border-line bg-surface-2 px-4 py-3.5', className)}>
      <p className="text-sm font-medium text-ink">How to read this</p>
      <p className="mt-0.5 text-xs text-ink-3">Each step is tracked twice: once for the project as a whole, and once for every parcel in it.</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="flex gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div>
            <dt className="text-sm font-medium text-ink">Step completed</dt>
            <dd className="text-xs text-ink-2">The formal milestone is achieved for the whole project — for example the notification is published or the award is declared.</dd>
          </div>
        </div>
        <div className="flex gap-2.5">
          <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div>
            <dt className="text-sm font-medium text-ink">Parcels still pending</dt>
            <dd className="text-xs text-ink-2">Every parcel has its own case file. A few can stay open after the step is done — an objection not yet disposed, a payment not yet made. They are left-over work and must be closed one by one.</dd>
          </div>
        </div>
        <div className="flex gap-2.5">
          <FastForward className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
          <div>
            <dt className="text-sm font-medium text-ink">Started early</dt>
            <dd className="text-xs text-ink-2">Some parcels move faster than the project and are already at a later step. That is normal and needs no action by itself.</dd>
          </div>
        </div>
      </dl>
      {(leftOverTotal > 0 || early > 0) && (
        <p className="mt-3 border-t border-line pt-2.5 text-xs text-ink-2">
          <span className="font-medium text-ink">In this project: </span>
          {leftOverTotal > 0 ? (
            <>
              {parcels(leftOverTotal)} are still pending in steps already done
              {worst && leftOver.length > 1 ? ` — the most in ${worst.name} (${fmtN(worst.openCases)})` : worst ? ` (${worst.name})` : ''}.
            </>
          ) : (
            'no parcels are left over in finished steps.'
          )}
          {early > 0 && ` ${parcels(early)} have started later steps early.`}
        </p>
      )}
    </div>
  );
}
