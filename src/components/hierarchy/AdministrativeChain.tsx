import { Building2, Flag, Landmark, Layers3, MapPin, Map as MapIcon, Route, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AdminLevelId, Position } from '@/data/types';

const LEVEL_ICON: Record<AdminLevelId, LucideIcon> = {
  country: Flag,
  ministry: Landmark,
  organisation: Building2,
  region: Route,
  state: MapIcon,
  department: Building2,
  division: Layers3,
  district: MapPin,
  project: MapPin,
};

/**
 * The user's administrative position as a vertical ladder, top of government
 * first. Levels the organisation does not use are simply absent; levels that
 * cover everything below ("All districts") are shown muted.
 */
export function AdministrativeChain({ position, tone = 'default', className }: { position: Position; tone?: 'default' | 'dark'; className?: string }) {
  const dark = tone === 'dark';
  return (
    <ol className={cn('relative', className)}>
      {position.chain.map((row, i) => {
        const Icon = LEVEL_ICON[row.level] ?? MapPin;
        const last = i === position.chain.length - 1;
        return (
          <li key={`${row.level}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
            {!last && <span className={cn('absolute left-[13px] top-7 h-[calc(100%-20px)] w-px', dark ? 'bg-white/15' : 'bg-line-strong')} />}
            <span
              className={cn(
                'relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-md border',
                row.all ? (dark ? 'border-white/10 bg-white/[0.03] text-white/35' : 'border-line bg-surface-2 text-ink-3') : dark ? 'border-white/20 bg-white/10 text-white' : 'border-line-strong bg-surface text-ink-2',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn('text-2xs', dark ? 'text-white/40' : 'text-ink-3')}>{row.label}</p>
              <p className={cn('text-sm font-medium leading-snug', row.all ? (dark ? 'text-white/45' : 'text-ink-3') : dark ? 'text-white' : 'text-ink')}>
                {row.value}
                {row.code && <span className={cn('ml-1.5 font-mono text-xs font-medium', dark ? 'text-white/40' : 'text-ink-3')}>{row.code}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One-line breadcrumb of the same chain, for headers and menus. */
export function PositionBreadcrumb({ position, className }: { position: Position; className?: string }) {
  const rows = position.chain.filter((r) => !r.all);
  return (
    <p className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3', className)}>
      {rows.map((r, i) => (
        <span key={`${r.level}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-ink-3/60">›</span>}
          <span className={cn(i === rows.length - 1 && 'font-medium text-ink-2')}>{r.level === 'ministry' || r.level === 'organisation' || r.level === 'department' ? shorten(r.value) : r.value}</span>
        </span>
      ))}
    </p>
  );
}

const shorten = (s: string) => (s.length > 42 ? `${s.slice(0, 40)}…` : s);
