import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useStore, live, SECTIONS, type SectionId } from './store';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
let tick: ((t: number) => void) | null = null;
let heightWatch: ResizeObserver | null = null;

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { duration: 1.6, offset: 0 });
  else el.scrollIntoView({ behavior: useStore.getState().reduced ? 'auto' : 'smooth' });
}

function setActive(id: SectionId) {
  const s = useStore.getState();
  if (s.active === id) return;
  s.set({
    active: id,
    hovered: -1,
    selected: -1,
    cursor3d: 'default',
    chainHover: null,
    xaiHover: null,
    stackHover: -1,
  });
}

/** Smooth scrolling + per-section progress (0..1) and "active section" tracking. */
export function startScrollEngine(reduced: boolean) {
  stopScrollEngine();
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    tick = (t: number) => lenis?.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
  }
  for (const id of SECTIONS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const pinned = el.dataset.pinned === 'true';
    ScrollTrigger.create({
      trigger: el,
      start: pinned ? 'top top' : 'top bottom',
      end: pinned ? 'bottom bottom' : 'bottom top',
      onUpdate: (self) => {
        live.progress[id] = self.progress;
      },
      onRefresh: (self) => {
        live.progress[id] = self.progress;
      },
    });
    ScrollTrigger.create({
      trigger: el,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => {
        if (self.isActive) setActive(id);
      },
    });
  }
  ScrollTrigger.refresh();
  // live data, fonts and images change the page height after start-up: re-measure
  let t = 0;
  let lastH = document.documentElement.scrollHeight;
  heightWatch = new ResizeObserver(() => {
    const h = document.documentElement.scrollHeight;
    if (Math.abs(h - lastH) < 2) return;
    lastH = h;
    window.clearTimeout(t);
    t = window.setTimeout(() => ScrollTrigger.refresh(), 150);
  });
  heightWatch.observe(document.body);
}

export function stopScrollEngine() {
  heightWatch?.disconnect();
  heightWatch = null;
  ScrollTrigger.getAll().forEach((t) => t.kill());
  if (tick) gsap.ticker.remove(tick);
  tick = null;
  lenis?.destroy();
  lenis = null;
}

export function stopLenis(stop: boolean) {
  if (!lenis) return;
  if (stop) lenis.stop();
  else lenis.start();
}
