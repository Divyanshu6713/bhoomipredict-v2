import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { districts } from '../lib/dataset';
import { useStore, live } from '../lib/store';
import { C } from '../lib/palette';
import { U } from './uniforms';
import { useFade } from './util';
import { useLive } from './useLive';

export const HEX_R = 118;
export const hexPos = (q: number, r: number): [number, number] => [HEX_R * 1.5 * q, HEX_R * Math.sqrt(3) * (r + q / 2)];
export const districtHeight = (risk: number) => 6 + risk * 110;
const band = (r: number) => (r >= 0.55 ? C.high : r >= 0.3 ? C.med : C.low);

export function districtVisible() {
  const s = useStore.getState();
  if (s.active === 'district') return live.progress.district > 0.38;
  if (s.active === 'finale') return live.progress.finale > 0.3 && live.progress.finale < 0.9;
  return false;
}

export function DistrictGrid() {
  const { v, mounted } = useFade(districtVisible, 2.5);
  const others = useMemo(() => districts.filter((d) => !d.isHome), []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ transparent: true, opacity: 0 }), []);
  const ringGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * HEX_R * 0.97, 0, Math.sin(a) * HEX_R * 0.97));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  const ringMat = useMemo(() => new THREE.LineBasicMaterial({ color: C.gis, transparent: true, opacity: 0 }), []);
  const homeMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#e9f6f8', transparent: true, opacity: 0 }), []);
  const level = useLive(() => (useStore.getState().active === 'district' && live.progress.district > 0.74 ? 1 : 0));

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    others.forEach((d, i) => {
      const [x, z] = hexPos(d.q, d.r);
      const h = districtHeight(d.riskIndex);
      o.position.set(x, -4 + h / 2, z);
      o.rotation.set(0, Math.PI / 6, 0);
      o.scale.set(HEX_R * 0.93, h, HEX_R * 0.93);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(band(d.riskIndex)).multiplyScalar(0.55));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [others, mounted]);

  useFrame(() => {
    const o = v.current * U.uFade.value;
    mat.opacity = o * 0.9;
    ringMat.opacity = o * 0.55;
    homeMat.opacity = o;
    if (mesh.current) mesh.current.visible = o > 0.01;
  });

  if (!mounted) return null;
  const top = [...others].sort((a, b) => b.riskIndex - a.riskIndex).slice(0, 3);
  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, others.length]} material={mat} raycast={() => null}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </instancedMesh>
      {districts.map((d) => {
        const [x, z] = hexPos(d.q, d.r);
        const y = d.isHome ? 1 : -4 + districtHeight(d.riskIndex) + 0.5;
        return (
          <lineLoop key={d.name} geometry={ringGeo} material={d.isHome ? homeMat : ringMat} position={[x, y, z]} raycast={() => null} />
        );
      })}
      {level === 1 && (
        <>
          {top.map((d) => {
            const [x, z] = hexPos(d.q, d.r);
            return (
              <Html key={d.name} position={[x, districtHeight(d.riskIndex) + 30, z]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
                <div className="map-callout fx-in" data-tone="high">
                  <b>{d.name}</b>
                  <span>
                    {d.highRisk} high-risk · {d.clusters} clusters
                  </span>
                </div>
              </Html>
            );
          })}
          <Html position={[0, 40, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
            <div className="map-callout fx-in">
              <b>D-07 · home district</b>
              <span>NH Corridor Demo is here</span>
            </div>
          </Html>
        </>
      )}
    </group>
  );
}
