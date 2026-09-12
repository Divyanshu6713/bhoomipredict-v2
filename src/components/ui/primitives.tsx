import type { ReactNode } from 'react';
import { AlertTriangle, Info, RefreshCw, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RISK_CLASS } from '@/lib/risk';
import { Badge, Button, Card } from '@/components/ui';
import { PROTOTYPE_NOTICE } from '@/api/client';
import type { RiskLevel } from '@/data/types';

/* ------------------------------------------------------------ error states */

export function ErrorState({
  error,
  onRetry,
  title = 'Could not load this view',
}: {
  error: Error;
  onRetry?: () => void;
  title?: string;
}) {
  const isNetwork = /failed to fetch|networkerror|load failed/i.test(error.message);
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-bold text-ink">{title}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{error.message}</p>
          {isNetwork && (
            <p className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">
              The API process serves the 350,000-case corpus and does not appear to be reachable. Start both
              processes with <code className="font-mono text-[11.5px]">npm run dev</code>, or the API alone with{' '}
              <code className="font-mono text-[11.5px]">npm run dev:api</code>.
            </p>
          )}
          {onRetry && (
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------- risk indicators */

export function RiskPill({
  level,
  score,
  className,
  size = 'md',
}: {
  level: RiskLevel;
  score?: number;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const c = RISK_CLASS[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-bold leading-none whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-1 text-[11px]',
        c.chip,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      {score !== undefined && <span className="num">{score}%</span>}
      {level}
    </span>
  );
}

/** Horizontal risk meter with the four band boundaries marked. */
export function RiskMeter({
  score,
  level,
  label = 'Predicted delay risk',
  compact = false,
}: {
  score: number;
  level: RiskLevel;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('label-xs', compact && 'text-[10px]')}>{label}</p>
        <p className={cn('font-display font-extrabold leading-none num', compact ? 'text-[17px]' : 'text-[22px]', RISK_CLASS[level].text)}>
          {score}%
        </p>
      </div>
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn('h-full rounded-full transition-[width] duration-[900ms] ease-out', RISK_CLASS[level].bar)}
          style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
        />
        {[30, 55, 78].map((cut) => (
          <span key={cut} className="absolute top-0 h-full w-px bg-surface/80" style={{ left: `${cut}%` }} />
        ))}
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between text-[9.5px] font-semibold uppercase tracking-wider text-ink-3">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
          <span>Critical</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- data blocks */

export function KeyValue({
  rows,
  columns = 2,
  className,
}: {
  rows: Array<{ label: string; value: ReactNode; tone?: string; hint?: string }>;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-2.5',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-2 sm:grid-cols-3',
        columns === 4 && 'grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {rows.map((r) => (
        <div key={r.label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <dt className="label-xs leading-tight">{r.label}</dt>
          <dd className={cn('mt-1.5 font-display text-[15px] font-extrabold leading-tight num', r.tone ?? 'text-ink')}>
            {r.value}
          </dd>
          {r.hint && <p className="mt-0.5 text-[10.5px] leading-tight text-ink-3">{r.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------- data provenance */

export function PrototypeNotice({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">
            Prototype data notice
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
            {compact
              ? 'Synthetic data for demonstration and model development. Not actual government acquisition records.'
              : PROTOTYPE_NOTICE}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Standing caveat for every explanation panel. */
export function ExplainCaveat({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] leading-relaxed text-ink-3', className)}>
      These factors contributed most to the model&rsquo;s prediction for this case. They are not a finding that any
      factor caused a delay, and the prediction is a probability rather than an outcome.
    </p>
  );
}

/** Data-quality / confidence indicator. */
export function QualityBadge({
  score,
  missingFields = 0,
  className,
}: {
  score: number;
  missingFields?: number;
  className?: string;
}) {
  const label = score >= 92 ? 'Good' : score >= 80 ? 'Adequate' : score >= 65 ? 'Partial' : 'Weak';
  const tone =
    score >= 92
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : score >= 80
        ? 'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400'
        : score >= 65
          ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400';
  return (
    <Badge className={cn(tone, className)}>
      <ShieldCheck className="h-3 w-3" />
      Data quality <span className="num font-bold">{score}%</span> · {label}
      {missingFields > 0 && <span className="text-[10px] opacity-80">· {missingFields} field gaps</span>}
    </Badge>
  );
}
