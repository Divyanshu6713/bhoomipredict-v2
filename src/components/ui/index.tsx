import { forwardRef, useId, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RISK_CLASS, RISK_ICON } from '@/lib/risk';
import { TONE_CHIP, TONE_TEXT, type Tone } from '@/lib/tone';
import { useInView } from '@/hooks';
import type { RiskLevel } from '@/data/types';

/* ------------------------------------------------------------------ Card */

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * Card title row. The icon is a quiet glyph beside the title rather than a
 * coloured tile — cards are distinguished by content, not decoration.
 */
export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pb-3 pt-4', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {icon && <span className="mt-[3px] shrink-0 text-ink-3 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="min-w-0 max-w-full shrink-0">{action}</div>}
    </div>
  );
}

/** A titled region of a page without a surrounding card — whitespace separates it. */
export function PageSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-md font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand text-white shadow-xs hover:bg-brand-ink active:bg-brand-ink',
  secondary: 'border border-line-strong bg-surface text-ink shadow-xs hover:bg-surface-2',
  outline: 'border border-line-strong bg-surface text-ink shadow-xs hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
  danger: 'bg-red-600 text-white shadow-xs hover:bg-red-700',
};

const BUTTON_SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-sm',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-sm',
  lg: 'h-11 gap-2 rounded-lg px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 focus-ring disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-ink-3', className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label ?? <span className="sr-only">Loading</span>}
    </span>
  );
}

/* ----------------------------------------------------------------- Badge */

export function Badge({
  children,
  className,
  dot,
  tone,
}: {
  children: ReactNode;
  className?: string;
  dot?: string;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium leading-4',
        tone ? TONE_CHIP[tone] : !className?.includes('bg-') && TONE_CHIP.neutral,
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />}
      {children}
    </span>
  );
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const Icon = RISK_ICON[level];
  return (
    <Badge className={cn(RISK_CLASS[level].chip, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {level}
    </Badge>
  );
}

/* -------------------------------------------------------------- Progress */

export function Progress({
  value,
  className,
  barClassName,
  animate = true,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  animate?: boolean;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div
        className={cn('h-full rounded-full bg-brand transition-[width] duration-500 ease-out', barClassName)}
        style={{ width: animate ? (inView ? `${width}%` : '0%') : `${width}%` }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Numbers */

/**
 * Formatted figure. Numbers render immediately — decision-support figures
 * should never be read mid-animation. (Props kept for API compatibility.)
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  return (
    <span className={cn('num', className)}>
      {prefix}
      {value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

export interface Metric {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  /** For metrics that double as filters: marks the one currently applied. */
  active?: boolean;
}

/**
 * A row of headline figures inside one surface, separated by hairlines. Used
 * instead of a grid of identical mini-cards.
 */
export function MetricStrip({ items, className, columns }: { items: Metric[]; className?: string; columns?: string }) {
  return (
    <div className={cn('card overflow-hidden', className)}>
      <dl
        className={cn(
          'grid grid-cols-2 gap-px bg-line',
          columns ?? (items.length >= 6 ? 'md:grid-cols-3 xl:grid-cols-6' : items.length === 5 ? 'md:grid-cols-3 xl:grid-cols-5' : items.length === 4 ? 'lg:grid-cols-4' : 'sm:grid-cols-3'),
        )}
      >
        {items.map((m) => {
          const body = (
            <>
              <dt className="text-xs font-medium text-ink-3">{m.label}</dt>
              <dd className={cn('mt-1 text-xl font-semibold leading-tight tracking-tight num', m.tone ? TONE_TEXT[m.tone] : 'text-ink')}>{m.value}</dd>
              {m.hint && <dd className="mt-0.5 text-xs text-ink-3">{m.hint}</dd>}
            </>
          );
          return m.onClick ? (
            <button
              key={m.label}
              type="button"
              onClick={m.onClick}
              aria-pressed={m.active === undefined ? undefined : m.active}
              className={cn('relative px-4 py-3.5 text-left transition-colors focus-ring sm:px-5', m.active ? 'bg-brand-soft/50 shadow-[inset_0_-2px_0_rgb(var(--c-brand))]' : 'bg-surface hover:bg-surface-2')}
            >
              {body}
            </button>
          ) : (
            <div key={m.label} className="bg-surface px-4 py-3.5 sm:px-5">
              {body}
            </div>
          );
        })}
        {/* Fill the last row so the hairline grid never shows a grey hole. */}
        {items.length % 2 === 1 && <div className="bg-surface md:hidden" aria-hidden />}
      </dl>
    </div>
  );
}

/* -------------------------------------------------------------- Skeleton */

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('animate-shimmer rounded-md bg-surface-3', className)} style={style} aria-hidden />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card className="p-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="mt-4 h-6 w-24" />
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${92 - ((i * 13) % 40)}%` }} />
        ))}
      </div>
    </Card>
  );
}

/** Page-shaped loading placeholder: a metric strip, then content blocks. */
export function PageSkeleton({ blocks = 2 }: { blocks?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="card grid grid-cols-2 gap-px overflow-hidden bg-line md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface px-5 py-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-6 h-56 w-full" />
        </div>
        <SkeletonCard lines={6} />
      </div>
      {Array.from({ length: Math.max(0, blocks - 1) }).map((_, i) => (
        <SkeletonCard key={i} lines={5} />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- Empty state */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface-2 text-ink-3 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
      <p className="text-base font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Select */

export function Select({
  label,
  value,
  onChange,
  options,
  className,
  id,
  disabled,
  hideLabel = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
  className?: string;
  id?: string;
  disabled?: boolean;
  /** Keep the label for assistive tech but hide it visually (compact toolbars). */
  hideLabel?: boolean;
}) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label htmlFor={selectId} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-xs font-medium text-ink-2'}>
          {label}
        </label>
      )}
      <div className="relative">
        <select id={selectId} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="input appearance-none truncate pr-8">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-surface-3 p-0.5 scrollbar-none', className)}>
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex h-8 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-ring',
              on ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && <span className={cn('ml-1.5 text-xs num', on ? 'text-ink-2' : 'text-ink-3')}>{t.count.toLocaleString('en-IN')}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- Tooltip */

export function InfoDot({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={text} className="grid h-5 w-5 cursor-help place-items-center rounded text-ink-3 hover:text-ink-2 focus-ring">
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-30 mb-1.5 hidden w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-2 shadow-pop animate-fade-in group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

/* --------------------------------------------------------- Section title */

export function SectionTitle({
  eyebrow,
  title,
  description,
  className,
  align = 'left',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={cn(align === 'center' && 'mx-auto max-w-2xl text-center', className)}>
      {eyebrow && <p className="mb-2 text-sm font-medium text-brand">{eyebrow}</p>}
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {description && <p className="mt-3 text-md text-ink-2">{description}</p>}
    </div>
  );
}

/* -------------------------------------------------------- Data provenance */

export function DemoDataBadge({ className }: { className?: string }) {
  return (
    <span
      title="All records are synthetic. No government system is connected."
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium leading-4', TONE_CHIP.warning, className)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
      Synthetic data
    </span>
  );
}
