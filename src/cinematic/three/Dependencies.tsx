import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { world, segmentsToday, today } from '../lib/dataset';
import { corridorZ, stageAt, TODAY } from '../lib/world';
import { useStore } from '../lib/store';
import { C } from '../lib/palette';

/** When a parcel is selected in the command centre, draw what it depends on and what depends on it. */
export function Dependencies() {
  const selected = useStore((s) => s.selected);
  const active = useStore((s) => s.active);
  const show = selected >= 0 && (active === 'command' || active === 'return');
  const data = useMemo(() => {
    if (selected < 0) return null;
    const p = world.parcels[selected];
    const top = new THREE.Vector3(p.cx, p.y + 1.4, p.cz);
    if (!p.acq) return { p, top, arc: null, mates: [] as THREE.Vector3[][], seg: null };
    const [a, b] = world.segmentBounds[p.segment];
    const mx = Math.min(b - 2, Math.max(a + 2, p.cx + (p.cx < (a + b) / 2 ? 6 : -6)));
    const end = new THREE.Vector3(mx, 2.6, corridorZ(mx));
    const mid = top.clone().lerp(end, 0.5);
    mid.y += 3.5;
    const arc = new THREE.QuadraticBezierCurve3(top, mid, end).getPoints(32);
    const mates =
      p.acq.ownerGroup >= 0
        ? world.row
            .filter((q) => q !== p && q.acq!.ownerGroup === p.acq!.ownerGroup)
            .map((q) => {
              const e = new THREE.Vector3(q.cx, q.y + 1.0, q.cz);
              const m = top.clone().lerp(e, 0.5);
              m.y += 1.2;
              return new THREE.QuadraticBezierCurve3(top, m, e).getPoints(16);
            })
        : [];
    return { p, top, arc, mates, seg: segmentsToday[p.segment], end };
  }, [selected]);

  if (!show || !data) return null;
  const { p } = data;
  const st = p.acq ? stageAt(p, TODAY) : -1;
  const blocking = p.acq && st < 10;
  const band = today[p.idx].band;
  return (
    <group>
      <mesh position={[p.cx, p.y + 0.5, p.cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.9, 2.0, 64]} />
        <meshBasicMaterial color={C.mist} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      {data.arc && (
        <>
          <Line points={data.arc} color={blocking ? (band === 'high' ? C.high : C.med) : C.ok} lineWidth={1.8} dashed dashSize={0.4} gapSize={0.2} />
          <Html position={data.arc[data.arc.length - 1].toArray() as [number, number, number]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
            <div className="map-callout fx-in" data-tone={blocking ? (band === 'high' ? 'high' : 'med') : 'ok'}>
              <b>Work front {data.seg!.name}</b>
              <span>
                {data.seg!.ready}/{data.seg!.total} parcels possessed · {blocking ? 'this parcel is pending' : 'this parcel is clear'}
              </span>
            </div>
          </Html>
        </>
      )}
      {data.mates.map((pts, i) => (
        <Line key={i} points={pts} color={C.gis} lineWidth={1.2} transparent opacity={0.85} />
      ))}
      {data.mates.length > 0 && (
        <Html position={data.mates[0][data.mates[0].length - 1].toArray() as [number, number, number]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div className="map-callout fx-in">
            <b>Shared ownership record</b>
            <span>{data.mates.length + 1} parcels, one record set</span>
          </div>
        </Html>
      )}
    </group>
  );
}
