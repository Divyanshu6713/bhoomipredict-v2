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
  const rows = payload.filter((p) => p.value !== undefined && p.value !== null && !Number.isNaN(p.value as number));
  if (!rows.length) return null;
  return (
    <div className="min-w-[140px] rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
      {label !== undefined && <p className="mb-1 text-xs font-medium text-ink">{labelFormatter ? labelFormatter(label) : label}</p>}
      <div className="space-y-0.5">
        {rows.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="text-ink-3">{p.name}</span>
            <span className="ml-auto pl-3 font-medium text-ink num">{formatter ? formatter(p.value as number, p.name ?? '') : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartLegend({ items, className }: { items: Array<{ label: string; color: string; value?: string | number; dashed?: boolean }>; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          {it.dashed ? (
            <svg width="14" height="4" aria-hidden>
              <line x1="0" y1="2" x2="14" y2="2" stroke={it.color} strokeWidth="2" strokeDasharray="3 2" />
            </svg>
          ) : (
            <span className="h-2 w-2 rounded-sm" style={{ background: it.color }} />
          )}
          <span className="text-xs text-ink-2">{it.label}</span>
          {it.value !== undefined && <span className="text-xs font-medium text-ink num">{it.value}</span>}
        </div>
      ))}
    </div>
  );
}

/** Semi-circular gauge for a single composite risk score. */
export function RiskGauge({
  score,
  size = 200,
  stroke = 12,
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
  const half = Math.PI * r;
  const filled = half * (Math.min(100, Math.max(0, score)) / 100);
  const h = size / 2 + stroke;

  return (
    <div className="relative" style={{ width: size, height: h + 34 }} role="img" aria-label={`${Math.round(score)} out of 100${label ? `, ${label}` : ''}`}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden>
        <path d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`} fill="none" stroke="rgb(var(--c-surface-3))" strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${half}`}
          style={{ transition: 'stroke-dasharray .5s ease-out' }}
        />
      </svg>
      <div className="absolute inset-x-0 text-center" style={{ top: size / 2 - 30 }}>
        <p className="text-4xl font-semibold leading-none tracking-tight text-ink num">
          {Math.round(score)}
          <span className="text-md font-normal text-ink-3">/100</span>
        </p>
        {label && (
          <p className="mt-2 text-sm font-semibold" style={{ color }}>
            {label}
          </p>
        )}
        {sublabel && <p className="mt-0.5 text-xs text-ink-3">{sublabel}</p>}
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
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">
          <span className="mr-2 text-xs text-ink-3 num">{index + 1}</span>
          {label}
        </p>
        <p className="shrink-0 text-sm font-semibold text-ink num">
          {(share * 100).toFixed(0)}%{suffix && <span className="ml-1.5 text-xs font-normal text-ink-3">{suffix}</span>}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full animate-grow-bar" style={{ ['--bar-w' as string]: width, width, background: color, animationDelay: `${index * 30}ms` }} />
      </div>
      {detail && <p className="mt-1 text-xs text-ink-3">{detail}</p>}
    </div>
  );
}
