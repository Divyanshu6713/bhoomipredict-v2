import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { world, segmentsToday } from '../lib/dataset';
import { corridorZ, corridorSlope, terrainHeight, ROW_HALF, X_MIN, X_MAX, CLUSTER_X } from '../lib/world';
import { useStore, live } from '../lib/store';
import { C } from '../lib/palette';
import { U, FOG_GLSL } from './uniforms';
import { resolveMode, journeyStep } from './mode';
import { useFade } from './util';

const ROAD_W = 1.25;
const roadY = (x: number) => Math.max(terrainHeight(x, corridorZ(x)), 0) + 0.36;

function normalAt(x: number): [number, number] {
  const s = corridorSlope(x);
  const l = Math.hypot(1, s);
  return [-s / l, 1 / l];
}

const roadVert = /* glsl */ `
  attribute float aAvail;
  varying float vAvail;
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vW;
  void main() {
    vAvail = aAvail;
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const roadFrag = /* glsl */ `
  uniform float uDay;
  uniform float uDim;
  uniform float uFade;
  uniform float uReveal;
  uniform float uTime;
  ${FOG_GLSL}
  varying float vAvail;
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vW;
  void main() {
    float r = length(vW.xz * vec2(0.9, 1.25));
    if (r > uReveal * 150.0 - 6.0) discard;
    float built = uDay - vAvail;
    if (built < 0.0) discard;
    vec3 col = vec3(0.075, 0.085, 0.095);
    float edge = step(0.9, abs(vUv.y * 2.0 - 1.0));
    float lane = step(0.5, fract(vUv.x * 0.9)) * (1.0 - step(0.035, abs(vUv.y - 0.5)));
    col += vec3(0.5, 0.55, 0.58) * (edge * 0.35 + lane * 0.4);
    // the active construction front glows for a few weeks
    float front = 1.0 - smoothstep(0.0, 40.0, built);
    col += vec3(0.9, 0.6, 0.25) * front * 0.55;
    col *= uDim * uFade;
    col = applyFog(col, vDepth);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function Road() {
  const geometry = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const av: number[] = [];
    for (const c of world.roadChunks) {
      const steps = 2;
      for (let k = 0; k < steps; k++) {
        const xa = c.x0 + ((c.x1 - c.x0) * k) / steps;
        const xb = c.x0 + ((c.x1 - c.x0) * (k + 1)) / steps;
        const [nax, naz] = normalAt(xa);
        const [nbx, nbz] = normalAt(xb);
        const za = corridorZ(xa);
        const zb = corridorZ(xb);
        const ya = roadY(xa);
        const yb = roadY(xb);
        const A = [xa + nax * ROAD_W, ya, za + naz * ROAD_W];
        const B = [xa - nax * ROAD_W, ya, za - naz * ROAD_W];
        const Cc = [xb + nbx * ROAD_W, yb, zb + nbz * ROAD_W];
        const D = [xb - nbx * ROAD_W, yb, zb - nbz * ROAD_W];
        pos.push(...A, ...Cc, ...B, ...B, ...Cc, ...D);
        uv.push(xa, 1, xb, 1, xa, 0, xa, 0, xb, 1, xb, 0);
        for (let r = 0; r < 6; r++) av.push(c.availDay);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aAvail', new THREE.Float32BufferAttribute(av, 1));
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: roadVert,
        fragmentShader: roadFrag,
        side: THREE.DoubleSide,
        uniforms: {
          uDay: U.uDay,
          uDim: U.uDim,
          uFade: U.uFade,
          uReveal: U.uReveal,
          uTime: U.uTime,
          uBg: U.uBg,
          uFogNear: U.uFogNear,
          uFogFar: U.uFogFar,
        },
      }),
    [],
  );
  return <mesh geometry={geometry} material={material} raycast={() => null} renderOrder={2} />;
}

