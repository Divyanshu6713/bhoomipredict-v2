import * as THREE from 'three';
import { C } from '../lib/palette';
import { TODAY } from '../lib/world';

/** Uniform objects shared by reference across every custom material. */
export const U = {
  uTime: { value: 0 },
  uBg: { value: new THREE.Color(C.bg) },
  uFogNear: { value: 60 },
  uFogFar: { value: 220 },
  uDim: { value: 1 }, // global world brightness
  uReveal: { value: 0 }, // intro wipe 0..1
  uGrid: { value: 1 },
  uDay: { value: TODAY },
  uScanX: { value: -200 },
  uFade: { value: 1 }, // finale fade-out of the land
};

export const FOG_GLSL = /* glsl */ `
  uniform vec3 uBg;
  uniform float uFogNear;
  uniform float uFogFar;
  vec3 applyFog(vec3 col, float depth) {
    float f = smoothstep(uFogNear, uFogFar, depth);
    return mix(col, uBg, f);
  }
`;
