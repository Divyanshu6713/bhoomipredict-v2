import { useEffect, useRef, useState } from 'react';

/** Polls a non-reactive value on rAF and re-renders only when it changes (DOM side). */
export function useLiveValue<T>(fn: () => T): T {
  const [v, setV] = useState<T>(fn);
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    let raf = 0;
    let last = f.current();
    const loop = () => {
      const n = f.current();
      if (n !== last) {
        last = n;
        setV(n);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return v;
}
