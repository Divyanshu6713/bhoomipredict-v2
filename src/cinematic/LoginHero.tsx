/**
 * The top band of the sign-in page: the same 3D land as the landing, with the
 * camera rising out of the ground — so arriving from the landing's dive feels
 * like one continuous move. Decorative only; the sign-in form below is unchanged.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import '@fontsource-variable/space-grotesk';
import './cinematic.css';
import { useStore } from './lib/store';
import { detectQuality, detectWebGL, prefersReducedMotion } from './lib/env';
import { setCameraStart } from './three/CameraRig';

const WorldCanvas = lazy(() => import('./three/WorldCanvas'));

export default function LoginHero({ children }: { children: ReactNode }) {
  const set = useStore((s) => s.set);
  const [webgl] = useState(detectWebGL);
  useEffect(() => {
    const q = detectQuality();
    set({ active: 'login', quality: q === 'high' ? 'medium' : q, reduced: prefersReducedMotion(), selected: -1, hovered: -1, dive: false });
    // start low in the land, then pull back out
    setCameraStart([0, 4, 9], [0, 0, -3]);
    return () => set({ ready: false });
  }, [set]);
  return (
    <div className="cine cine-banner relative overflow-hidden">
      {webgl && (
        <Suspense fallback={null}>
          <WorldCanvas />
        </Suspense>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cine-950/75 via-cine-950/25 to-cine-950/90" />
      <div className="relative">{children}</div>
    </div>
  );
}
