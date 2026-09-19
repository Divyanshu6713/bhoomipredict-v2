import { useEffect, useRef, useState } from 'react';
import { useStore, type SectionId } from '../lib/store';
import { scrollToId } from '../lib/scroll';
import { CineLink as Link } from './CineLink';
import { useAuth } from '@/auth/AuthContext';
import { PortalLink } from '@/components/transition/Portal';
import { STANDARD_HOME, rememberHome } from '@/lib/homeView';

/** Back to the standard (non-3D) homepage — the same product, without the immersive layer. */
export function StandardViewLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <PortalLink to={STANDARD_HOME} variant="rise" onClick={() => (rememberHome(STANDARD_HOME), onClick?.())} className={className} title="Return to the standard LandPulse homepage">
      <span aria-hidden="true">←</span> Standard View
    </PortalLink>
  );
}

export const CHAPTERS: { id: SectionId; label: string }[] = [
  { id: 'hero', label: 'Land' },
  { id: 'journey', label: 'Land → Action' },
  { id: 'chain', label: 'The chain' },
  { id: 'causes', label: 'Nine causes' },
  { id: 'signature', label: 'Risk · Driver · Action' },
  { id: 'bottleneck', label: 'Early warning' },
  { id: 'ai', label: 'Prediction' },
  { id: 'xai', label: 'Explanation' },
  { id: 'live', label: 'Live portfolio' },
  { id: 'officer', label: 'The officer decides' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'command', label: 'Command center' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'district', label: 'Parcel → State' },
  { id: 'layers', label: 'Platform layers' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'ecosystem', label: 'Ecosystem' },
  { id: 'limits', label: 'Limits' },
  { id: 'security', label: 'Security' },
  { id: 'return', label: 'The land, now' },
  { id: 'finale', label: 'Land Pulse' },
];

const NAV = [
  { id: 'journey', label: 'Land' },
  { id: 'signature', label: 'Risk' },
  { id: 'xai', label: 'Explain' },
  { id: 'live', label: 'Live data' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'architecture', label: 'System' },
  { id: 'limits', label: 'Trust' },
];

export function Nav() {
  const reduced = useStore((s) => s.reduced);
  const set = useStore((s) => s.set);
  const active = useStore((s) => s.active);
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${h > 0 ? window.scrollY / h : 0})`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const go = (id: string) => {
    setOpen(false);
    scrollToId(id);
  };
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-cine-950/95 via-cine-950/60 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/5">
        <div ref={bar} className="h-full origin-left bg-gis-400/80" style={{ transform: 'scaleX(0)' }} />
      </div>
      <div className="relative mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-3.5 md:px-8">
        <a href="#hero" onClick={(e) => (e.preventDefault(), go('hero'))} className="shrink-0" aria-label="LAND PULSE — back to top">
          <img src="/brand/landpulse-logo-on-dark.png" alt="LandPulse" className="h-9 w-auto md:h-10" width={560} height={221} />
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-1 rounded-full border border-white/10 bg-cine-900/60 p-1 backdrop-blur-md lg:flex">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              onClick={(e) => (e.preventDefault(), go(n.id))}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                active === n.id ? 'bg-white/10 text-mist-50' : 'text-mist-300 hover:text-mist-50'
              }`}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button className="tag tag-warn" aria-expanded={info} aria-controls="demo-note" onClick={() => setInfo((o) => !o)}>
              <span className="h-1.5 w-1.5 rounded-full bg-risk-med pulse-dot" />
              <span className="hidden sm:inline">Demonstration dataset</span>
              <span className="sm:hidden">Synthetic</span>
            </button>
            {info && (
              <p id="demo-note" className="panel fx-in absolute right-0 top-10 w-[300px] p-4 text-[12.5px] leading-snug text-mist-200">
                <b className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#f0c77f]">Prototype · synthetic data</b>
                Synthetic data for prototype demonstration — not suitable for administrative decision-making. No real parcels, owners, cases or
                government systems are shown.
              </p>
            )}
          </div>
          <StandardViewLink className="tag hidden whitespace-nowrap hover:!text-mist-50 md:inline-flex" />
          {!user && (
            <Link to="/login" className="tag hidden whitespace-nowrap hover:!text-mist-50 sm:inline-flex">
              Sign in
            </Link>
          )}
          <Link to="/dashboard" className="tag whitespace-nowrap !border-mist-50/50 !bg-mist-50 !text-cine-950 hover:!bg-white">
            {user ? 'Open dashboard' : 'Dashboard'}
          </Link>
          <button
            className="tag hidden hover:text-mist-50 md:inline-flex"
            aria-pressed={reduced}
            onClick={() => set({ reduced: !reduced })}
            title="Reduce motion"
          >
            {reduced ? 'Motion: reduced' : 'Reduce motion'}
          </button>
          <button className="tag lg:hidden" aria-expanded={open} aria-controls="mnav" onClick={() => setOpen((o) => !o)}>
            Menu
          </button>
        </div>
      </div>
      {open && (
        <nav id="mnav" aria-label="Sections" className="panel relative mx-4 grid grid-cols-2 gap-1 p-2 lg:hidden">
          {CHAPTERS.map((c) => (
            <a key={c.id} href={`#${c.id}`} onClick={(e) => (e.preventDefault(), go(c.id))} className="rounded-lg px-3 py-2 text-sm text-mist-200 hover:bg-white/5">
              {c.label}
            </a>
          ))}
          <StandardViewLink
            onClick={() => setOpen(false)}
            className="col-span-2 mt-1 rounded-lg border-t border-white/10 px-3 py-2.5 text-sm font-medium text-mist-50 hover:bg-white/5"
          />
        </nav>
      )}
    </header>
  );
}

export function ChapterRail() {
  const active = useStore((s) => s.active);
  const idx = CHAPTERS.findIndex((c) => c.id === active);
  // full-screen tools keep the right edge clear
  const quiet = ['command', 'timeline', 'xai', 'officer', 'ai', 'signature', 'live', 'capabilities', 'causes'].includes(active);
  return (
    <nav aria-label="Story chapters" className="pointer-events-none fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 xl:block">
      <ol className="flex flex-col items-end gap-[1px]">
        {CHAPTERS.map((c, i) => (
          <li key={c.id}>
            <a
              href={`#${c.id}`}
              onClick={(e) => (e.preventDefault(), scrollToId(c.id))}
              className="group pointer-events-auto relative flex items-center py-[3px]"
              aria-current={i === idx ? 'step' : undefined}
            >
              <span
                className={`pointer-events-none absolute right-full mr-3 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] transition-all duration-300 ${
                  i === idx && !quiet ? 'text-mist-100 opacity-100' : 'translate-x-1 text-mist-400 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                }`}
              >
                {c.label}
              </span>
              <span
                className={`block h-px transition-all duration-300 ${
                  i === idx ? 'w-7 bg-mist-50' : i < idx ? 'w-3 bg-gis-400/70' : 'w-3 bg-white/20 group-hover:bg-white/60'
                }`}
              />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
