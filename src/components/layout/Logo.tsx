import { useId } from 'react';
import { cn } from '@/lib/cn';
import { BRAND } from '@/lib/brand';

/** The looped "L" from the hand-lettered logo, reduced to one stroke. */
const LOOPED_L = 'M35 10 C 34.5 22, 33 33, 28.5 42.5 C 25 50, 17 54.5, 12.5 51.5 C 8.5 48.5, 13 42.5, 20 43.5 C 29 45, 37 53, 52 50';

/**
 * LandPulse icon: the logo's looped L in saffron-to-ember on a round ink
 * badge. Used wherever the full logo is too wide: collapsed sidebar, mobile
 * header, boot screen, About.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const gradient = `lp-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8 shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={gradient} x1="9" y1="0" x2="56" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF751F" />
          <stop offset="1" stopColor="#FF4236" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="#141210" />
      <path d={LOOPED_L} transform="translate(32 32) scale(.66) translate(-32 -32)" fill="none" stroke={`url(#${gradient})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The hand-lettered LandPulse logo, used as drawn. The dark-ground file swaps
 * the black "Pulse" and swash for off-white; the saffron is unchanged.
 */
export function Logo({
  className,
  tone = 'auto',
}: {
  className?: string;
  /** 'light' always uses the dark-ground artwork (for dark panels in light mode). */
  tone?: 'auto' | 'light';
}) {
  const img = 'h-11 w-auto select-none';
  return (
    <span className={cn('flex shrink-0 items-center', className)}>
      {tone === 'light' ? (
        <img src="/brand/landpulse-logo-on-dark.png" width={560} height={221} alt={BRAND.product} className={img} draggable={false} />
      ) : (
        <>
          <img src="/brand/landpulse-logo.png" width={560} height={221} alt={BRAND.product} className={cn(img, 'dark:hidden')} draggable={false} />
          <img src="/brand/landpulse-logo-on-dark.png" width={560} height={221} alt={BRAND.product} className={cn(img, 'hidden dark:block')} draggable={false} />
        </>
      )}
    </span>
  );
}
