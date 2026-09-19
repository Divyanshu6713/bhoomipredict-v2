import { useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '../lib/dataset';
import { useStore, live } from '../lib/store';
import { U, FOG_GLSL } from './uniforms';
import { getTargets } from './layerTargets';
import { resolveMode } from './mode';

const N = world.parcels.length;
const TOP = 0.22;
const BOTTOM = -0.55;

/** One merged mesh for every parcel; per-parcel state lives in float textures. */
function buildGeometry() {
  const pos: number[] = [];
  const nor: number[] = [];
  const aIdx: number[] = [];
  const aTop: number[] = [];
  const aEdge: number[] = [];
  const faceToParcel: number[] = [];
  const v = new THREE.Vector3();
  for (const p of world.parcels) {
    const top = p.y + TOP;
    const bot = p.y + BOTTOM;
    const n = p.poly.length;
    for (let k = 0; k < n; k++) {
      const [x1, z1] = p.poly[k];
      const [x2, z2] = p.poly[(k + 1) % n];
      // distance from centroid to this edge (for crisp borders)
      const ex = x2 - x1;
      const ez = z2 - z1;
      const len = Math.hypot(ex, ez) || 1;
      const h = Math.abs((p.cx - x1) * ez - (p.cz - z1) * ex) / len;
      // top fan triangle (centroid, k+1, k) — CCW seen from above
      pos.push(p.cx, top, p.cz, x2, top, z2, x1, top, z1);
      for (let r = 0; r < 3; r++) nor.push(0, 1, 0);
      aEdge.push(h, 0, 0);
      aTop.push(1, 1, 1);
      aIdx.push(p.idx, p.idx, p.idx);
      faceToParcel.push(p.idx);
      // side wall
      v.set(ez, 0, -ex).normalize();
      // make the normal point outwards
      const mx = (x1 + x2) / 2 - p.cx;
      const mz = (z1 + z2) / 2 - p.cz;
      if (v.x * mx + v.z * mz < 0) v.negate();
      const quad = [
        [x1, bot, z1, 0],
        [x2, bot, z2, 0],
        [x2, top, z2, 1],
        [x1, bot, z1, 0],
        [x2, top, z2, 1],
        [x1, top, z1, 1],
      ];
      for (let o = 0; o < 6; o++) {
        const q = quad[o];
        pos.push(q[0], q[1], q[2]);
        nor.push(v.x, 0, v.z);
        aTop.push(q[3]);
        aEdge.push(9);
        aIdx.push(p.idx);
      }
      faceToParcel.push(p.idx, p.idx);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aIdx', new THREE.Float32BufferAttribute(aIdx, 1));
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(aTop, 1));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(aEdge, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return { geometry: g, faceToParcel: Int32Array.from(faceToParcel) };
}

const vert = /* glsl */ `
  attribute float aIdx;
  attribute float aTop;
  attribute float aEdge;
  uniform sampler2D uS1;
  uniform sampler2D uS2;
  uniform sampler2D uS3;
  uniform float uCount;
  varying vec3 vColor;
  varying vec3 vBorder;
  varying float vGlow;
  varying float vDim;
  varying float vEmis;
  varying float vEdge;
  varying float vDepth;
  varying float vAlpha;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec2 uv = vec2((aIdx + 0.5) / uCount, 0.5);
    vec4 s1 = texture2D(uS1, uv);
    vec4 s2 = texture2D(uS2, uv);
    vec4 s3 = texture2D(uS3, uv);
    vec3 p = position;
    p.y += aTop * s1.a;
    vColor = s1.rgb;
    vBorder = s3.rgb;
    vGlow = s2.r;
    vDim = s2.g;
    vEmis = s2.b;
    vAlpha = s2.a;
    vEdge = aEdge;
    vN = normal;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  uniform float uDim;
  uniform float uReveal;
  uniform float uFade;
  uniform float uTime;
  ${FOG_GLSL}
  varying vec3 vColor;
  varying vec3 vBorder;
  varying float vGlow;
  varying float vDim;
  varying float vEmis;
  varying float vEdge;
  varying float vDepth;
  varying float vAlpha;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    float r = length(vW.xz * vec2(0.9, 1.25));
    if (r > uReveal * 150.0 - 6.0) discard;
    vec3 n = normalize(vN);
    bool top = n.y > 0.5;
    vec3 col = vColor;
    if (top) {
      float fw = max(fwidth(vEdge), 1e-4);
      float w = 0.06 + vGlow * 0.07;
      float border = 1.0 - smoothstep(w - fw, w + fw, vEdge);
      float inner = exp(-vEdge * 10.0) * vGlow * vGlow * 0.3;
      col = mix(col, vBorder, clamp(border * (0.12 + 0.88 * vGlow * vGlow) + inner, 0.0, 1.0));
    } else {
      float diff = clamp(dot(n, normalize(vec3(-0.45, 0.2, 0.35))), 0.0, 1.0);
      col = col * (0.32 + 0.45 * diff) + vBorder * vGlow * 0.12;
    }
    col += vColor * vEmis;
    col *= vDim * uDim * uFade;
    col = applyFog(col, vDepth);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function makeTex() {
  const data = new Float32Array(N * 4);
  const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);
const hit = new THREE.Vector3();
const groundRay = new THREE.Raycaster();

export function Parcels() {
  const { geometry, faceToParcel } = useMemo(buildGeometry, []);
  const tex = useMemo(() => ({ s1: makeTex(), s2: makeTex(), s3: makeTex() }), []);
  const cur = useMemo(
    () => ({
      color: new Float32Array(N * 3),
      border: new Float32Array(N * 3),
      lift: new Float32Array(N),
      glow: new Float32Array(N),
      dim: new Float32Array(N).fill(1),
      emis: new Float32Array(N),
      init: false,
    }),
    [],
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.DoubleSide,
        uniforms: {
          uS1: { value: tex.s1 },
          uS2: { value: tex.s2 },
          uS3: { value: tex.s3 },
          uCount: { value: N },
          uDim: U.uDim,
          uReveal: U.uReveal,
          uFade: U.uFade,
          uTime: U.uTime,
          uBg: U.uBg,
          uFogNear: U.uFogNear,
          uFogFar: U.uFogFar,
        },
      }),
    [tex],
  );
  const meshRef = useRef<THREE.Mesh>(null);
  const interactiveRef = useRef(false);
  const { camera, pointer } = useThree();

  useFrame((_, dt) => {
    const mode = resolveMode();
    interactiveRef.current = mode.interactive;
    const T = getTargets(mode.layer, mode.day);
    const N0 = mode.scan ? getTargets('overview', mode.day) : null;
    const s = useStore.getState();
    const hovered = mode.interactive ? s.hovered : -1;
    const selected = s.active === 'command' || s.active === 'hero' || s.active === 'return' ? s.selected : -1;
    const reduced = s.reduced;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    const kFast = reduced ? 1 : 1 - Math.exp(-dt * 12);

    let gx = 1e9;
    let gz = 1e9;
    if (mode.interactive && s.quality !== 'low' && !reduced) {
      groundRay.setFromCamera(pointer, camera);
      if (groundRay.ray.intersectPlane(plane, hit)) {
        gx = hit.x;
        gz = hit.z;
      }
    }
    const hp = hovered >= 0 ? world.parcels[hovered] : null;
    const scanX = live.scanX;
    const t = U.uTime.value;

    const s1 = tex.s1.image.data as unknown as Float32Array;
    const s2 = tex.s2.image.data as unknown as Float32Array;
    const s3 = tex.s3.image.data as unknown as Float32Array;
    for (let i = 0; i < N; i++) {
      const p = world.parcels[i];
      let src = T;
      if (N0 && p.cx > scanX) src = N0;
      let lift = src.lift[i];
      let glow = src.glow[i];
      let dim = src.dim[i];
      let emis = 0;
      if (mode.focus >= 0) {
        if (i === mode.focus) {
          lift += mode.focusLift;
          glow = 1;
          emis = 0.25 + 0.12 * Math.sin(t * 2.4);
        } else dim *= 1 - mode.focusDim;
      }
      if (N0 && p.cx <= scanX && p.acq && src.risk[i] >= 0.55) {
        // freshly scanned high-risk parcels pulse once
        const since = scanX - p.cx;
        emis += Math.max(0, 0.5 - since * 0.04);
      }
      if (gx < 1e8) {
        const d2 = (p.cx - gx) ** 2 + (p.cz - gz) ** 2;
        if (d2 < 49) {
          const f = 1 - Math.sqrt(d2) / 7;
          lift += 0.25 * f * f;
          glow = Math.min(1, glow + 0.35 * f);
        }
      }
      if (hp) {
        if (i === hovered) {
          lift += 0.6;
          glow = 1;
          emis = Math.max(emis, 0.28);
        } else {
          const d = Math.hypot(p.cx - hp.cx, p.cz - hp.cz);
          dim *= 0.55 + 0.45 * Math.min(1, d / 16);
        }
      }
      if (i === selected) {
        lift += 0.8;
        glow = 1;
        emis = Math.max(emis, 0.3 + 0.1 * Math.sin(t * 3));
      }
      const kk = i === hovered ? kFast : k;
      if (!cur.init) {
        cur.lift[i] = 0;
      }
      cur.lift[i] += (lift - cur.lift[i]) * kk;
      cur.glow[i] += (glow - cur.glow[i]) * kk;
      cur.dim[i] += (dim - cur.dim[i]) * kk;
      cur.emis[i] += (emis - cur.emis[i]) * kk;
      for (let c = 0; c < 3; c++) {
        const tc = src.color[i * 3 + c];
        const tb = src.border[i * 3 + c];
        if (!cur.init) {
          cur.color[i * 3 + c] = tc;
          cur.border[i * 3 + c] = tb;
        }
        cur.color[i * 3 + c] += (tc - cur.color[i * 3 + c]) * k;
        cur.border[i * 3 + c] += (tb - cur.border[i * 3 + c]) * k;
        s1[i * 4 + c] = cur.color[i * 3 + c];
        s3[i * 4 + c] = cur.border[i * 3 + c];
      }
      s1[i * 4 + 3] = cur.lift[i];
      s2[i * 4] = cur.glow[i];
      s2[i * 4 + 1] = cur.dim[i];
      s2[i * 4 + 2] = cur.emis[i];
      s2[i * 4 + 3] = 1;
    }
    cur.init = true;
    tex.s1.needsUpdate = true;
    tex.s2.needsUpdate = true;
    tex.s3.needsUpdate = true;
  });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactiveRef.current || e.faceIndex == null) return;
    e.stopPropagation();
    const idx = faceToParcel[e.faceIndex];
    const s = useStore.getState();
    if (s.hovered !== idx) s.set({ hovered: idx, cursor3d: 'explore' });
  };
  const onOut = () => {
    const s = useStore.getState();
    if (s.hovered !== -1) s.set({ hovered: -1, cursor3d: 'default' });
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactiveRef.current || e.faceIndex == null) return;
    e.stopPropagation();
    const idx = faceToParcel[e.faceIndex];
    const s = useStore.getState();
    s.set({ selected: s.selected === idx ? -1 : idx, cursor3d: 'inspect' });
  };

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      onPointerMove={onMove}
      onPointerOut={onOut}
      onClick={onClick}
      frustumCulled={false}
    />
  );
}
