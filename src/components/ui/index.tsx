import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { RISK_CLASS } from '@/lib/risk';
import { useCountUp, useInView } from '@/hooks';
import type { RiskLevel } from '@/data/types';

/* ------------------------------------------------------------------ Card */

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

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
    <div
      className={cn(
        // Wraps rather than squeezing the title: on narrow screens a wide action
        // (a tab strip, say) drops to its own line instead of crushing the text.
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 px-5 pt-5 pb-3',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="min-w-0 shrink-0 max-w-full">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, children, ...rest },
  ref,
) {
  const variants: Record<string, string> = {
    primary:
      'bg-brand text-white hover:bg-brand/90 shadow-[0_6px_18px_-8px_rgb(var(--c-brand))] active:translate-y-px',
    secondary: 'bg-surface-3 text-ink hover:bg-line border border-line',
    outline: 'border border-line-strong text-ink hover:bg-surface-2 hover:border-brand/40',
    ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    danger: 'bg-rose-600 text-white hover:bg-rose-500',
  };
  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
    md: 'h-10 px-4 text-sm gap-2 rounded-xl',
    lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
  };
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-200 focus-ring disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ Chip */

export function Badge({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none whitespace-nowrap',
        className ?? 'border-line bg-surface-2 text-ink-2',
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
      {children}
    </span>
  );
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const c = RISK_CLASS[level];
  return (
    <Badge className={cn(c.chip, className)} dot={c.dot}>
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
    <div ref={ref} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div
        className={cn('h-full rounded-full bg-brand transition-[width] duration-[900ms] ease-out', barClassName)}
        style={{ width: animate ? (inView ? `${width}%` : '0%') : `${width}%` }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Counter */

export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 1400,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.25);
  const n = useCountUp(value, duration, decimals, inView);
  return (
    <span ref={ref} className={cn('num', className)}>
      {prefix}
      {n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* -------------------------------------------------------------- Skeleton */

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-surface-3', className)} style={style}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/45 to-transparent dark:via-white/10" />
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card className="p-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-8 w-24" />
      <div className="mt-5 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${90 - i * 14}%` }} />
        ))}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------- Empty state */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-ink-3">{icon}</span>}
      <div>
        <p className="font-display text-sm font-bold text-ink">{title}</p>
        {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-3">{description}</p>}
      </div>
      {action}
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
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label htmlFor={id} className="label-xs mb-1.5 block">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none rounded-xl border border-line bg-surface px-3 pr-9 text-sm font-medium text-ink transition-colors hover:border-line-strong focus-ring"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
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
    <div className={cn('flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1 scrollbar-none', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'relative whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-all duration-200 focus-ring',
            active === t.id
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-3 hover:text-ink-2 hover:bg-surface/60',
          )}
        >
          {t.label}
          {typeof t.count === 'number' && (
            <span
              className={cn(
                'ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold num',
                active === t.id ? 'bg-brand/10 text-brand' : 'bg-surface-3 text-ink-3',
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Tooltip */

export function InfoDot({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-line-strong text-[9px] font-bold text-ink-3">
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] leading-relaxed text-ink-2 opacity-0 shadow-pop transition-opacity duration-200 group-hover:opacity-100">
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
      {eyebrow && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-[32px] sm:leading-[1.15]">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{description}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------- Data provenance */

export function DemoDataBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Synthetic Demo Data
    </span>
  );
}
