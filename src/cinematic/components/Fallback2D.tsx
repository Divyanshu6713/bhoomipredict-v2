import { useMemo, useState } from 'react';
import { world, today } from '../lib/dataset';
import { BAND_COLOR, C, pct } from '../lib/palette';
import { useStore } from '../lib/store';

/** Shown when WebGL2 is unavailable: the same parcels as a flat, interactive SVG map. */
export function Fallback2D() {
  const [hover, setHover] = useState(-1);
  const set = useStore((s) => s.set);
  const paths = useMemo(
    () =>
      world.parcels.map((p) => ({
        idx: p.idx,
        d: 'M' + p.poly.map(([x, z]) => `${(x + 72).toFixed(2)},${(z + 36).toFixed(2)}`).join('L') + 'Z',
        fill: p.acq && today[p.idx].band ? BAND_COLOR[today[p.idx].band!] : p.acq ? '#18231f' : C.parcel,
      })),
    [],
  );
  const h = hover >= 0 ? world.parcels[hover] : null;
  return (
    <div className="world bg-cine-950" aria-hidden="true">
      <svg viewBox="0 0 144 72" preserveAspectRatio="xMidYMid slice" className="h-full w-full opacity-70">
        {paths.map((p) => (
          <path
            key={p.idx}
            d={p.d}
            fill={p.fill}
            stroke={C.gisDim}
            strokeWidth={0.06}
            onMouseEnter={() => setHover(p.idx)}
            onMouseLeave={() => setHover(-1)}
            onClick={() => set({ focusId: world.parcels[p.idx].id })}
          />
        ))}
      </svg>
      {h && (
        <div className="panel pointer-events-none fixed bottom-6 right-6 z-40 p-4 text-sm">
          Parcel {h.id} {today[h.idx].score && today[h.idx].band ? `· ${pct(today[h.idx].score!.p)}` : ''}
        </div>
      )}
    </div>
  );
}
