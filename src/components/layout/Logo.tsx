import { useId } from 'react';
import { cn } from '@/lib/cn';
import { BRAND } from '@/lib/brand';

/**
 * LandPulse AI mark: a cadastral strip of land parcels beneath a monitoring
 * pulse that ends in a forecast point. The tile carries its own ground, so the
 * mark reads the same on light and dark surfaces.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 48 48" className={cn('h-9 w-9 shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`lp-tile-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E4FD6" />
          <stop offset="100%" stopColor="#0B1B45" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#lp-tile-${id})`} />
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="11.25" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
      {/* land parcels */}
      <path d="M9 32.5h30v7.5H9z" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.42)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M19 32.5v7.5M27.5 32.5l1.5 7.5M34 32.5v7.5" stroke="rgba(255,255,255,.42)" strokeWidth="1.4" />
      {/* monitoring pulse */}
      <path d="M9 22.5h7.5l3.2-7.5 5 14.5 3.6-10 2.2 3h4.5" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* forecast point */}
      <circle cx="38.5" cy="22.5" r="4.6" fill="#FF9933" opacity=".22" />
      <circle cx="38.5" cy="22.5" r="2.6" fill="#FF9933" />
    </svg>
  );
}

export function Logo({
  className,
  compact = false,
  tone = 'auto',
  subtitle = true,
}: {
  className?: string;
  compact?: boolean;
  /** 'light' for dark grounds (sidebar, login); 'auto' follows the theme. */
  tone?: 'auto' | 'light';
  subtitle?: boolean;
}) {
  const light = tone === 'light';
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={compact ? 'h-8 w-8' : 'h-9 w-9'} title={compact ? BRAND.product : undefined} />
      {!compact && (
        <span className="leading-none">
          <span className={cn('flex items-center gap-1.5 font-display text-[17px] font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>
            LandPulse
            <span className={cn('rounded-[5px] px-1 py-[3px] text-[10.5px] font-extrabold leading-none tracking-wide', light ? 'bg-white/12 text-[#FFB866]' : 'bg-brand/10 text-brand')}>AI</span>
          </span>
          {subtitle && <span className={cn('mt-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.16em]', light ? 'text-white/45' : 'text-ink-3')}>Land Acquisition Intelligence</span>}
        </span>
      )}
    </span>
  );
}
