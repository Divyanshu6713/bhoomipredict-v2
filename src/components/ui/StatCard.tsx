import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AnimatedNumber, Card } from '@/components/ui';

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
  accent?: string;
  index?: number;
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 64;
  const h = 26;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  const id = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - ((points[points.length - 1] - min) / span) * h} r="2.6" fill={color} />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  decimals = 0,
  unit,
  suffix,
  prefix,
  icon: Icon,
  delta,
  invertDelta = false,
  caption,
  spark,
  accent = '#3B72F0',
  index = 0,
}: StatCardProps) {
  const good = delta === undefined ? null : invertDelta ? delta <= 0 : delta >= 0;
  const DeltaIcon = delta === undefined || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card
      className="group relative overflow-hidden p-5 card-hover animate-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px] opacity-70 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-2.5">
        <p className="label-xs min-w-0 flex-1 leading-tight">{label}</p>
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110"
          style={{ background: `${accent}1a`, color: accent }}
        >
          <Icon className="h-[17px] w-[17px]" />
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="font-display text-[29px] font-extrabold leading-none tracking-tight text-ink">
          <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
          {unit && <span className="ml-1 text-[14px] font-bold text-ink-3">{unit}</span>}
        </p>
        {spark && <span className="mb-1 shrink-0">
          <Sparkline points={spark} color={accent} />
        </span>}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        {delta !== undefined && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold num',
              good === null
                ? 'bg-surface-3 text-ink-3'
                : good
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            )}
          >
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {caption && <p className="min-w-0 text-[11px] leading-tight text-ink-3">{caption}</p>}
      </div>
    </Card>
  );
}
