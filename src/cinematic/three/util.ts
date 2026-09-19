import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../lib/store';

/**
 * Eases a 0..1 visibility towards `pred()` each frame. `mounted` stays true
 * while fading out so children can animate away before unmounting.
 */
export function useFade(pred: () => boolean, speed = 4) {
  const v = useRef(0);
  const [mounted, setMounted] = useState(false);
  useFrame((_, dt) => {
    const on = pred();
    const reduced = useStore.getState().reduced;
    const target = on ? 1 : 0;
    v.current = reduced ? target : v.current + (target - v.current) * (1 - Math.exp(-dt * speed));
    if (Math.abs(v.current - target) < 0.002) v.current = target;
    const shouldMount = on || v.current > 0.001;
    if (shouldMount !== mounted) setMounted(shouldMount);
  });
  return { v, mounted };
}

export const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Maps p in [a,b] to 0..1 (clamped, smoothed). */
export const seg = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
