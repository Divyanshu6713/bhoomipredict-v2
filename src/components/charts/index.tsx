import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Shared Recharts tooltip so every chart reads the same way. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string; payload?: never }>;
  label?: string | number;
  formatter?: (value: number | string, name: string) => ReactNode;
  labelFormatter?: (label: string | number) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface/95 px-3 py-2.5 shadow-pop backdrop-blur">
      {label !== undefined && (
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload
          .filter((p) => p.value !== undefined && !Number.isNaN(p.value as number))
          .map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="text-ink-2">{p.name}</span>
              <span className="ml-auto font-semibold text-ink num">
                {formatter ? formatter(p.value as number, p.name ?? '') : p.value}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

export function ChartLegend({
  items,
  className,
}: {
  items: Array<{ label: string; color: string; value?: string | number }>;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          <span className="text-[11.5px] font-medium text-ink-2">{it.label}</span>
          {it.value !== undefined && <span className="text-[11.5px] font-bold text-ink num">{it.value}</span>}
        </div>
      ))}
    </div>
  );
}

/** Circular gauge used for composite risk scores. */
export function RiskGauge({
  score,
  size = 200,
  stroke = 14,
  label,
  sublabel,
  color,
}: {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  color: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sweep = 0.78; // three-quarter dial
  const arc = c * sweep;
  const filled = arc * (Math.min(100, Math.max(0, score)) / 100);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[140deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--c-surface-3))"
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${c}`}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-[40px] font-extrabold leading-none tracking-tight text-ink num">
            {Math.round(score)}
            <span className="text-lg font-bold text-ink-3">/100</span>
          </p>
          {label && <p className="mt-2 text-sm font-bold uppercase tracking-wider" style={{ color }}>{label}</p>}
          {sublabel && <p className="mt-1 text-[11px] text-ink-3">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

/** Horizontal contribution bar used in the explainability panels. */
export function ContributionBar({
  label,
  share,
  detail,
  color,
  suffix,
  index = 0,
}: {
  label: string;
  share: number; // 0..1
  detail?: string;
  color: string;
  suffix?: string;
  index?: number;
}) {
  const width = `${Math.max(1.5, share * 100)}%`;
  return (
    <div className="group">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold text-ink">
          <span className="mr-2 text-[11px] font-bold text-ink-3 num">{String(index + 1).padStart(2, '0')}</span>
          {label}
        </p>
        <p className="shrink-0 text-[13px] font-bold text-ink num">
          {(share * 100).toFixed(0)}%{suffix && <span className="ml-1.5 text-[11px] font-medium text-ink-3">{suffix}</span>}
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full animate-grow-bar"
          style={{ ['--bar-w' as string]: width, width, background: color, animationDelay: `${index * 70}ms` }}
        />
      </div>
      {detail && <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">{detail}</p>}
    </div>
  );
}
