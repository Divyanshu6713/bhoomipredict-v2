import { Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useStore, live } from '../lib/store';
import { world } from '../lib/dataset';
import { C } from '../lib/palette';
import { U } from './uniforms';
import { resolveMode } from './mode';
import { getTargets } from './layerTargets';
import { seg } from './util';
import { CameraRig } from './CameraRig';
import { Terrain } from './Terrain';
import { Parcels } from './Parcels';
import { Corridor } from './Corridor';
import { Buildings, Markers, Infrastructure, AdminLabels, Dust } from './Context';
import { JourneyFX } from './JourneyFX';
import { ChainNodes } from './ChainNodes';
import { SignatureParcel } from './SignatureParcel';
import { FeatureNodes } from './FeatureNodes';
import { BottleneckFX } from './BottleneckFX';
import { Dependencies } from './Dependencies';
import { DistrictGrid } from './DistrictGrid';
import { LayerStack } from './LayerStack';
import { FinaleFX } from './FinaleFX';

/** Global look: world brightness, finale fade, intro reveal. */
function Director() {
  const reveal = { t0: -1 };
  useFrame(({ clock }, dt) => {
    const s = useStore.getState();
    const m = resolveMode();
    const k = s.reduced ? 1 : 1 - Math.exp(-dt * 2.5);
    U.uDim.value += (m.worldDim - U.uDim.value) * k;
    const fade = s.active === 'finale' ? 1 - seg(live.progress.finale, 0.84, 0.97) * 0.95 : 1;
    U.uFade.value += (fade - U.uFade.value) * k;
    if (reveal.t0 < 0) reveal.t0 = clock.elapsedTime + 0.25;
    U.uReveal.value = s.reduced || s.active === 'login' ? 1 : Math.min(1, Math.max(0, (clock.elapsedTime - reveal.t0) / 3.4));
    const g = s.active === 'layers' || s.active === 'architecture' ? 0.4 : 1;
    U.uGrid.value += (g - U.uGrid.value) * k;
  });
  return null;
}

/** Projects hovered / selected parcels to screen space for the DOM cards. */
function Probe() {
  const { camera, size } = useThree();
  const v = new THREE.Vector3();
  useFrame(() => {
    const s = useStore.getState();
    const m = resolveMode();
    const T = getTargets(m.layer, m.day);
    const put = (key: 'hover' | 'selected', idx: number) => {
      const a = live.anchors[key];
      if (idx < 0) {
        a.visible = false;
        return;
      }
      const p = world.parcels[idx];
      v.set(p.cx, p.y + 0.4 + T.lift[idx] + 0.6, p.cz).project(camera);
      a.x = (v.x * 0.5 + 0.5) * size.width;
      a.y = (-v.y * 0.5 + 0.5) * size.height;
      a.visible = v.z < 1;
    };
    put('hover', m.interactive ? s.hovered : -1);
    put('selected', s.selected);
  });
  return null;
}

function SceneContents() {
  const quality = useStore((s) => s.quality);
  return (
    <>
      <CameraRig />
      <Director />
      <Probe />
      <ambientLight intensity={0.55} color="#b8c7d0" />
      <directionalLight position={[-40, 70, 30]} intensity={1.6} color="#dfe9ee" />
      <Terrain />
      <Parcels />
      <Corridor />
      <Buildings />
      <Markers />
      <Infrastructure />
      <AdminLabels />
      {quality !== 'low' && <Dust count={quality === 'high' ? 650 : 280} />}
      <JourneyFX />
      <ChainNodes />
      <SignatureParcel />
      <FeatureNodes />
      <BottleneckFX />
      <Dependencies />
      <DistrictGrid />
      <LayerStack />
      <FinaleFX />
      {quality === 'high' && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.62} luminanceSmoothing={0.2} />
          <Vignette eskil={false} offset={0.22} darkness={0.72} />
        </EffectComposer>
      )}
    </>
  );
}

export default function WorldCanvas() {
  const quality = useStore((s) => s.quality);
  const set = useStore((s) => s.set);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      live.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      live.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return (
    <div className="world" aria-hidden="true">
      <Canvas
        flat
        dpr={quality === 'high' ? [1, 1.75] : quality === 'medium' ? [1, 1.3] : [1, 1]}
        gl={{ antialias: quality !== 'high', powerPreference: 'high-performance', alpha: false, stencil: false }}
        camera={{ fov: 38, near: 0.5, far: 1200, position: [0, 90, 120] }}
        onCreated={({ scene, gl }) => {
          scene.background = new THREE.Color(C.bg);
          scene.fog = new THREE.Fog(C.bg, 60, 220);
          gl.setClearColor(C.bg);
          set({ ready: true });
        }}
      >
        <Suspense fallback={null}>
          <SceneContents />
        </Suspense>
      </Canvas>
    </div>
  );
}
