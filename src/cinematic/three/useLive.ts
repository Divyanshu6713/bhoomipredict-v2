import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';

/** Samples a per-frame value inside the Canvas and re-renders only when it changes. */
export function useLive<T>(fn: () => T): T {
  const [v, setV] = useState<T>(fn);
  const last = useRef<T>(v);
  useFrame(() => {
    const n = fn();
    if (n !== last.current) {
      last.current = n;
      setV(n);
    }
  });
  return v;
}
