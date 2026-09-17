import { cn } from '@/lib/cn';
import { BRAND } from '@/lib/brand';

/**
 * LandPulse AI mark: a strip of land parcels beneath a monitoring pulse that
 * ends in a forecast point. Flat, single-colour tile so it holds up at 20px.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8 shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="32" height="32" rx="8" fill="#2563EB" />
      <path d="M6 22h20v4.5H6z" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12.5 22v4.5M19 22v4.5" stroke="rgba(255,255,255,.55)" strokeWidth="1.3" />
      <path d="M6 15h4.5l2.2-5 3.3 9.5 2.4-6.5 1.5 2H24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25.5" cy="15" r="1.9" fill="#fff" />
    </svg>
  );
}

export function Logo({
  className,
  compact = false,
  tone = 'auto',
  subtitle = false,
}: {
  className?: string;
  compact?: boolean;
  /** 'light' renders the wordmark in white for dark grounds. */
  tone?: 'auto' | 'light';
  subtitle?: boolean;
}) {
  const light = tone === 'light';
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark className={compact ? 'h-7 w-7' : 'h-7 w-7'} title={compact ? BRAND.product : undefined} />
      {!compact && (
        <span className="leading-none">
          <span className={cn('block whitespace-nowrap text-md font-semibold tracking-tight', light ? 'text-white' : 'text-ink')}>
            LandPulse <span className="text-brand">AI</span>
          </span>
          {subtitle && <span className={cn('mt-1 block text-2xs', light ? 'text-white/60' : 'text-ink-3')}>Land acquisition intelligence</span>}
        </span>
      )}
    </span>
  );
}
