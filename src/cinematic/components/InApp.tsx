import type { ReactNode } from 'react';
import { CineLink } from './CineLink';

/**
 * "Where is this in the real product?" — each landing chapter ends with a link
 * to the dashboard screen that does the same job on live data.
 */
export function InApp({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  return (
    <CineLink
      to={to}
      data-cursor="explore"
      className={`pe group inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-white/10 bg-cine-950/60 px-3 py-2 text-[12.5px] text-mist-200 backdrop-blur transition-colors hover:border-gis-400/50 hover:text-mist-50 ${className}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">In the dashboard</span>
      <span>{children}</span>
      <span aria-hidden="true" className="text-gis-300 transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </CineLink>
  );
}
