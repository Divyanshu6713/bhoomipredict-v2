import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { districts } from '../lib/dataset';
import { useStore, live } from '../lib/store';
import { C } from '../lib/palette';
import { U } from './uniforms';
import { hexPos, districtHeight } from './DistrictGrid';
import { useLive } from './useLive';
import { seg } from './util';

const LAYER_Y = 330;

const gridFrag = /* glsl */ `
  uniform float uO;
  uniform float uTime;
  varying vec3 vW;
  float line(float v) { float d = abs(fract(v - 0.5) - 0.5) / fwidth(v); return 1.0 - min(d, 1.0); }
  void main() {
    float g = max(line(vW.x / 40.0), line(vW.z / 40.0)) * 0.6 + max(line(vW.x / 200.0), line(vW.z / 200.0));
    float r = length(vW.xz) / 900.0;
    float fall = 1.0 - smoothstep(0.2, 1.0, r);
    float wave = 0.6 + 0.4 * sin(length(vW.xz) * 0.02 - uTime * 1.2);
    float a = g * fall * uO * wave;
    gl_FragColor = vec4(vec3(0.45, 0.78, 0.86) * a, a);
  }
`;

/** Signals rise from districts and join into one intelligence layer. */
export function FinaleFX() {
  const active = useLive(() => useStore.getState().active === 'finale' || useStore.getState().active === 'district');
  const beacons = useMemo(
    () =>
      districts
        .filter((d) => d.riskIndex >= 0.45 || d.isHome)
        .map((d) => {
          const [x, z] = hexPos(d.q, d.r);
          return { x, z, y0: d.isHome ? 20 : -4 + districtHeight(d.riskIndex), home: d.isHome, risk: d.riskIndex };
        }),
    [],
  );
  const links = useMemo(() => {
    const out: [number, number][] = [];
    beacons.forEach((a, i) => {
      const near = beacons
        .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.z - b.z) }))
        .filter((o) => o.j !== i)
        .sort((m, n) => m.d - n.d)
        .slice(0, 2);
      near.forEach((n) => {
        if (!out.some(([p, q]) => (p === n.j && q === i) || (p === i && q === n.j))) out.push([i, n.j]);
      });
    });
    return out;
  }, [beacons]);
  const beamGeo = useMemo(() => {
    const pos: number[] = [];
    beacons.forEach((b) => pos.push(b.x, b.y0, b.z, b.x, LAYER_Y, b.z));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [beacons]);
  const netGeo = useMemo(() => {
    const pos: number[] = [];
    links.forEach(([i, j]) => pos.push(beacons[i].x, LAYER_Y, beacons[i].z, beacons[j].x, LAYER_Y, beacons[j].z));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [links, beacons]);
  const beamMat = useMemo(() => new THREE.LineBasicMaterial({ color: C.high, transparent: true, opacity: 0 }), []);
  const netMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#bfe6ee', transparent: true, opacity: 0 }), []);
  const nodeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#e9f6f8', transparent: true, opacity: 0, toneMapped: false }), []);
  const gridMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uO: { value: 0 }, uTime: U.uTime },
        vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: gridFrag,
      }),
    [],
  );
  const pulses = useRef<THREE.InstancedMesh>(null);
  const o = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const s = useStore.getState();
    const t = clock.elapsedTime;
    let beam = 0;
    let net = 0;
    let grid = 0;
    if (s.active === 'finale') {
      const p = live.progress.finale;
      beam = seg(p, 0.5, 0.6) * (1 - seg(p, 0.9, 0.99));
      net = seg(p, 0.62, 0.72) * (1 - seg(p, 0.9, 0.99));
      grid = seg(p, 0.6, 0.72) * (1 - seg(p, 0.93, 1.0) * 0.85);
    } else if (s.active === 'district') {
      beam = seg(live.progress.district, 0.8, 0.9) * 0.8;
    }
    beamMat.opacity = beam * 0.85;
    netMat.opacity = net * 0.8;
    nodeMat.opacity = Math.max(beam, net);
    gridMat.uniforms.uO.value = grid * 0.55;
    const m = pulses.current;
    if (m) {
      beacons.forEach((b, i) => {
        const f = s.reduced ? 0.5 : (t * 0.35 + i * 0.13) % 1;
        o.position.set(b.x, b.y0 + (LAYER_Y - b.y0) * f, b.z);
        o.scale.setScalar(beam > 0.01 ? 5 : 0.0001);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        o.position.set(b.x, LAYER_Y, b.z);
        o.scale.setScalar(net > 0.01 ? 7 + Math.sin(t * 2 + i) * 1.5 : 0.0001);
        o.updateMatrix();
        m.setMatrixAt(beacons.length + i, o.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  });

  if (!active) return null;
  return (
    <group>
      <lineSegments geometry={beamGeo} material={beamMat} raycast={() => null} />
      <lineSegments geometry={netGeo} material={netMat} raycast={() => null} />
      <instancedMesh ref={pulses} args={[undefined, undefined, beacons.length * 2]} material={nodeMat} raycast={() => null} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LAYER_Y, 0]} material={gridMat} raycast={() => null}>
        <planeGeometry args={[2000, 2000]} />
      </mesh>
    </group>
  );
}
