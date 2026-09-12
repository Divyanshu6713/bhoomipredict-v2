import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('h-9 w-9', className)} aria-hidden="true">
      <defs>
        <linearGradient id="bp-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B72F0" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#bp-mark)" />
      {/* land parcel grid */}
      <path
        d="M9 25.5 20 9l11 16.5H9Z"
        fill="none"
        stroke="rgba(255,255,255,.92)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14.5 25.5 20 17l5.5 8.5" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="1.4" />
      <circle cx="20" cy="21.5" r="3" fill="#FF9933" />
      <path d="M8 30h24" stroke="rgba(255,255,255,.5)" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3.5" />
    </svg>
  );
}

export function Logo({
  className,
  compact = false,
  tone = 'auto',
}: {
  className?: string;
  compact?: boolean;
  tone?: 'auto' | 'light';
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={compact ? 'h-8 w-8' : 'h-9 w-9'} />
      {!compact && (
        <span className="leading-none">
          <span
            className={cn(
              'block font-display text-[17px] font-extrabold tracking-tight',
              tone === 'light' ? 'text-white' : 'text-ink',
            )}
          >
            Bhoomi<span className="text-brand">Predict</span>
          </span>
          <span
            className={cn(
              'mt-1 block text-[9.5px] font-semibold uppercase tracking-[0.16em]',
              tone === 'light' ? 'text-white/45' : 'text-ink-3',
            )}
          >
            Land Acquisition Intelligence
          </span>
        </span>
      )}
    </span>
  );
}
