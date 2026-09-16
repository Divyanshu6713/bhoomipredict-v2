import { cn } from '@/lib/cn';
import { groupColor } from '@/lib/risk';
import { ExplainCaveat } from '@/components/ui/primitives';
import type { Contributor } from '@/data/types';

/**
 * Explanation panel.
 *
 * Case-level contributions are SHAP values computed on the deployed ensemble;
 * scenario contributions are the closed-form Shapley values of the linear
 * deployed model on the project record. Either way a bar is a statement about what moved the model, which
 * is why the caveat travels with the panel rather than living in a footnote.
 */
export function ContributorBars({
  contributors,
  unit,
  showCaveat = true,
  max = 6,
  className,
}: {
  contributors: Array<Contributor | { group: string; share?: number; value: number; features?: string[] }>;
  unit?: string;
  showCaveat?: boolean;
  max?: number;
  className?: string;
}) {
  const rows = contributors.slice(0, max);
  const total = rows.reduce((s, r) => s + Math.abs(r.value), 0) || 1;

  return (
    <div className={cn('space-y-3.5', className)}>
      {rows.map((r, i) => {
        const share = r.share ?? Math.abs(r.value) / total;
        const color = groupColor(r.group);
        return (
          <div key={`${r.group}-${i}`} className="group">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-[13px] font-semibold text-ink">
                <span className="mr-2 text-[11px] font-bold text-ink-3 num">{String(i + 1).padStart(2, '0')}</span>
                {r.group}
              </p>
              <p className="shrink-0 text-[12.5px] font-bold text-ink num">
                {(share * 100).toFixed(0)}%
                {unit && <span className="ml-1.5 text-[10.5px] font-medium text-ink-3">{unit}</span>}
              </p>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full animate-grow-bar"
                style={{
                  ['--bar-w' as string]: `${Math.max(1.5, share * 100)}%`,
                  width: `${Math.max(1.5, share * 100)}%`,
                  background: color,
                  animationDelay: `${i * 60}ms`,
                }}
              />
            </div>
            {'features' in r && r.features && r.features.length > 0 && (
              <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{r.features.join(' · ')}</p>
            )}
          </div>
        );
      })}
      {showCaveat && <ExplainCaveat className="border-t border-line pt-3" />}
    </div>
  );
}

/** Compact inline contributor chips for table rows and queue cards. */
export function ContributorChips({
  contributors,
  max = 3,
  className,
}: {
  contributors: Array<{ group: string; share?: number }>;
  max?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {contributors.slice(0, max).map((c) => (
        <span
          key={c.group}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-2"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: groupColor(c.group) }} />
          {c.group}
          {c.share !== undefined && <span className="text-ink-3 num">{Math.round(c.share * 100)}%</span>}
        </span>
      ))}
    </div>
  );
}