function rowLine(offset: number, lift = 0.5) {
  const pts: [number, number, number][] = [];
  for (let x = X_MIN; x <= X_MAX; x += 0.8) {
    const [nx, nz] = normalAt(x);
    const px = x + nx * offset;
    const pz = corridorZ(x) + nz * offset;
    pts.push([px, Math.max(terrainHeight(px, pz), 0) + lift, pz]);
  }
  return pts;
}

/** Survey boundaries of the right-of-way + alignment centre line. */
function Boundaries() {
  const left = useMemo(() => rowLine(ROW_HALF), []);
  const rightL = useMemo(() => rowLine(-ROW_HALF), []);
  const center = useMemo(() => rowLine(0, 0.62), []);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const vis = U.uReveal.value > 0.6;
    g.visible = vis;
    const o = Math.min(1, U.uDim.value) * U.uFade.value;
    g.children.forEach((c) => {
      const m = (c as THREE.Mesh).material as THREE.Material & { opacity: number };
      if (m) m.opacity = (c.userData.base ?? 0.5) * o;
    });
  });
  return (
    <group ref={group}>
      <Line points={left} color={C.gis} lineWidth={1} dashed dashSize={0.6} gapSize={0.45} transparent opacity={0.5} userData={{ base: 0.55 }} />
      <Line points={rightL} color={C.gis} lineWidth={1} dashed dashSize={0.6} gapSize={0.45} transparent opacity={0.5} userData={{ base: 0.55 }} />
      <Line points={center} color={C.gis} lineWidth={0.8} transparent opacity={0.25} userData={{ base: 0.25 }} />
    </group>
  );
}

/** Work-front status rail floating above the alignment. */
function WorkFronts() {
  const { v, mounted } = useFade(() => {
    const s = useStore.getState();
    const m = resolveMode();
    if (s.active === 'journey') return journeyStep(live.progress.journey) === 5;
    if (s.active === 'bottleneck') return live.progress.bottleneck > 0.62;
    if (s.active === 'command') return m.layer === 'construction';
    return false;
  });
  const group = useRef<THREE.Group>(null);
  const rails = useMemo(
    () =>
      world.segmentBounds.map(([a, b], i) => {
        const pts: [number, number, number][] = [];
        for (let x = a + 0.7; x <= b - 0.7; x += 0.8) pts.push([x, 2.6, corridorZ(x)]);
        const st = segmentsToday[i];
        const color = st.share >= 0.8 ? C.ok : st.high >= 6 ? C.high : C.med;
        const mid = (a + b) / 2;
        return { pts, color, st, mid: [mid, 3.3, corridorZ(mid)] as [number, number, number] };
      }),
    [],
  );
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((c) => {
      const m = (c as THREE.Mesh).material as THREE.Material & { opacity: number };
      if (m && 'opacity' in m) m.opacity = v.current * 0.95;
    });
  });
  if (!mounted) return null;
  return (
    <group ref={group}>
      {rails.map((r, i) => (
        <Line key={i} points={r.pts} color={r.color} lineWidth={3} transparent opacity={0} />
      ))}
      {rails.map((r, i) => (
        <Html key={`l${i}`} position={r.mid} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="wf-label" data-state={r.st.share >= 0.8 ? 'open' : r.st.high >= 6 ? 'blocked' : 'partial'}>
            <b>{r.st.name}</b>
            <span>
              {r.st.ready}/{r.st.total} possessed
            </span>
          </div>
        </Html>
      ))}
    </group>
  );
}

export function Corridor() {
  useFrame((_, dt) => {
    const m = resolveMode();
    const target = m.day;
    const reduced = useStore.getState().reduced;
    U.uDay.value = reduced ? target : U.uDay.value + (target - U.uDay.value) * (1 - Math.exp(-dt * 6));
  });
  return (
    <group>
      <Road />
      <Boundaries />
      <WorkFronts />
    </group>
  );
}

export const CLUSTER_WORLD: [number, number, number] = [CLUSTER_X, 0.6, corridorZ(CLUSTER_X)];
