import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { world, today } from '../lib/dataset';
import { terrainHeight, ADMIN_UNITS, riverX, corridorZ, stageAt } from '../lib/world';
import { compStatusAt } from '../lib/model';
import { COMPLETE } from '../lib/stages';
import { useStore } from '../lib/store';
import { C } from '../lib/palette';
import { U } from './uniforms';
import { resolveMode } from './mode';
import { getTargets } from './layerTargets';
import { useFade } from './util';

/* ---------------- Buildings ---------------- */
export function Buildings() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#39434d', roughness: 0.85, metalness: 0.05 }),
    [],
  );
  useEffect(() => {
    const m = ref.current!;
    const o = new THREE.Object3D();
    world.buildings.forEach((b, i) => {
      o.position.set(b.x, b.y + b.h / 2, b.z);
      o.rotation.set(0, b.rot, 0);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame(() => {
    const k = U.uDim.value * U.uFade.value * (U.uReveal.value > 0.5 ? 1 : 0);
    mat.color.setRGB(0.19 * k, 0.22 * k, 0.25 * k);
    if (ref.current) ref.current.visible = k > 0.02;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, world.buildings.length]} material={mat} raycast={() => null}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/* ---------------- Floating data markers ---------------- */
const MAX_MARKERS = 260;
interface MarkerSpec {
  idx: number;
  color: string;
  h: number;
}

function markerSet(layer: string, day: number): MarkerSpec[] {
  const out: MarkerSpec[] = [];
  for (const p of world.row) {
    const st = stageAt(p, day);
    if (st >= COMPLETE) continue;
    const sc = today[p.idx].score;
    const a = p.acq!;
    switch (layer) {
      case 'overview':
      case 'risk':
        if (sc && sc.p >= 0.55) out.push({ idx: p.idx, color: C.high, h: 1.8 });
        else if (layer === 'overview' && sc && sc.p >= 0.4 && p.idx % 3 === 0) out.push({ idx: p.idx, color: C.gis, h: 1.4 });
        break;
      case 'litigation':
        if (a.legal && day >= a.entries[3] && day < a.entries[9]) out.push({ idx: p.idx, color: C.legal, h: 2 });
        break;
      case 'compensation': {
        const cs = compStatusAt(st);
        if (cs.x === 1) out.push({ idx: p.idx, color: C.med, h: 1.9 });
        else if (cs.x === 0.5) out.push({ idx: p.idx, color: '#cbb07a', h: 1.4 });
        break;
      }
      case 'rr':
        if (a.families > 0 && day < a.entries[10]) out.push({ idx: p.idx, color: C.med, h: 1.4 + a.families * 0.12 });
        break;
      case 'ownership':
        if (a.unresolved > 0 && day < a.entries[8]) out.push({ idx: p.idx, color: C.med, h: 1.5 });
        break;
    }
  }
  return out.slice(0, MAX_MARKERS);
}

export function Markers() {
  const heads = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);
  const state = useRef<{ key: string; list: MarkerSpec[] }>({ key: '', list: [] });
  const o = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const headMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true }), []);
  const stemMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#9fd3df', transparent: true, opacity: 0.25, depthWrite: false }),
    [],
  );
  useFrame(({ clock }) => {
    const m = resolveMode();
    const s = useStore.getState();
    const show = ['hero', 'return', 'command', 'district', 'finale'].includes(s.active);
    const layer = show ? (m.layer === 'ambient' ? 'overview' : m.layer) : 'none';
    const key = `${layer}|${Math.round(m.day)}`;
    if (key !== state.current.key) {
      state.current = { key, list: show ? markerSet(layer, m.day) : [] };
      const h = heads.current!;
      state.current.list.forEach((mk, i) => h.setColorAt(i, col.set(mk.color)));
      if (h.instanceColor) h.instanceColor.needsUpdate = true;
    }
    const list = state.current.list;
    const T = getTargets(m.layer, m.day);
    const t = clock.elapsedTime;
    const h = heads.current!;
    const st = stems.current!;
    const reveal = U.uReveal.value > 0.85 ? 1 : 0;
    headMat.opacity = U.uDim.value * U.uFade.value * reveal;
    stemMat.opacity = 0.22 * U.uDim.value * U.uFade.value * reveal;
    list.forEach((mk, i) => {
      const p = world.parcels[mk.idx];
      const base = p.y + 0.3 + T.lift[mk.idx];
      const bob = s.reduced ? 0 : Math.sin(t * 1.6 + mk.idx) * 0.12;
      const hover = s.hovered === mk.idx || s.selected === mk.idx ? 1.35 : 1;
      o.position.set(p.cx, base + mk.h + bob, p.cz);
      o.rotation.set(0, t * 0.8 + mk.idx, 0);
      o.scale.setScalar(0.22 * hover);
      o.updateMatrix();
      h.setMatrixAt(i, o.matrix);
      o.position.set(p.cx, base + (mk.h + bob) / 2, p.cz);
      o.rotation.set(0, 0, 0);
      o.scale.set(0.025, mk.h + bob, 0.025);
      o.updateMatrix();
      st.setMatrixAt(i, o.matrix);
    });
    h.count = list.length;
    st.count = list.length;
    h.instanceMatrix.needsUpdate = true;
    st.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={heads} args={[undefined, undefined, MAX_MARKERS]} material={headMat} raycast={() => null} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
      </instancedMesh>
      <instancedMesh ref={stems} args={[undefined, undefined, MAX_MARKERS]} material={stemMat} raycast={() => null} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 4, 1]} />
      </instancedMesh>
    </group>
  );
}

