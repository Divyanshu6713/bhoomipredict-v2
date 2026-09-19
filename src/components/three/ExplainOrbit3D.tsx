/**
 * Case explanation in 3D (light theme). The parcel sits in the middle; each
 * contributing factor orbits it, sized by the size of its SHAP contribution,
 * with a flow line running into the parcel (risk-raising) or out of it
 * (risk-reducing). Same numbers as the bar list beside it — a view, not a new analysis.
 */
import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RISK_HEX } from '@/lib/risk';
import type { Contributor, RiskLevel } from '@/data/types';

const UP = '#E0702A';
const shortName = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);
const DOWN = '#2F9E6E';

function flowMaterial(color: string, inward: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uDir: { value: inward ? 1 : -1 }, uO: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uDir; uniform float uO; varying vec2 vUv;
      void main(){
        float d = fract(vUv.x * 5.0 - uTime * 0.9 * uDir);
        float pulse = smoothstep(0.0, 0.2, d) * (1.0 - smoothstep(0.35, 0.6, d));
        gl_FragColor = vec4(uColor, uO * (0.25 + 0.75 * pulse));
      }`,
  });
}

function Scene({
  items,
  band,
  hover,
  setHover,
  reduced,
}: {
  items: Contributor[];
  band: RiskLevel;
  hover: number;
  setHover: (i: number) => void;
  reduced: boolean;
}) {
  const max = Math.max(0.05, ...items.map((c) => Math.abs(c.value)));
  const layout = useMemo(
    () =>
      items.map((_, i) => {
        const a = (i / items.length) * Math.PI * 2 + 0.4;
        return new THREE.Vector3(Math.cos(a) * 2.5, 1.0 + (i % 2) * 0.9, Math.sin(a) * 2.5);
      }),
    [items],
  );
  const flows = useMemo(
    () =>
      layout.map((p, i) => {
        const inward = items[i].value >= 0;
        const from = inward ? p : new THREE.Vector3(0, 0.6, 0);
        const to = inward ? new THREE.Vector3(0, 0.6, 0) : p;
        const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.8, 0));
        return {
          geo: new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 40, 0.035, 6, false),
          mat: flowMaterial(inward ? UP : DOWN, true),
        };
      }),
    [layout, items],
  );
  const spheres = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }, dt) => {
    const k = 1 - Math.exp(-dt * 8);
    flows.forEach((f, i) => {
      f.mat.uniforms.uTime.value = reduced ? 0 : clock.elapsedTime;
      f.mat.uniforms.uO.value = hover >= 0 && hover !== i ? 0.25 : 1;
    });
    items.forEach((c, i) => {
      const m = spheres.current[i];
      if (!m) return;
      const r = (0.14 + (Math.abs(c.value) / max) * 0.34) * (hover === i ? 1.35 : 1);
      m.scale.setScalar(m.scale.x + (r - m.scale.x) * k);
    });
  });
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfd6de', 1.1]} />
      <directionalLight position={[4, 8, 5]} intensity={1.3} />
      {/* the parcel */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.2, 0.5, 0.85]} />
        <meshStandardMaterial color={RISK_HEX[band]} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.45, 2.49, 96]} />
        <meshBasicMaterial color="#9aa6b2" transparent opacity={0.5} />
      </mesh>
      {items.map((c, i) => (
        <group key={c.group}>
          <mesh geometry={flows[i].geo} material={flows[i].mat} raycast={() => null} />
          <mesh
            position={layout[i]}
            ref={(el) => {
              spheres.current[i] = el;
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHover(i);
            }}
            onPointerOut={() => setHover(-1)}
          >
            <sphereGeometry args={[1, 24, 24]} />
            <meshStandardMaterial color={c.value >= 0 ? UP : DOWN} roughness={0.35} emissive={c.value >= 0 ? UP : DOWN} emissiveIntensity={hover === i ? 0.35 : 0.08} />
          </mesh>
          <Html position={[layout[i].x, layout[i].y + 0.75, layout[i].z]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <span
              className={`whitespace-nowrap rounded-md border bg-surface/95 px-1.5 py-0.5 text-2xs shadow-xs transition-opacity ${hover >= 0 && hover !== i ? 'opacity-40' : 'opacity-100'} ${hover === i ? 'border-ink-3 font-semibold text-ink' : 'border-line text-ink-2'}`}
            >
              {shortName(c.label ?? c.group)} <span className="num">{c.value >= 0 ? '+' : '−'}{Math.abs(c.value).toFixed(2)}</span>
            </span>
          </Html>
        </group>
      ))}
      <OrbitControls enableZoom={false} enablePan={false} autoRotate={!reduced && hover < 0} autoRotateSpeed={0.6} maxPolarAngle={Math.PI * 0.42} minPolarAngle={Math.PI * 0.18} />
    </>
  );
}

export default function ExplainOrbit3D({ contributors, band, unit, height = 300 }: { contributors: Contributor[]; band: RiskLevel; unit: string; height?: number }) {
  const items = useMemo(() => contributors.slice(0, 6), [contributors]);
  const [hover, setHover] = useState(-1);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const h = hover >= 0 ? items[hover] : null;
  return (
    <div>
      <div
        className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-b from-surface-2 to-surface"
        style={{ height }}
        role="img"
        aria-label={`3D view of the case's contributing factors: ${items.map((c) => `${c.label ?? c.group} ${c.value >= 0 ? 'raises' : 'lowers'} the prediction by ${Math.abs(c.value).toFixed(2)}`).join('; ')}.`}
      >
        <Canvas dpr={[1, 1.75]} camera={{ fov: 38, position: [0, 7.2, 10.5] }} gl={{ antialias: true, alpha: true }}>
          <Scene items={items} band={band} hover={hover} setHover={setHover} reduced={reduced} />
        </Canvas>
      </div>
      <p className="mt-2 min-h-[36px] text-xs text-ink-3" aria-live="polite">
        {h ? (
          <>
            <span className="font-semibold text-ink">{h.label ?? h.group}</span>{' '}
            <span className="num">{h.value >= 0 ? '+' : '−'}{Math.abs(h.value).toFixed(2)}</span> {unit} — {h.value >= 0 ? 'raises' : 'lowers'} the predicted risk
            {h.features?.length ? ` (${h.features.join(', ')})` : ''}. It contributed to the prediction; it is not a proven cause.
          </>
        ) : (
          <>Orange factors flow into the parcel (raise the prediction); green flow out (lower it). Hover a factor for its value.</>
        )}
      </p>
    </div>
  );
}
