import { useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight, riverX } from '../lib/world';
import { useStore } from '../lib/store';
import { U, FOG_GLSL } from './uniforms';

const SIZE_X = 210;
const SIZE_Z = 150;

const vert = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  varying float vDepth;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uDim;
  uniform float uGrid;
  uniform float uFade;
  ${FOG_GLSL}
  varying vec3 vW;
  varying vec3 vN;
  varying float vDepth;

  float lineAA(float v, float w) {
    float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4);
    return 1.0 - smoothstep(w - 0.5, w + 0.5, d);
  }

  void main() {
    vec3 n = normalize(vN);
    float h = vW.y;
    vec3 low = vec3(0.0065, 0.0085, 0.0105);
    vec3 high = vec3(0.034, 0.039, 0.043);
    vec3 col = mix(low, high, smoothstep(-0.5, 20.0, h));
    float diff = clamp(dot(n, normalize(vec3(-0.45, 0.78, 0.35))), 0.0, 1.0);
    float rim = pow(1.0 - clamp(n.y, 0.0, 1.0), 2.0);
    col *= 0.42 + 0.85 * diff;
    col += vec3(0.012, 0.022, 0.026) * rim;

    // contour lines on the hills
    float contour = lineAA(h / 1.4, 0.55) * smoothstep(0.8, 4.0, h);
    float major = lineAA(h / 7.0, 0.7) * smoothstep(2.0, 6.0, h);
    col += vec3(0.10, 0.20, 0.23) * (contour * 0.18 + major * 0.3);

    // survey grid
    float g1 = max(lineAA(vW.x / 5.0, 0.5), lineAA(vW.z / 5.0, 0.5));
    float g2 = max(lineAA(vW.x / 25.0, 0.8), lineAA(vW.z / 25.0, 0.8));
    col += vec3(0.10, 0.22, 0.26) * (g1 * 0.05 + g2 * 0.12) * uGrid;

    // intro reveal: a survey sweep expanding from the corridor
    float r = length(vW.xz * vec2(0.9, 1.25));
    float front = uReveal * 150.0;
    float shown = 1.0 - smoothstep(front - 14.0, front, r);
    float sweep = exp(-pow((r - front) / 2.2, 2.0)) * step(0.001, uReveal) * (1.0 - step(0.999, uReveal));
    col = col * shown + vec3(0.35, 0.7, 0.8) * sweep * 0.5;

    // elliptical island fade into darkness
    float m = length(vW.xz / vec2(98.0, 66.0));
    float island = 1.0 - smoothstep(0.72, 1.0, m);
    col *= uDim * uFade;
    col = mix(uBg, col, island);
    col = applyFog(col, vDepth);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function Terrain() {
  const quality = useStore((s) => s.quality);
  const geometry = useMemo(() => {
    const seg = quality === 'high' ? [260, 186] : quality === 'medium' ? [170, 120] : [120, 86];
    const g = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, seg[0], seg[1]);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z) - 0.05);
    }
    g.computeVertexNormals();
    return g;
  }, [quality]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: {
          uTime: U.uTime,
          uReveal: U.uReveal,
          uDim: U.uDim,
          uGrid: U.uGrid,
          uFade: U.uFade,
          uBg: U.uBg,
          uFogNear: U.uFogNear,
          uFogFar: U.uFogFar,
        },
      }),
    [],
  );

  return (
    <group>
      <mesh geometry={geometry} material={material} raycast={() => null} />
      <River />
    </group>
  );
}

const riverFrag = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  uniform float uReveal;
  uniform float uFade;
  ${FOG_GLSL}
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vW;
  void main() {
    float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
    float flow = sin(vUv.y * 160.0 - uTime * 1.6 + vUv.x * 6.0) * 0.5 + 0.5;
    vec3 col = mix(vec3(0.012, 0.035, 0.045), vec3(0.04, 0.10, 0.12), flow * 0.4);
    col *= uDim * uFade;
    float r = length(vW.xz * vec2(0.9, 1.25));
    float shown = 1.0 - smoothstep(uReveal * 150.0 - 14.0, uReveal * 150.0, r);
    float m = length(vW.xz / vec2(98.0, 66.0));
    float island = 1.0 - smoothstep(0.72, 1.0, m);
    col = applyFog(col, vDepth);
    gl_FragColor = vec4(col, edge * 0.9 * shown * island);
    #include <colorspace_fragment>
  }
`;

const riverVert = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

function River() {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const W = 1.15;
    let i = 0;
    for (let z = -70; z <= 70; z += 0.8, i++) {
      const x = riverX(z);
      const y = Math.max(terrainHeight(x, z), -1.2) + 0.12;
      pts.push(x - W, y, z, x + W, y, z);
      uvs.push(0, (z + 70) / 140, 1, (z + 70) / 140);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: riverVert,
        fragmentShader: riverFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: U.uTime,
          uDim: U.uDim,
          uReveal: U.uReveal,
          uFade: U.uFade,
          uBg: U.uBg,
          uFogNear: U.uFogNear,
          uFogFar: U.uFogFar,
        },
      }),
    [],
  );
  return <mesh geometry={geometry} material={material} raycast={() => null} renderOrder={1} />;
}
