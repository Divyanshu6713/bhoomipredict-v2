import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { hero, today } from '../lib/dataset';
import { useStore, live } from '../lib/store';
import { C, pct } from '../lib/palette';
import { journeyStep } from './mode';
import { useLive } from './useLive';

const S = today[hero.idx].score!;
const BASE_Y = hero.y + 1.2;
const A = hero.acq!;

export const HERO_DATA = [
  { k: 'Area', v: `${hero.areaHa.toFixed(2)} ha` },
  { k: 'Ownership', v: `${A.owners} records · ${A.unresolved} unresolved` },
  { k: 'Compensation', v: 'Not initiated' },
  { k: 'Legal', v: 'Active case' },
  { k: 'Last action', v: `${Math.round(S.idleDays)} days ago` },
  { k: 'Families', v: `${A.families} affected` },
];

export const HERO_ACTIONS = [
  'Check payment file and beneficiary verification',
  'Refer ownership conflict for record reconciliation / legal review',
  'Check statutory prerequisites for possession',
];

export function JourneyFX() {
  const active = useLive(() => useStore.getState().active === 'journey');
  const step = useLive(() => journeyStep(live.progress.journey));
  if (!active) return null;
  return (
    <group>
      {step >= 2 && step <= 3 && <DataChips faded={step === 3} />}
      {step >= 3 && <RiskRing big={step === 3} />}
      {step === 4 && <Contributors />}
      {step === 5 && <Actions />}
    </group>
  );
}

function DataChips({ faded }: { faded: boolean }) {
  const pts = useMemo(
    () =>
      HERO_DATA.map((_, i) => {
        // fan out across the back half of the parcel, away from the camera
        const a = Math.PI * (1.08 + 0.84 * (i / (HERO_DATA.length - 1)));
        const r = 4.2;
        return [hero.cx + Math.cos(a) * r, BASE_Y + 1.4 + (i % 2) * 1.3, hero.cz + Math.sin(a) * r * 0.7] as [number, number, number];
      }),
    [],
  );
  return (
    <group>
      {pts.map((p, i) => (
        <group key={i}>
          <Line points={[[hero.cx, BASE_Y, hero.cz], p]} color={C.gis} lineWidth={1} transparent opacity={faded ? 0.15 : 0.5} dashed dashSize={0.15} gapSize={0.1} />
          <Html position={p} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`data-chip fx-in ${faded ? 'is-faded' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
              <span>{HERO_DATA[i].k}</span>
              <b>{HERO_DATA[i].v}</b>
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

function RiskRing({ big }: { big: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const ripple = useRef<THREE.Mesh>(null);
  const rippleMat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const reduced = useStore.getState().reduced;
    if (ring.current) ring.current.rotation.z = reduced ? 0 : t * 0.4;
    if (ripple.current && rippleMat.current) {
      const f = reduced ? 0.5 : (t * 0.6) % 1;
      ripple.current.scale.setScalar(1 + f * 1.6);
      rippleMat.current.opacity = (1 - f) * 0.5;
    }
  });
  const arc = Math.PI * 2 * S.p;
  return (
    <group position={[hero.cx, BASE_Y + 0.15, hero.cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.05, 2.12, 96]} />
        <meshBasicMaterial color={C.mist} transparent opacity={0.18} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.0, 2.2, 96, 1, 0, arc]} />
        <meshBasicMaterial color={C.high} transparent opacity={0.95} toneMapped={false} />
      </mesh>
      <mesh ref={ripple} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.0, 2.06, 96]} />
        <meshBasicMaterial ref={rippleMat} color={C.high} transparent opacity={0.4} />
      </mesh>
      {big && (
        <Html position={[0, 2.2, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div className="risk-bubble fx-in">
            <b>{pct(S.p)}</b>
            <span>predicted probability of missing the next milestone ({S.nextMilestone})</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function Contributors() {
  const rows = S.rows.filter((r) => r.contribution > 0).slice(0, 4);
  const max = rows[0].contribution;
  return (
    <group>
      {rows.map((r, i) => {
        const x = hero.cx - 3.3 + i * 2.2;
        const z = hero.cz - 2.4;
        const h = 0.6 + (r.contribution / max) * 3.2;
        return (
          <group key={r.key} position={[x, BASE_Y - 0.6, z]}>
            <mesh position={[0, h / 2, 0]}>
              <boxGeometry args={[0.55, h, 0.55]} />
              <meshBasicMaterial color={i === 0 ? C.high : C.med} transparent opacity={0.85} toneMapped={false} />
            </mesh>
            <Line points={[[0, 0, 0], [hero.cx - x, 0.6, hero.cz - z]]} color={C.med} lineWidth={1} transparent opacity={0.35} />
            <Html position={[0, h + 0.7 + (i % 2) * 1.1, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
              <div className="bar-label fx-in" style={{ animationDelay: `${i * 90}ms` }}>
                <span>{r.label}</span>
                <b>+{r.contribution.toFixed(2)}</b>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function Actions() {
  return (
    <group>
      {HERO_ACTIONS.map((a, i) => {
        // stacked to the right of the parcel so the chips never overlap
        const p: [number, number, number] = [hero.cx + 5.5, BASE_Y + 7.5 - i * 2.4, hero.cz + 1];
        return (
          <group key={a}>
            <Line points={[[hero.cx, BASE_Y + 0.4, hero.cz], p]} color={C.gis} lineWidth={1} transparent opacity={0.45} />
            <Html position={p} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
              <div className="action-chip fx-in" style={{ animationDelay: `${i * 110}ms`, transform: 'translateY(-50%)' }}>
                <i>{String(i + 1).padStart(2, '0')}</i>
                {a}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
