import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { easing } from 'maath';
import { useStore, live } from '../lib/store';
import { world, hero } from '../lib/dataset';
import { corridorZ, CLUSTER_X } from '../lib/world';
import { U } from './uniforms';

type V3 = [number, number, number];
interface Frame {
  pos: V3;
  look: V3;
  shift?: number;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const top = (idx: number): V3 => {
  const p = world.parcels[idx];
  return [p.cx, p.y + 0.5, p.cz];
};

/** Hold on each frame for `hold` of its slot, then travel to the next. */
function track(frames: Frame[], p: number, hold = 0.6): Frame {
  const n = frames.length;
  const u = Math.min(n - 0.0001, Math.max(0, p * n));
  const i = Math.floor(u);
  const f = u - i;
  if (i >= n - 1) return frames[n - 1];
  const t = f < hold ? 0 : (f - hold) / (1 - hold);
  const e = t * t * (3 - 2 * t);
  const a = frames[i];
  const b = frames[i + 1];
  const l = (x: V3, y: V3): V3 => [x[0] + (y[0] - x[0]) * e, x[1] + (y[1] - x[1]) * e, x[2] + (y[2] - x[2]) * e];
  return { pos: l(a.pos, b.pos), look: l(a.look, b.look), shift: (a.shift ?? 0) + ((b.shift ?? 0) - (a.shift ?? 0)) * e };
}

const H = top(hero.idx);
const CZ = corridorZ(CLUSTER_X);

function shot(t: number): Frame {
  const s = useStore.getState();
  const sec = s.active;
  if (s.dive) {
    // straight down into the land under the current view
    return { pos: [curLook.x, Math.max(2.5, curLook.y + 3), curLook.z + 4], look: [curLook.x, curLook.y, curLook.z - 2], shift: 0 };
  }
  const p = live.progress[sec] ?? 0;
  const focus = world.byId.get(s.focusId)?.idx ?? hero.idx;
  const F = top(focus);
  switch (sec) {
    case 'hero':
    case 'return': {
      if (s.selected >= 0) {
        const c = top(s.selected);
        return { pos: add(c, [6, 11, 14]), look: c, shift: 0 };
      }
      const drift = Math.sin(t * 0.045) * 7;
      return sec === 'hero'
        ? { pos: [-6 + drift, 46, 70], look: [2 + drift * 0.4, -2, -4], shift: 0 }
        : { pos: [14 + drift, 58, 74], look: [0, 0, -2], shift: 0 };
    }
    case 'journey':
      return track(
        [
          { pos: [0, 50, 74], look: [0, 0, -2], shift: 0.14 },
          { pos: add(H, [7, 11, 15]), look: H, shift: 0.18 },
          { pos: add(H, [10, 9, 12]), look: add(H, [0, 2.4, 0]), shift: 0.2 },
          { pos: add(H, [5, 7.5, 10]), look: add(H, [0, 1.4, 0]), shift: 0.2 },
          { pos: add(H, [-8, 8, 11]), look: add(H, [0, 1.9, 0]), shift: 0.2 },
          { pos: add(H, [18, 26, 34]), look: add(H, [8, 0, -1]), shift: 0.18 },
        ],
        p,
        0.62,
      );
    case 'login':
      return { pos: [Math.sin(t * 0.04) * 16, 30, 58], look: [Math.sin(t * 0.04) * 6, -1, -6], shift: 0 };
    case 'chain':
      return { pos: [0, 17.5, 52], look: [0, 15.5, 2], shift: 0 };
    case 'signature':
      return { pos: add(H, [10, 8, 13]), look: add(H, [0, 3.2, 0]), shift: 0.2 };
    case 'bottleneck':
      return {
        pos: [CLUSTER_X - 10 + p * 16, 30 - p * 6, CZ + 40 - p * 8],
        look: [CLUSTER_X + 6 + p * 4, 0, CZ - 2],
        shift: 0.16,
      };
    case 'ai':
      return { pos: [Math.sin(t * 0.03) * 20, 120, 40], look: [0, 0, 0], shift: 0 };
    case 'xai':
      return { pos: add(F, [0.5, 9.5, 15.5]), look: add(F, [0, 2.8, 0]), shift: -0.2 };
    case 'officer':
      return { pos: add(F, [-12, 17, 21]), look: F, shift: -0.24 };
    case 'command': {
      const z = s.zoom;
      if (s.selected >= 0) {
        const c = top(s.selected);
        return { pos: add(c, [6 / z, 13 / z, 15 / z]), look: c, shift: 0 };
      }
      if (s.followCorridor) {
        const x = Math.max(-62, Math.min(62, live.pointer.x * 66));
        const zc = corridorZ(x);
        return { pos: [x - 4, 20 / z, zc + 27 / z], look: [x + 2, 0, zc], shift: 0 };
      }
      return { pos: [0, 64 / z, 60 / z], look: [0, 0, -2], shift: 0 };
    }
    case 'timeline':
      return { pos: [0, 82, 56], look: [0, 0, -3], shift: 0 };
    case 'district':
      return track(
        [
          { pos: add(H, [5, 9, 12]), look: H, shift: 0.18 },
          { pos: [0, 64, 66], look: [0, 0, 0], shift: 0.18 },
          { pos: [0, 300, 230], look: [0, 0, 0], shift: 0.18 },
          { pos: [0, 1180, 760], look: [0, 0, 60], shift: 0.18 },
        ],
        p,
        0.55,
      );
    case 'layers':
      return { pos: [30, 34, 40], look: [0, 13, 0], shift: 0.2 };
    case 'causes':
    case 'live':
    case 'capabilities':
    case 'architecture':
    case 'ecosystem':
    case 'limits':
    case 'security':
      return { pos: [Math.cos(t * 0.025) * 90, 80, Math.sin(t * 0.025) * 90], look: [0, 0, 0], shift: 0 };
    case 'finale':
      return track(
        [
          { pos: add(H, [3, 5, 7]), look: H },
          { pos: [0, 62, 64], look: [0, 0, 0] },
          { pos: [0, 300, 240], look: [0, 0, 0] },
          { pos: [0, 1100, 820], look: [0, 0, 40] },
          { pos: [0, 1500, 900], look: [0, 260, 0] },
          { pos: [0, 1500, 900], look: [0, 260, 0] },
        ],
        p,
        0.45,
      );
  }
  return { pos: [0, 50, 70], look: [0, 0, 0] };
}

const curPos = new THREE.Vector3(0, 90, 120);
const curLook = new THREE.Vector3(0, 0, 0);
const tPos = new THREE.Vector3();
const tLook = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const shiftRef = { v: 0 };

/** Place the camera before the next frame (e.g. start low in the land and pull back out). */
export function setCameraStart(pos: V3, look: V3) {
  curPos.set(...pos);
  curLook.set(...look);
}

export function CameraRig() {
  const { camera, size, scene } = useThree();
  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    U.uTime.value = state.clock.elapsedTime;
    const s = useStore.getState();
    const f = shot(state.clock.elapsedTime);
    tPos.set(...f.pos);
    tLook.set(...f.look);
    const aspect = size.width / size.height;
    // portrait screens: pull back so the subject still fits
    if (aspect < 1.1) {
      const k = Math.min(2.2, Math.pow(1.1 / aspect, 0.8));
      tPos.sub(tLook).multiplyScalar(k).add(tLook);
    }
    const mobile = size.width < 768;
    // cursor parallax
    if (!s.reduced && !mobile) {
      const dist = tPos.distanceTo(tLook);
      const strength = s.active === 'hero' || s.active === 'return' ? 0.07 : s.active === 'command' ? 0.02 : 0.035;
      right.subVectors(tLook, tPos).cross(camera.up).normalize();
      up.copy(camera.up);
      tPos.addScaledVector(right, live.pointer.x * dist * strength);
      tPos.addScaledVector(up, live.pointer.y * dist * strength * 0.5);
      tLook.addScaledVector(right, live.pointer.x * dist * strength * 0.25);
    }
    if (s.reduced) {
      curPos.copy(tPos);
      curLook.copy(tLook);
    } else {
      const st = s.dive ? 0.22 : 0.55;
      easing.damp3(curPos, tPos, st, d);
      easing.damp3(curLook, tLook, s.dive ? 0.3 : 0.5, d);
    }
    camera.position.copy(curPos);
    camera.lookAt(curLook);

    const shiftTarget = mobile ? 0 : (f.shift ?? 0);
    shiftRef.v = s.reduced ? shiftTarget : shiftRef.v + (shiftTarget - shiftRef.v) * (1 - Math.exp(-d * 3));
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(shiftRef.v) > 0.001) cam.setViewOffset(size.width, size.height, -shiftRef.v * size.width, 0, size.width, size.height);
    else cam.clearViewOffset();

    const dist = curPos.distanceTo(curLook);
    U.uFogNear.value = dist * 0.85;
    U.uFogFar.value = dist * 2.8 + 60;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = U.uFogNear.value;
      scene.fog.far = U.uFogFar.value;
    }
    const far = Math.max(600, dist * 5);
    if (Math.abs(cam.far - far) > 50) {
      cam.far = far;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}
