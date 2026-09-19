import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { hero, today } from '../lib/dataset';
import { useStore } from '../lib/store';
import { C, pct } from '../lib/palette';
import { SIGNATURE_LAYERS, contributionOf } from '../lib/content';
import { useFade } from './util';

const S = today[hero.idx].score!;
const BASE: [number, number, number] = [hero.cx, hero.y + 1.4, hero.cz];

/** The hero parcel lifted out of the land and split into its signal layers. */
export function SignatureParcel() {
  const { v, mounted } = useFade(() => useStore.getState().active === 'signature', 3);
  const step = useStore((s) => s.signatureStep);
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    hero.poly.forEach(([x, z], i) => {
      const px = (x - hero.cx) * 1.25;
      const py = -(z - hero.cz) * 1.25;
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    });
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  const layers = useRef<(THREE.Group | null)[]>([]);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const lineMats = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  const max = Math.max(...SIGNATURE_LAYERS.map((l) => contributionOf(l.key)));

  useFrame((_, dt) => {
    const reduced = useStore.getState().reduced;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
    SIGNATURE_LAYERS.forEach((_, i) => {
      const g = layers.current[i];
      if (!g) return;
      const target = step === 0 ? i * 0.27 : 0.4 + i * 1.55;
      g.position.y += (target - g.position.y) * k;
      const m = mats.current[i];
      if (m) m.opacity = v.current * (step === 0 ? 0.92 : 0.8);
      const lm = lineMats.current[i];
      if (lm) lm.opacity = v.current * 0.9;
    });
  });

  if (!mounted) return null;
  return (
    <group position={BASE}>
      {SIGNATURE_LAYERS.map((l, i) => {
        const c = contributionOf(l.key) / max;
        const color = new THREE.Color(C.parcelRow).lerp(new THREE.Color(i === 0 ? C.high : C.med), 0.35 + c * 0.55);
        return (
          <group
            key={l.key}
            ref={(el) => {
              layers.current[i] = el;
            }}
          >
            <mesh geometry={geo}>
              <meshStandardMaterial
                ref={(m) => {
                  mats.current[i] = m;
                }}
                color={color}
                emissive={color}
                emissiveIntensity={step === 0 ? 0.15 : 0.35}
                transparent
                roughness={0.6}
              />
            </mesh>
            <lineSegments geometry={edges}>
              <lineBasicMaterial
                ref={(m) => {
                  lineMats.current[i] = m;
                }}
                color={step === 0 ? C.mist : i === 0 ? C.high : C.med}
                transparent
              />
            </lineSegments>
            {step >= 1 && (
              <Html position={[2.6, 0.15, 0]} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
                <div className="layer-tag fx-in" style={{ animationDelay: `${i * 90}ms` }}>
                  <span>{l.layer}</span>
                  <b>{l.driver}</b>
                  <em style={{ width: `${Math.max(8, c * 100)}%` }} />
                </div>
              </Html>
            )}
            {step === 2 && (
              <>
                <Line points={[[-1.6, 0.15, 0], [-3.4, 0.4, 0.4]]} color={C.gis} lineWidth={1} transparent opacity={0.7} />
                <Html position={[-3.5, 0.45, 0.4]} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
                  <div className="check-tag fx-in" style={{ animationDelay: `${120 + i * 110}ms` }}>
                    <i>Check</i>
                    {l.check}
                  </div>
                </Html>
              </>
            )}
          </group>
        );
      })}
      {step === 0 && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.4, 0]}>
            <ringGeometry args={[1.9, 2.05, 96, 1, Math.PI / 2, Math.PI * 2 * S.p]} />
            <meshBasicMaterial color={C.high} transparent opacity={0.9} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <Html position={[0, 3.2, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
            <div className="risk-bubble fx-in">
              <b>{pct(S.p)}</b>
              <span>predicted probability of missing the next milestone</span>
            </div>
          </Html>
        </>
      )}
    </group>
  );
}
