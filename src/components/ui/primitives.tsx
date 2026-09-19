import { useState, type ReactNode } from 'react';
import { ChevronDown, CloudOff, Info, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RISK_CLASS, RISK_ICON, RISK_MEANING } from '@/lib/risk';
import { TONE_CHIP } from '@/lib/tone';
import { Badge, Button, Card } from '@/components/ui';
import { PROTOTYPE_NOTICE } from '@/api/client';
import type { RiskLevel } from '@/data/types';

/* ------------------------------------------------------------ error states */

function describeError(error: Error): { title: string; body: string; network: boolean } {
  const message = error.message ?? '';
  if (/failed to fetch|networkerror|load failed|ECONNREFUSED/i.test(message)) {
    return { network: true, title: 'The analysis service is not reachable', body: 'LandPulse AI could not contact its API. Check that the service is running, then retry.' };
  }
  if (/401|unauthori[sz]ed|session/i.test(message)) {
    return { network: false, title: 'Your session has ended', body: 'Sign in again to continue. Nothing you saved has been lost.' };
  }
  if (/403|forbidden|permission/i.test(message)) {
    return { network: false, title: 'Not available for your role', body: 'Your position does not include access to this information.' };
  }
  if (/404|not found/i.test(message)) {
    return { network: false, title: 'This record could not be found', body: 'It may be outside your jurisdiction, or it may have been removed.' };
  }
  return { network: false, title: '', body: 'Something went wrong while loading this information. Retrying usually resolves it.' };
}

export function ErrorState({
  error,
  onRetry,
  title,
  className,
}: {
  error: Error;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const d = describeError(error);
  const Icon = d.network ? CloudOff : TriangleAlert;
  return (
    <Card className={cn('p-5', className)} role="alert">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-ink">{d.title || title || 'Could not load this view'}</p>
          <p className="mt-0.5 text-sm text-ink-2">{d.body}</p>
          {d.network && (
            <p className="mt-2 text-xs text-ink-3">
              Running locally? Start both processes with <code className="rounded bg-surface-3 px-1 py-px font-mono">npm run dev</code>.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </Button>
            )}
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink-2">
              Technical details <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
            </button>
          </div>
          {open && <p className="mt-2 break-words rounded-md bg-surface-2 px-2.5 py-2 font-mono text-xs text-ink-2">{error.message}</p>}
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
  const Icon = RISK_ICON[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-medium leading-4',
        size === 'sm' ? 'px-1.5 py-px text-xs' : 'px-1.5 py-0.5 text-xs',
        RISK_CLASS[level].chip,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {score !== undefined && <span className="font-semibold num">{score}%</span>}
      <span>{level}</span>
    </span>
  );
}

/** Horizontal risk meter with the band boundaries marked. */
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
        <p className="text-xs font-medium text-ink-3">{label}</p>
        <p className={cn('font-semibold leading-none tracking-tight num', compact ? 'text-lg' : 'text-2xl', RISK_CLASS[level].text)}>{score}%</p>
      </div>
      <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', RISK_CLASS[level].bar)} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
        {[30, 55, 78].map((cut) => (
          <span key={cut} className="absolute top-0 h-full w-0.5 bg-surface" style={{ left: `${cut}%` }} />
        ))}
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between text-2xs text-ink-3">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
          <span>Critical</span>
        </div>
      )}
    </div>
  );
}

/**
 * The single most important read-out on a result screen: band, glyph,
 * probability and what the band means in practice.
 */
export function RiskVerdict({
  level,
  score,
  label = 'Predicted delay risk',
  detail,
  meaning,
  className,
  children,
}: {
  level: RiskLevel;
  score: number;
  label?: string;
  detail?: ReactNode;
  meaning?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const Icon = RISK_ICON[level];
  const c = RISK_CLASS[level];
  return (
    <div className={cn('rounded-xl border p-4 sm:p-5', c.panel, className)}>
      <p className="text-xs font-medium text-ink-2">{label}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn('inline-flex items-center gap-1.5 text-lg font-semibold', c.text)}>
          <Icon className="h-5 w-5" aria-hidden />
          {level} risk
        </span>
        <span className="text-3xl font-semibold leading-none tracking-tight text-ink num">{score}%</span>
      </div>
      {detail && <div className="mt-1.5 text-sm text-ink-2">{detail}</div>}
      <p className="mt-2 text-sm text-ink-2">{meaning ?? RISK_MEANING[level]}</p>
      {children}
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
        'grid gap-x-4 gap-y-3',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-2 sm:grid-cols-3',
        columns === 4 && 'grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {rows.map((r) => (
        <div key={r.label} className="min-w-0 border-l-2 border-line pl-3">
          <dt className="text-xs text-ink-3">{r.label}</dt>
          <dd className={cn('mt-0.5 text-md font-semibold leading-snug num', r.tone ?? 'text-ink')}>{r.value}</dd>
          {r.hint && <p className="text-xs text-ink-3">{r.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------- data provenance */

export function PrototypeNotice({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5', TONE_CHIP.warning, className)}>
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="text-sm text-ink-2">
        <span className="font-semibold text-amber-800 dark:text-amber-300">Synthetic data. </span>
        {compact ? 'Generated for demonstration and model development — not actual government acquisition records.' : PROTOTYPE_NOTICE}
      </p>
    </div>
  );
}

/** Standing caveat for every explanation panel. */
export function ExplainCaveat({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-ink-3', className)}>
      These factors contributed most to the model&rsquo;s prediction. They are not a finding that any factor caused a delay, and the prediction is a probability rather
      than an outcome.
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
  const tone = score >= 92 ? 'success' : score >= 80 ? 'info' : score >= 65 ? 'warning' : 'danger';
  return (
    <Badge tone={tone} className={className}>
      <ShieldCheck className="h-3 w-3" aria-hidden />
      Data quality <span className="font-semibold num">{score}%</span> · {label}
      {missingFields > 0 && <span className="opacity-80">· {missingFields} field gaps</span>}
    </Badge>
  );
}
