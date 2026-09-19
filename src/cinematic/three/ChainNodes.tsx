import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { CHAIN, CONSTRUCTION, downstream } from '../lib/stages';
import { useStore } from '../lib/store';
import { C } from '../lib/palette';
import { U } from './uniforms';
import { useFade } from './util';

const N = CHAIN.length;
export const CHAIN_POS: [number, number, number][] = [...CHAIN.map((_, i) => i), N].map((i) => {
  const x = -23 + (i / N) * 46;
  const z = 4 - Math.pow(x / 24, 2) * 8;
  const y = 12.5 + Math.sin(i * 0.9) * 0.7;
  return [x, y, z];
});

const ids = [...CHAIN.map((c) => c.id), CONSTRUCTION.id];
const cyan = new THREE.Color(C.gis);
const amber = new THREE.Color(C.med);
const white = new THREE.Color('#e9f6f8');
const dimC = new THREE.Color('#2b4048');

export function ChainNodes() {
  const { v, mounted } = useFade(() => useStore.getState().active === 'chain', 3);
  const hover = useStore((s) => s.chainHover);
  const deps = useMemo(() => (hover ? downstream(hover) : new Set<string>()), [hover]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(CHAIN_POS.map((p) => new THREE.Vector3(...p))), []);
  const tubeGeo = useMemo(() => new THREE.TubeGeometry(curve, 300, 0.06, 6, false), [curve]);
  const tubeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: U.uTime, uOpacity: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            float dash = step(0.55, fract(vUv.x * 60.0 - uTime * 0.8));
            vec3 col = mix(vec3(0.18, 0.33, 0.37), vec3(0.45, 0.72, 0.78), dash);
            gl_FragColor = vec4(col, uOpacity * (0.55 + dash * 0.45));
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );
  const pulse = useRef<THREE.Mesh>(null);
  const u = useRef(0);
  const nodes = useRef<(THREE.Group | null)[]>([]);
  const cores = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const wires = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1)), []);

  useFrame(({ clock }, dt) => {
    const s = useStore.getState();
    const o = v.current;
    tubeMat.uniforms.uOpacity.value = o;
    const t = clock.elapsedTime;
    if (!s.chainHover && !s.reduced) u.current = (u.current + dt * 0.055) % 1;
    if (pulse.current) {
      pulse.current.position.copy(curve.getPointAt(u.current));
      (pulse.current.material as THREE.MeshBasicMaterial).opacity = o * (s.chainHover ? 0.35 : 1);
    }
    const pulseIdx = Math.min(N, Math.round(u.current * N));
    ids.forEach((id, i) => {
      const g = nodes.current[i];
      if (!g) return;
      const isHover = s.chainHover === id;
      const isDep = deps.has(id);
      const some = !!s.chainHover;
      const target = isHover ? 1.55 : isDep ? 1.2 : !some && pulseIdx === i ? 1.12 : 1;
      const sc = g.scale.x + (target - g.scale.x) * (1 - Math.exp(-dt * 8));
      g.scale.setScalar(sc);
      if (!s.reduced) g.rotation.y = t * 0.25 + i;
      const col = isHover ? white : isDep ? amber : some ? dimC : cyan;
      const core = cores.current[i];
      const wire = wires.current[i];
      if (core) {
        core.color.lerp(col, 0.15);
        core.opacity = o * (isHover || isDep ? 1 : some ? 0.45 : 0.85);
      }
      if (wire) {
        wire.color.lerp(col, 0.15);
        wire.opacity = o * (isHover || isDep ? 0.9 : some ? 0.2 : 0.45);
      }
    });
  });

  const set = useStore((s) => s.set);
  if (!mounted) return null;

  const hoverIdx = hover ? ids.indexOf(hover) : -1;
  return (
    <group>
      <mesh geometry={tubeGeo} material={tubeMat} raycast={() => null} />
      <mesh ref={pulse}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshBasicMaterial color={'#e9f6f8'} transparent toneMapped={false} />
      </mesh>
      {ids.map((id, i) => {
        const isBuild = id === CONSTRUCTION.id;
        const label = isBuild ? CONSTRUCTION.label : CHAIN[i].short;
        return (
          <group
            key={id}
            position={CHAIN_POS[i]}
            ref={(el) => {
              nodes.current[i] = el;
            }}
          >
            <mesh
              onPointerOver={(e) => {
                e.stopPropagation();
                set({ chainHover: id, cursor3d: 'explore' });
              }}
              onPointerOut={() => set({ chainHover: null, cursor3d: 'default' })}
            >
              <sphereGeometry args={[1.35, 12, 12]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {isBuild ? (
              <mesh>
                <boxGeometry args={[0.9, 0.9, 0.9]} />
                <meshBasicMaterial
                  ref={(m) => {
                    cores.current[i] = m;
                  }}
                  color={C.gis}
                  transparent
                  toneMapped={false}
                />
              </mesh>
            ) : (
              <mesh>
                <sphereGeometry args={[0.42, 20, 20]} />
                <meshBasicMaterial
                  ref={(m) => {
                    cores.current[i] = m;
                  }}
                  color={C.gis}
                  transparent
                  toneMapped={false}
                />
              </mesh>
            )}
            <lineSegments geometry={edges} raycast={() => null}>
              <lineBasicMaterial
                ref={(m) => {
                  wires.current[i] = m;
                }}
                color={C.gis}
                transparent
              />
            </lineSegments>
            <Html position={[0, isBuild ? 1.9 : -1.9, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`chain-label ${hover === id ? 'is-on' : ''} ${deps.has(id) ? 'is-dep' : ''}`}>
                {!isBuild && <i>{String(i + 1).padStart(2, '0')}</i>}
                {label}
              </div>
            </Html>
          </group>
        );
      })}
      {hoverIdx >= 0 &&
        [...deps].map((d) => {
          const j = ids.indexOf(d);
          const a = new THREE.Vector3(...CHAIN_POS[hoverIdx]);
          const b = new THREE.Vector3(...CHAIN_POS[j]);
          const mid = a.clone().lerp(b, 0.5);
          mid.y += 2.5 + Math.abs(j - hoverIdx) * 0.6;
          const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(32);
          return <Line key={d} points={pts} color={C.med} lineWidth={1.4} transparent opacity={0.8} dashed dashSize={0.35} gapSize={0.2} />;
        })}
    </group>
  );
}
