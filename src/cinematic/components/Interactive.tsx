import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { useStore } from '../lib/store';

/** Buttons drift slightly toward the cursor. */
export function Magnetic({ children, strength = 0.28, className = '' }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useStore((s) => s.reduced);
  const onMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== 'mouse') return;
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <span
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={`pe inline-block transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
    </span>
  );
}

/** Cards tilt a few degrees toward the cursor. */
export function Tilt({
  children,
  className = '',
  max = 6,
  style,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useStore((s) => s.reduced);
  const onMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== 'mouse') return;
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${-py * max}deg) rotateY(${px * max}deg) translateZ(0)`;
    el.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    el.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={style}
      className={`transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  );
}

/** Numbers count smoothly to their value when first seen and whenever it changes. */
export function CountUp({
  value,
  format = (v: number) => Math.round(v).toLocaleString('en-IN'),
  duration = 1100,
  className = '',
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const [seen, setSeen] = useState(false);
  const reduced = useStore((s) => s.reduced);
  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!seen) return;
    const from = shown.current;
    if (reduced) {
      shown.current = value;
      ref.current!.textContent = format(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      shown.current = from + (value - from) * e;
      if (ref.current) ref.current.textContent = format(shown.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, seen, reduced, duration, format]);
  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}

/** Reveals children when scrolled into view. */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setOn(true), { threshold: 0.15 });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${on ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-5 opacity-0 blur-[2px]'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
