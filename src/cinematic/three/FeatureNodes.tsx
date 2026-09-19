import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { world, hero } from '../lib/dataset';
import { score, type FeatureKey } from '../lib/model';
import { TODAY } from '../lib/world';
import { useStore } from '../lib/store';
import { C, fmtC } from '../lib/palette';
import { U } from './uniforms';
import { useFade } from './util';

const flowMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: U.uTime,
      uColor: { value: new THREE.Color(C.med) },
      uOpacity: { value: 0 },
      uSpeed: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSpeed;
      varying vec2 vUv;
      void main() {
        float d = fract(vUv.x * 7.0 - uTime * uSpeed);
        float pulse = smoothstep(0.0, 0.15, d) * (1.0 - smoothstep(0.3, 0.55, d));
        gl_FragColor = vec4(uColor, uOpacity * (0.18 + pulse * 0.82));
        #include <colorspace_fragment>
      }
    `,
  });

/** "Why is this case high risk?" — features orbit the parcel, sized by their contribution. */
export function FeatureNodes() {
  const { v, mounted } = useFade(() => useStore.getState().active === 'xai', 3);
  const focusId = useStore((s) => s.focusId);
  const whatIf = useStore((s) => s.whatIf);
  const hoverKey = useStore((s) => s.xaiHover);
  const set = useStore((s) => s.set);
  const parcel = world.byId.get(focusId) ?? hero;
  const baseScore = useMemo(() => score(parcel, TODAY), [parcel]);
  const current = useMemo(() => score(parcel, TODAY, whatIf), [parcel, whatIf]);
  const keys = useMemo(
    () =>
      (baseScore?.rows ?? [])
        .filter((r) => r.key !== 'ptype')
        .slice(0, 8)
        .map((r) => r.key),
    [baseScore],
  );
  const center = useMemo(() => new THREE.Vector3(parcel.cx, parcel.y + 1.25, parcel.cz), [parcel]);
  const layout = useMemo(
    () =>
      keys.map((_, i) => {
        const a = Math.PI * (1.12 + 0.76 * (i / Math.max(1, keys.length - 1)));
        return new THREE.Vector3(center.x + Math.cos(a) * 7.4, center.y + 1.4 + (i % 3) * 1.5, center.z + Math.sin(a) * 4.6);
      }),
    [keys, center],
  );
  const tubes = useMemo(
    () =>
      layout.map((p) => {
        const mid = p.clone().lerp(center, 0.5);
        mid.y += 1.2;
        const curve = new THREE.QuadraticBezierCurve3(p, mid, center);
        return { geo: new THREE.TubeGeometry(curve, 48, 0.035, 5, false), mat: flowMat() };
      }),
    [layout, center],
  );
  const spheres = useRef<(THREE.Mesh | null)[]>([]);
  const maxAbs = Math.max(0.2, ...(baseScore?.rows ?? []).map((r) => Math.abs(r.contribution)));

  useFrame((_, dt) => {
    const s = useStore.getState();
    const k = s.reduced ? 1 : 1 - Math.exp(-dt * 6);
    keys.forEach((key, i) => {
      const row = current?.rows.find((r) => r.key === key);
      const c = row?.contribution ?? 0;
      const m = spheres.current[i];
      const hov = s.xaiHover === key;
      const r = (0.16 + (Math.abs(c) / maxAbs) * 0.62) * (hov ? 1.45 : 1);
      if (m) {
        m.scale.setScalar(m.scale.x + (r - m.scale.x) * k);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.set(c > 0.05 ? (i === 0 ? C.high : C.med) : c < -0.05 ? C.gis : '#5b6770');
        mat.opacity = v.current * (s.xaiHover && !hov ? 0.4 : 1);
      }
      const t = tubes[i];
      if (t) {
        t.mat.uniforms.uColor.value.set(c > 0.05 ? C.med : c < -0.05 ? C.gis : '#5b6770');
        t.mat.uniforms.uOpacity.value = v.current * Math.min(1, 0.25 + Math.abs(c) / maxAbs) * (s.xaiHover && !hov ? 0.35 : 1);
        t.mat.uniforms.uSpeed.value = s.reduced ? 0 : 0.4 + Math.abs(c) * 0.8;
      }
    });
  });

  if (!mounted || !current) return null;
  return (
    <group>
      {keys.map((key, i) => {
        const row = current.rows.find((r) => r.key === key)!;
        const hov = hoverKey === key;
        return (
          <group key={key}>
            <mesh geometry={tubes[i].geo} material={tubes[i].mat} raycast={() => null} />
            <mesh
              position={layout[i]}
              ref={(el) => {
                spheres.current[i] = el;
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                set({ xaiHover: key as FeatureKey, cursor3d: 'explain' });
              }}
              onPointerOut={() => set({ xaiHover: null, cursor3d: 'default' })}
            >
              <sphereGeometry args={[1, 24, 24]} />
              <meshBasicMaterial transparent toneMapped={false} />
            </mesh>
            <Html position={[layout[i].x, layout[i].y + 1.0, layout[i].z]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`feat-label ${hov ? 'is-on' : ''} ${hoverKey && !hov ? 'is-dim' : ''}`}>
                <span>{row.label}</span>
                <b>{fmtC(row.contribution)}</b>
                {hov && (
                  <p>
                    Model contribution (log-odds). {row.imputed ? 'Value missing — imputed, so it adds nothing. ' : ''}This
                    feature contributed to the model's prediction — it is not a proven cause of delay.
                  </p>
                )}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
