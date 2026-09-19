import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { world, hero, clusterParcels, CLUSTER_R } from '../lib/dataset';
import { corridorZ, X_MIN, X_MAX } from '../lib/world';
import { useStore, live } from '../lib/store';
import { C } from '../lib/palette';
import { useLive } from './useLive';
import { seg } from './util';

const [CX, CZ] = world.clusterCenter;
const FRONT_X = world.segmentBounds[2][1];

export function BottleneckFX() {
  const active = useLive(() => useStore.getState().active === 'bottleneck');
  const phase = useLive(() => {
    const p = live.progress.bottleneck;
    return p < 0.56 ? 0 : p < 0.72 ? 1 : 2;
  });
  const plane = useRef<THREE.Mesh>(null);
  const planeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uO: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uO; varying vec2 vUv;
          void main(){
            float a = (1.0 - vUv.y) * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
            gl_FragColor = vec4(vec3(0.45, 0.78, 0.86) * a * uO, a * uO);
          }`,
      }),
    [],
  );
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const s = useStore.getState();
    if (s.active !== 'bottleneck') {
      live.scanX = X_MAX + 20;
      return;
    }
    const p = live.progress.bottleneck;
    const sweep = seg(p, 0.06, 0.58);
    live.scanX = s.reduced ? (p > 0.1 ? X_MAX + 20 : X_MIN - 10) : X_MIN - 6 + (X_MAX - X_MIN + 12) * sweep;
    if (plane.current) {
      plane.current.position.x = live.scanX;
      plane.current.position.z = corridorZ(live.scanX);
      plane.current.rotation.y = Math.PI / 2;
      planeMat.uniforms.uO.value = p > 0.04 && p < 0.6 && !s.reduced ? 0.9 : 0;
    }
    if (ringMat.current) ringMat.current.opacity = 0.55 + 0.25 * Math.sin(clock.elapsedTime * 2.5);
  });

  const arc = useMemo(() => {
    const a = new THREE.Vector3(hero.cx, hero.y + 1.2, hero.cz);
    const b = new THREE.Vector3(FRONT_X, 2.6, corridorZ(FRONT_X));
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 5;
    return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(40);
  }, []);

  if (!active) return null;
  return (
    <group>
      <mesh ref={plane} material={planeMat} position={[0, 4, 0]} raycast={() => null}>
        <planeGeometry args={[52, 8]} />
      </mesh>
      {phase >= 1 && (
        <group position={[CX, 0.9, CZ]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[CLUSTER_R - 0.12, CLUSTER_R, 128]} />
            <meshBasicMaterial ref={ringMat} color={C.high} transparent opacity={0.7} toneMapped={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[CLUSTER_R, 96]} />
            <meshBasicMaterial color={C.high} transparent opacity={0.05} depthWrite={false} />
          </mesh>
          <Html position={[CLUSTER_R * 0.55, 3.4, -CLUSTER_R * 0.75]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
            <div className="map-callout fx-in" data-tone="high">
              <b>High-risk cluster</b>
              <span>{clusterParcels.length} parcels · work front C3</span>
            </div>
          </Html>
        </group>
      )}
      {phase >= 2 && (
        <>
          <Line points={arc} color={C.high} lineWidth={2.2} transparent opacity={0.95} dashed dashSize={0.5} gapSize={0.25} />
          <Html position={[FRONT_X + 1, 6.5, corridorZ(FRONT_X)]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
            <div className="map-callout map-callout--big fx-in" data-tone="high">
              <b>Potential bottleneck</b>
              <span>Construction work-front C3 affected</span>
            </div>
          </Html>
        </>
      )}
    </group>
  );
}