/* ---------------- Existing roads + power line (infrastructure layer) ---------------- */
function roadPath(a: [number, number], b: [number, number], bend: number) {
  const pts: [number, number, number][] = [];
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * bend;
    pts.push([x, Math.max(terrainHeight(x, z), 0) + 0.45, z]);
  }
  return pts;
}

export function Infrastructure() {
  const roads = useMemo(
    () => [
      roadPath([-80, -28], [-27, corridorZ(-27) - 14], 6),
      roadPath([-27, corridorZ(-27) - 14], [2, corridorZ(2) + 15], -4),
      roadPath([2, corridorZ(2) + 15], [57, corridorZ(57) + 14], 5),
      roadPath([40, corridorZ(40) - 13], [80, -40], -4),
      roadPath([-52, corridorZ(-52) + 13], [-60, 50], 3),
    ],
    [],
  );
  const pylons = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i <= 13; i++) {
      const t = i / 13;
      const x = -78 + 150 * t;
      const z = 38 - 80 * t + Math.sin(t * 5) * 2;
      out.push([x, terrainHeight(x, z), z]);
    }
    return out;
  }, []);
  const wires = useMemo(() => {
    const segs: [number, number, number][][] = [];
    for (let i = 0; i < pylons.length - 1; i++) {
      const a = pylons[i];
      const b = pylons[i + 1];
      const pts: [number, number, number][] = [];
      for (let t = 0; t <= 1.0001; t += 0.1) {
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + 4.2 + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.9, a[2] + (b[2] - a[2]) * t]);
      }
      segs.push(pts);
    }
    return segs;
  }, [pylons]);
  const group = useRef<THREE.Group>(null);
  const pylonMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#8fa3ad', transparent: true, opacity: 0.4 }), []);
  useFrame(() => {
    const m = resolveMode();
    const infra = m.layer === 'infra';
    const k = U.uDim.value * U.uFade.value * (U.uReveal.value > 0.7 ? 1 : 0);
    group.current?.traverse((c) => {
      const mat = (c as THREE.Mesh).material as THREE.Material & { opacity: number; color?: THREE.Color };
      if (!mat || !('opacity' in mat)) return;
      const base = c.userData.kind === 'road' ? (infra ? 0.95 : 0.35) : infra ? 0.9 : 0.18;
      mat.opacity = base * k;
    });
  });
  return (
    <group ref={group}>
      {roads.map((r, i) => (
        <Line key={i} points={r} color="#a7b4bb" lineWidth={1.6} transparent opacity={0.35} userData={{ kind: 'road' }} />
      ))}
      {wires.map((w, i) => (
        <Line key={`w${i}`} points={w} color={C.gis} lineWidth={0.7} transparent opacity={0.2} userData={{ kind: 'wire' }} />
      ))}
      {pylons.map((p, i) => (
        <group key={`p${i}`} position={p}>
          <mesh position={[0, 2.1, 0]} material={pylonMat} raycast={() => null} userData={{ kind: 'pylon' }}>
            <cylinderGeometry args={[0.05, 0.22, 4.2, 4]} />
          </mesh>
          <mesh position={[0, 4.1, 0]} material={pylonMat} raycast={() => null} userData={{ kind: 'pylon' }}>
            <boxGeometry args={[1.4, 0.06, 0.06]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ---------------- Administrative labels ---------------- */
export function AdminLabels() {
  const { mounted } = useFade(() => resolveMode().layer === 'admin');
  if (!mounted) return null;
  return (
    <group>
      {ADMIN_UNITS.map((u) => (
        <Html key={u.name} position={[u.x, 3, u.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="map-label">
            <b>{u.name}</b>
            <span>Village · synthetic</span>
          </div>
        </Html>
      ))}
      <Html position={[riverX(30) - 6, 2, 30]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="map-label map-label--muted">Tehsil A ⟵</div>
      </Html>
      <Html position={[riverX(30) + 6, 2, 30]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="map-label map-label--muted">⟶ Tehsil B</div>
      </Html>
    </group>
  );
}

/* ---------------- Ambient data particles ---------------- */
export function Dust({ count }: { count: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 170;
      p[i * 3 + 1] = Math.random() * 26;
      p[i * 3 + 2] = (Math.random() - 0.5) * 110;
      s[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: U.uTime, uDim: U.uDim, uFade: U.uFade },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          varying float vA;
          void main() {
            vec3 p = position;
            p.y = mod(p.y + uTime * (0.25 + aSeed * 0.5), 26.0);
            p.x += sin(uTime * 0.2 + aSeed * 30.0) * 0.8;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.2 + aSeed * 1.8) * (90.0 / -mv.z);
            vA = smoothstep(0.0, 4.0, p.y) * (1.0 - smoothstep(18.0, 26.0, p.y)) * (0.25 + aSeed * 0.5);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uDim;
          uniform float uFade;
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * vA * uDim * uFade;
            gl_FragColor = vec4(vec3(0.55, 0.8, 0.88) * a, a);
          }
        `,
      }),
    [],
  );
  return <points geometry={geo} material={mat} raycast={() => null} frustumCulled={false} />;
}
