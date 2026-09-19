import type { Quality } from './store';

export function detectWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    return !!gl;
  } catch {
    return false;
  }
}

export function detectQuality(): Quality {
  const w = window.innerWidth;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (w < 768) return 'low';
  if (w < 1100 || coarse || cores <= 4) return 'medium';
  return 'high';
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const finePointer = () => window.matchMedia('(pointer: fine)').matches;
