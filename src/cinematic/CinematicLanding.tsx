/**
 * The optional "Explore in 3D" experience (/experience): a cinematic 3D walk
 * through the LandPulse concept. The standard homepage lives at / (pages/Landing).
 * Live portfolio figures come from /api/summary; the 3D corridor is an
 * illustrative scene generated in the browser. The signed-in dashboard is
 * untouched — every call to action routes into it.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './cinematic.css';
import { fetchSummary } from '@/api/client';
import { EXPERIENCE_HOME, rememberHome } from '@/lib/homeView';
import { useStore } from './lib/store';
import { detectQuality, detectWebGL, prefersReducedMotion } from './lib/env';
import { startScrollEngine, stopScrollEngine } from './lib/scroll';
import { Cursor } from './components/Cursor';
import { Nav, ChapterRail } from './components/Chrome';
import { HoverCard, SelectedCard } from './components/ParcelCards';
import { Fallback2D } from './components/Fallback2D';
import { Hero } from './sections/Hero';
import { Journey } from './sections/Journey';
import { Chain } from './sections/Chain';
import { Causes, LivePortfolio, Capabilities } from './sections/Platform';
import { Signature } from './sections/Signature';
import { Bottleneck } from './sections/Bottleneck';
import { AIFlow } from './sections/AIFlow';
import { Explain } from './sections/Explain';
import { Officer } from './sections/Officer';
import { Command } from './sections/Command';
import { Timeline } from './sections/Timeline';
import { District } from './sections/District';
import { Layers } from './sections/Layers';
import { Architecture } from './sections/Architecture';
import { Ecosystem } from './sections/Ecosystem';
import { Limits } from './sections/Limits';
import { Security } from './sections/Security';
import { Return, Finale, Footer } from './sections/Finale';

const WorldCanvas = lazy(() => import('./three/WorldCanvas'));

function Loader() {
  const ready = useStore((s) => s.ready);
  const webgl = useStore((s) => s.webgl);
  const [gone, setGone] = useState(false);
  const done = ready || !webgl;
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setGone(true), 900);
    return () => window.clearTimeout(t);
  }, [done]);
  if (gone) return null;
  return (
    <div
      className={`fixed inset-0 z-[90] flex flex-col items-center justify-center bg-cine-950 transition-opacity duration-700 ${done ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="status"
      aria-live="polite"
    >
      <p className="font-grotesk text-2xl font-semibold tracking-[0.2em] text-mist-50">LAND PULSE</p>
      <div className="mt-5 h-px w-48 overflow-hidden bg-white/10">
        <div className="h-full w-1/3 animate-[loadbar_1.1s_ease-in-out_infinite] bg-gis-400" />
      </div>
      <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-mist-400">Generating the land model</p>
    </div>
  );
}

export default function CinematicLanding() {
  const set = useStore((s) => s.set);
  const reduced = useStore((s) => s.reduced);
  const webgl = useStore((s) => s.webgl);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('cine-page');
    rememberHome(EXPERIENCE_HOME);
    set({ webgl: detectWebGL(), quality: detectQuality(), reduced: prefersReducedMotion(), active: 'hero', selected: -1, hovered: -1 });
    setBooted(true);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => set({ reduced: mq.matches });
    mq.addEventListener('change', onMq);
    // live portfolio figures; the page stays usable if the API is down
    const ctrl = new AbortController();
    fetchSummary(ctrl.signal)
      .then((summary) => set({ summary }))
      .catch(() => undefined);
    if (import.meta.env.DEV) Object.assign(window, { __cine: useStore });
    return () => {
      ctrl.abort();
      mq.removeEventListener('change', onMq);
      document.documentElement.classList.remove('cine-page', 'reduce-motion');
      set({ ready: false, dive: false });
    };
  }, [set]);

  useEffect(() => {
    if (!booted) return;
    document.documentElement.classList.toggle('reduce-motion', reduced);
    startScrollEngine(reduced);
    return () => stopScrollEngine();
  }, [booted, reduced]);

  return (
    <div className="cine">
      <a href="#journey" className="sr-only z-[200] rounded bg-mist-50 px-3 py-2 text-cine-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <Loader />
      {booted &&
        (webgl ? (
          <Suspense fallback={null}>
            <WorldCanvas />
          </Suspense>
        ) : (
          <Fallback2D />
        ))}
      <div className="grain" aria-hidden="true" />
      <Nav />
      <ChapterRail />
      <Cursor />
      <HoverCard />
      <SelectedCard />
      <main className="stage">
        <Hero />
        <Journey />
        <Chain />
        <Causes />
        <Signature />
        <Bottleneck />
        <AIFlow />
        <Explain />
        <LivePortfolio />
        <Officer />
        <Capabilities />
        <Command />
        <Timeline />
        <District />
        <Layers />
        <Architecture />
        <Ecosystem />
        <Limits />
        <Security />
        <Return />
        <Finale />
      </main>
      <Footer />
    </div>
  );
}
