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
 *
 * Bars share one hue: the factor is named on every row, so colour would only
 * add noise. The leading factor is drawn at full strength.
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
    <div className={className}>
      <ol className="space-y-3">
        {rows.map((r, i) => {
          const share = r.share ?? Math.abs(r.value) / total;
          const width = `${Math.max(1.5, share * 100)}%`;
          return (
            <li key={`${r.group}-${i}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-sm font-medium text-ink">
                  <span className="mr-2 inline-block w-4 text-xs text-ink-3 num">{i + 1}</span>
                  {r.group}
                </p>
                <p className="shrink-0 text-sm font-semibold text-ink num">
                  {(share * 100).toFixed(0)}%
                  {unit && <span className="ml-1.5 text-xs font-normal text-ink-3">{unit}</span>}
                </p>
              </div>
              <div className="ml-6 mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full animate-grow-bar"
                  style={{ ['--bar-w' as string]: width, width, background: i === 0 ? 'rgb(var(--c-brand))' : 'rgb(var(--c-brand) / 0.5)', animationDelay: `${i * 30}ms` }}
                />
              </div>
              {'features' in r && r.features && r.features.length > 0 && <p className="ml-6 mt-1 text-xs text-ink-3">{r.features.join(' · ')}</p>}
            </li>
          );
        })}
      </ol>
      {showCaveat && <ExplainCaveat className="mt-4 border-t border-line pt-3" />}
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
        <span key={c.group} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: groupColor(c.group) }} />
          {c.group}
          {c.share !== undefined && <span className="text-ink-3 num">{Math.round(c.share * 100)}%</span>}
        </span>
      ))}
    </div>
  );
}
