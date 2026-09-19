import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { world } from '../lib/dataset';
import { PLATFORM_LAYERS } from '../lib/content';
import { useStore, live } from '../lib/store';
import { mulberry32 } from '../lib/rng';
import { useFade, seg } from './util';

const W = 26;
const D = 16;
const BOTTOM_UP = [...PLATFORM_LAYERS].reverse(); // GIS at the bottom, AUDIT on top

function drawPattern(k: string) {
  const c = document.createElement('canvas');
  c.width = 520;
  c.height = 320;
  const g = c.getContext('2d')!;
  const r = mulberry32(k.length * 97 + k.charCodeAt(0));
  g.fillStyle = 'rgba(12,18,24,0.88)';
  g.fillRect(0, 0, 520, 320);
  g.strokeStyle = 'rgba(114,184,200,0.55)';
  g.fillStyle = 'rgba(114,184,200,0.5)';
  g.lineWidth = 1.2;
  const sx = (x: number) => ((x + 40) / 80) * 520;
  const sz = (z: number) => ((z + 25) / 50) * 320;
  switch (k) {
    case 'GIS':
      for (const p of world.parcels) {
        if (Math.abs(p.cx) > 40 || Math.abs(p.cz) > 25) continue;
        g.beginPath();
        p.poly.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sz(z)) : g.moveTo(sx(x), sz(z))));
        g.closePath();
        g.globalAlpha = p.inRoW ? 0.9 : 0.35;
        g.stroke();
      }
      g.globalAlpha = 1;
      break;
    case 'DATA':
      for (let y = 30; y < 300; y += 22)
        for (let x = 30; x < 500; x += 38) {
          g.globalAlpha = 0.25 + r() * 0.6;
          g.fillRect(x, y, 24 * (0.4 + r() * 0.6), 6);
        }
      g.globalAlpha = 1;
      break;
    case 'ML': {
      const pts = Array.from({ length: 34 }, () => [30 + r() * 460, 30 + r() * 260]);
      pts.forEach((a, i) =>
        pts.slice(i + 1).forEach((b) => {
          if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 110) {
            g.globalAlpha = 0.35;
            g.beginPath();
            g.moveTo(a[0], a[1]);
            g.lineTo(b[0], b[1]);
            g.stroke();
          }
        }),
      );
      g.globalAlpha = 1;
      pts.forEach(([x, y]) => {
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
      });
      break;
    }
    case 'EXPLAINABILITY':
      [0.9, 0.82, 0.78, 0.4, 0.3, -0.2, -0.35].forEach((v, i) => {
        g.fillStyle = v > 0 ? 'rgba(225,164,60,0.8)' : 'rgba(114,184,200,0.7)';
        const w = Math.abs(v) * 200;
        g.fillRect(v > 0 ? 260 : 260 - w, 40 + i * 36, w, 16);
      });
      g.fillStyle = 'rgba(227,234,238,0.6)';
      g.fillRect(259, 30, 2, 260);
      break;
    case 'RISK':
      for (let i = 0; i < 9; i++) {
        const x = 40 + r() * 440;
        const y = 40 + r() * 240;
        const grd = g.createRadialGradient(x, y, 0, x, y, 40 + r() * 70);
        const hot = r() > 0.6;
        grd.addColorStop(0, hot ? 'rgba(224,97,47,0.85)' : 'rgba(225,164,60,0.55)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 520, 320);
      }
      break;
    case 'WORKFLOW':
      for (let i = 0; i < 5; i++) {
        const x = 30 + i * 98;
        g.strokeRect(x, 130, 70, 50);
        if (i < 4) {
          g.beginPath();
          g.moveTo(x + 72, 155);
          g.lineTo(x + 96, 155);
          g.stroke();
        }
      }
      g.strokeRect(128, 230, 70, 40);
      g.strokeRect(324, 50, 70, 40);
      break;
    case 'AUDIT':
      for (let i = 0; i < 6; i++) {
        const x = 26 + i * 82;
        g.strokeRect(x, 120, 62, 80);
        for (let l = 0; l < 4; l++) g.fillRect(x + 8, 134 + l * 16, 20 + r() * 26, 4);
        if (i < 5) {
          g.beginPath();
          g.moveTo(x + 62, 160);
          g.lineTo(x + 82, 160);
          g.stroke();
        }
      }
      break;
  }
  g.strokeStyle = 'rgba(159,211,223,0.9)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 517, 317);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function LayerStack() {
  const { v, mounted } = useFade(() => useStore.getState().active === 'layers', 3);
  const hover = useStore((s) => s.stackHover);
  const set = useStore((s) => s.set);
  const textures = useMemo(() => (mounted ? BOTTOM_UP.map((l) => drawPattern(l.k)) : []), [mounted]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  useFrame(({ clock }, dt) => {
    const s = useStore.getState();
    const open = 0.55 + seg(live.progress.layers, 0.05, 0.45) * 2.9;
    const k = s.reduced ? 1 : 1 - Math.exp(-dt * 5);
    BOTTOM_UP.forEach((_, i) => {
      const g = groups.current[i];
      if (!g) return;
      const topIdx = BOTTOM_UP.length - 1 - i;
      const hov = s.stackHover === topIdx;
      const ty = 6 + i * open + (hov ? 0.9 : 0);
      g.position.y += (ty - g.position.y) * k;
      g.rotation.y = s.reduced ? -0.35 : -0.35 + Math.sin(clock.elapsedTime * 0.2) * 0.05;
      const m = mats.current[i];
      if (m) m.opacity = v.current * (s.stackHover >= 0 && !hov ? 0.35 : 0.95);
    });
  });
  if (!mounted) return null;
  return (
    <group>
      {BOTTOM_UP.map((l, i) => {
        const topIdx = BOTTOM_UP.length - 1 - i;
        return (
          <group
            key={l.k}
            ref={(el) => {
              groups.current[i] = el;
            }}
            position={[0, 6 + i * 0.55, 0]}
          >
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerOver={(e) => {
                e.stopPropagation();
                set({ stackHover: topIdx, cursor3d: 'explore' });
              }}
              onPointerOut={() => set({ stackHover: -1, cursor3d: 'default' })}
            >
              <planeGeometry args={[W, D]} />
              <meshBasicMaterial
                ref={(m) => {
                  mats.current[i] = m;
                }}
                map={textures[i]}
                transparent
                side={THREE.DoubleSide}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <Html position={[W / 2 + 1, 0, 0]} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`stack-label ${hover === topIdx ? 'is-on' : ''}`}>{l.k}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
