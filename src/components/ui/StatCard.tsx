import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui';

export interface StatCardProps {
  label: string;
  value: number;
  decimals?: number;
  /** Rendered after the value at a smaller size, e.g. "days" or "%". */
  unit?: string;
  suffix?: string;
  prefix?: string;
  icon: LucideIcon;
  delta?: number;
  /** When true a rising delta is bad (e.g. delay days). */
  invertDelta?: boolean;
  caption?: string;
  spark?: number[];
  /** Kept for API compatibility; the card no longer paints itself in an accent. */
  accent?: string;
  index?: number;
  className?: string;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 64;
  const h = 22;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible text-brand" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A single headline figure. Prefer MetricStrip when showing several together. */
export function StatCard({ label, value, decimals = 0, unit, suffix, prefix, icon: Icon, delta, invertDelta = false, caption, spark, className }: StatCardProps) {
  const good = delta === undefined ? null : invertDelta ? delta <= 0 : delta >= 0;
  const DeltaIcon = delta === undefined || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className={cn('h-full p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-medium text-ink-3">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold leading-none tracking-tight text-ink num">
          {prefix}
          {value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
          {suffix}
          {unit && <span className="ml-1 text-sm font-normal text-ink-3">{unit}</span>}
        </p>
        {spark && <Sparkline points={spark} />}
      </div>
      {(delta !== undefined || caption) && (
        <div className="mt-2 flex items-baseline gap-2">
          {delta !== undefined && (
            <span className={cn('inline-flex shrink-0 items-center gap-0.5 text-xs font-medium num', good === null ? 'text-ink-3' : good ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
              <DeltaIcon className="h-3 w-3" />
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {caption && <p className="min-w-0 text-xs text-ink-3">{caption}</p>}
        </div>
      )}
    </Card>
  );
}
