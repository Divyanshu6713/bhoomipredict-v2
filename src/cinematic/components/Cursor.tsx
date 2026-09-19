import { useEffect, useRef, useState } from 'react';
import { useStore, type CursorMode } from '../lib/store';
import { finePointer } from '../lib/env';

const LABEL: Record<CursorMode, string> = {
  default: '',
  explore: 'Explore',
  inspect: 'Inspect',
  explain: 'Explain',
  drag: 'Drag',
};

/** Small dot + trailing ring. Labels come from data-cursor on DOM elements or from the 3D hover state. */
export function Cursor() {
  const [enabled] = useState(() => finePointer());
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CursorMode>('default');
  const [hot, setHot] = useState(false);
  const [flash, setFlash] = useState<CursorMode | null>(null);
  const domMode = useRef<CursorMode | null>(null);
  const overCanvas = useRef(false);
  const cursor3d = useStore((s) => s.cursor3d);
  const reduced = useStore((s) => s.reduced);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add('has-cursor');
    const pos = { x: -100, y: -100, rx: -100, ry: -100 };
    let raf = 0;
    const move = (e: PointerEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      const t = e.target as HTMLElement;
      overCanvas.current = t.tagName === 'CANVAS';
      const el = t.closest?.('[data-cursor]') as HTMLElement | null;
      domMode.current = el ? (el.dataset.cursor as CursorMode) : null;
      setHot(!!t.closest?.('a,button,[role="slider"],[role="tab"],label,summary,[data-cursor]'));
    };
    const loop = () => {
      const k = reduced ? 1 : 0.2;
      pos.rx += (pos.x - pos.rx) * k;
      pos.ry += (pos.y - pos.ry) * k;
      if (dot.current) dot.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${pos.rx}px, ${pos.ry}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    const leave = () => {
      pos.x = pos.y = -100;
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    raf = requestAnimationFrame(loop);
    return () => {
      document.documentElement.classList.remove('has-cursor');
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(raf);
    };
  }, [enabled, reduced]);

  // resolve the mode each time an input changes
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const m = domMode.current ?? (overCanvas.current ? useStore.getState().cursor3d : 'default');
      setMode((prev) => (prev === m ? prev : m));
    }, 60);
    return () => window.clearInterval(id);
  }, [enabled, cursor3d]);

  useEffect(() => {
    if (!enabled) return;
    const down = () => {
      if (mode === 'explore') {
        setFlash('inspect');
        window.setTimeout(() => setFlash(null), 650);
      }
    };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [enabled, mode]);

  if (!enabled) return null;
  const shown = flash ?? mode;
  const big = shown !== 'default';
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100]">
      <div ref={dot} className="absolute left-0 top-0">
        <div className="-ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-mist-50 shadow-[0_0_10px_rgba(159,211,223,0.9)]" />
      </div>
      <div ref={ring} className="absolute left-0 top-0">
        <div
          className="flex items-center justify-center rounded-full border transition-[width,height,margin,border-color,background-color] duration-300 ease-out"
          style={{
            width: big ? 78 : hot ? 38 : 26,
            height: big ? 78 : hot ? 38 : 26,
            marginLeft: big ? -39 : hot ? -19 : -13,
            marginTop: big ? -39 : hot ? -19 : -13,
            borderColor: shown === 'explain' ? 'rgba(225,164,60,0.8)' : 'rgba(159,211,223,0.55)',
            backgroundColor: big ? 'rgba(8,12,16,0.35)' : 'transparent',
          }}
        >
          <span
            className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-mist-50 transition-opacity duration-200"
            style={{ opacity: big ? 1 : 0 }}
          >
            {LABEL[shown]}
          </span>
        </div>
      </div>
    </div>
  );
}
