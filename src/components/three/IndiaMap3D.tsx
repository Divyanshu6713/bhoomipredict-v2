/**
 * 3D GIS view of India for the dashboard (light theme).
 *
 * Real State / district boundaries from /api/geo/boundaries are extruded by the
 * same mean project risk the 2D map shades with, and each project stands as a
 * pillar at its (synthetic, district-sampled) location. It takes the same
 * inputs as IndiaGISMap, so every filter on the page applies unchanged.
 *
 * Projection matches IndiaGISMap: equirectangular with longitude scaled by
 * cos(23.5°). Heights are a visual encoding of risk, not elevation.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RISK_HEX, riskFromScore } from '@/lib/risk';
import type { GeoCollection, GeoFeature, MapProject, RiskLevel } from '@/data/types';
import type { MapDistrictStat, MapStateStat } from '@/components/gis/IndiaGISMap';

const K = Math.cos((23.5 * Math.PI) / 180);
const S = 8; // world units per projected degree
const LON0 = 82.5; // centre India on the origin
const LAT0 = 22.5;
const toXZ = (lon: number, lat: number): [number, number] => [(lon - LON0) * K * S, (LAT0 - lat) * S];

const heightFor = (avgRisk: number | undefined) => (avgRisk == null ? 0.5 : 0.8 + Math.pow(Math.max(0, avgRisk) / 100, 1.25) * 22);
const NO_DATA = '#d9dee5';
const white = new THREE.Color('#ffffff');

function tint(hex: string, k: number) {
  return new THREE.Color(hex).lerp(white, k);
}

function polygonsOf(f: GeoFeature): number[][][][] {
  return f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
}

function shapesOf(f: GeoFeature) {
  const shapes: THREE.Shape[] = [];
  for (const poly of polygonsOf(f)) {
    const rings = poly.map((ring) => {
      const pts = ring.map(([lon, lat]) => {
        const [x, z] = toXZ(lon, lat);
        return new THREE.Vector2(x, -z); // shape space y = -world z (after rotateX(-90°))
      });
      if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
      return pts;
    });
    if (rings[0].length < 3) continue;
    const shape = new THREE.Shape(rings[0]);
    for (const hole of rings.slice(1)) if (hole.length >= 3) shape.holes.push(new THREE.Path(hole));
    shapes.push(shape);
  }
  return shapes;
}

function outlineOf(f: GeoFeature, y: number) {
  const pos: number[] = [];
  for (const poly of polygonsOf(f)) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, z1] = toXZ(ring[i][0], ring[i][1]);
        const [x2, z2] = toXZ(ring[i + 1][0], ring[i + 1][1]);
        pos.push(x1, y + 0.02, z1, x2, y + 0.02, z2);
      }
    }
  }
  return pos;
}

function bboxOf(fs: GeoFeature[]) {
  const b = new THREE.Box3();
  for (const f of fs)
    for (const poly of polygonsOf(f))
      for (const [lon, lat] of poly[0]) {
        const [x, z] = toXZ(lon, lat);
        b.expandByPoint(new THREE.Vector3(x, 0, z));
      }
  return b;
}

interface Region {
  key: string;
  name: string;
  feature: GeoFeature;
  height: number;
  band: RiskLevel | null;
  avgRisk?: number;
  projects?: number;
  highOrCritical?: number;
  openCases?: number;
}

type Hover = { kind: 'state' | 'district' | 'project'; title: string; lines: string[]; x: number; y: number } | null;

export interface IndiaMap3DProps {
  states?: GeoCollection | null;
  districts?: GeoCollection | null;
  projects: MapProject[];
  stateStats?: Map<string, MapStateStat>;
  districtStats?: Map<string, MapDistrictStat>;
  selectedState?: string | null;
  selectedDistrict?: string | null;
  onSelectState?: (state: string | null) => void;
  onSelectDistrict?: (key: string | null) => void;
  onOpenProject?: (id: string) => void;
  height?: number;
  /** Compact: auto-rotates, no districts, no pillars labels — for overview cards. */
  compact?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ regions */

function RegionMesh({
  r,
  dim,
  selected,
  onHover,
  onClick,
}: {
  r: Region;
  dim: boolean;
  selected: boolean;
  onHover: (r: Region | null, e?: ThreeEvent<PointerEvent>) => void;
  onClick: (r: Region) => void;
}) {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapesOf(r.feature), { depth: 1, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, [r.feature]);
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: r.band ? tint(RISK_HEX[r.band], 0.18) : new THREE.Color(NO_DATA),
        roughness: 0.75,
        metalness: 0.02,
        transparent: true,
      }),
    [r.band],
  );
  const [hover, setHover] = useState(false);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const k = 1 - Math.exp(-dt * 8);
    const target = (dim ? 0.35 : r.height) * (hover ? 1.08 : 1);
    m.scale.y += (target - m.scale.y) * k;
    const op = dim ? 0.35 : 1;
    mat.opacity += (op - mat.opacity) * k;
    mat.emissive.set(hover || selected ? '#ffffff' : '#000000');
    mat.emissiveIntensity = hover ? 0.18 : selected ? 0.1 : 0;
  });
  return (
    <mesh
      ref={mesh}
      geometry={geo}
      material={mat}
      scale={[1, 0.01, 1]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        onHover(r, e);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(r, e);
      }}
      onPointerOut={() => {
        setHover(false);
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(r);
      }}
    />
  );
}

function Outlines({ regions, color, dimAll, isDim }: { regions: Region[]; color: string; dimAll: boolean; isDim: (r: Region) => boolean }) {
  const geo = useMemo(() => {
    const pos: number[] = [];
    for (const r of regions) pos.push(...outlineOf(r.feature, isDim(r) ? 0.35 : r.height));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [regions, isDim]);
  return (
    <lineSegments geometry={geo} raycast={() => null}>
      <lineBasicMaterial color={color} transparent opacity={dimAll ? 0.25 : 0.9} />
    </lineSegments>
  );
}

/* ------------------------------------------------------------------ pillars */

function Pillars({
  projects,
  baseHeight,
  onHover,
  onOpen,
}: {
  projects: MapProject[];
  baseHeight: (p: MapProject) => number;
  onHover: (p: MapProject | null, e?: ThreeEvent<PointerEvent>) => void;
  onOpen?: (id: string) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const hovered = useRef(-1);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    projects.forEach((p, i) => {
      const [x, z] = toXZ(p.lon, p.lat);
      const h = 1.5 + (p.riskScore / 100) * 9;
      o.position.set(x, baseHeight(p) + h / 2, z);
      o.scale.set(1, h, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(RISK_HEX[p.riskBand]));
    });
    m.count = projects.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [projects, baseHeight]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, Math.max(1, projects.length)]}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.instanceId == null) return;
        hovered.current = e.instanceId;
        onHover(projects[e.instanceId], e);
      }}
      onPointerOut={() => {
        hovered.current = -1;
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId != null) onOpen?.(projects[e.instanceId].id);
      }}
    >
      <cylinderGeometry args={[0.32, 0.32, 1, 10]} />
      <meshStandardMaterial roughness={0.45} metalness={0.05} />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ camera */

function CameraFocus({ box, compact }: { box: THREE.Box3 | null; compact: boolean }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null };
  const anim = useRef<{ t: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null>(null);
  useEffect(() => {
    if (!box || !controls) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.5 + 6;
    const dist = (r / Math.tan((camera.fov * Math.PI) / 360)) * (compact ? 0.92 : 0.86);
    // look a little south of centre so the peninsula is not clipped by the tilt
    c.z += size.z * 0.06;
    const dir = new THREE.Vector3(0.0, 1.0, 0.62).normalize();
    anim.current = {
      t: 0,
      fromT: controls.target.clone(),
      toT: c,
      fromP: camera.position.clone(),
      toP: c.clone().addScaledVector(dir, dist),
    };
  }, [box, controls, camera, compact]);
  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt * 1.4);
    const e = 1 - Math.pow(1 - a.t, 3);
    controls.target.lerpVectors(a.fromT, a.toT, e);
    camera.position.lerpVectors(a.fromP, a.toP, e);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

/* ------------------------------------------------------------------ scene */

function Scene(props: IndiaMap3DProps & { setHover: (h: Hover) => void; reduced: boolean }) {
  const { states, districts, projects, stateStats, districtStats, selectedState, selectedDistrict, compact, setHover } = props;
  const stateRegions = useMemo<Region[]>(
    () =>
      (states?.features ?? []).map((f) => {
        const name = f.properties.state;
        const s = stateStats?.get(name);
        return {
          key: name,
          name,
          feature: f,
          height: heightFor(s?.avgRisk),
          band: s ? riskFromScore(s.avgRisk) : null,
          avgRisk: s?.avgRisk,
          projects: s?.projects,
          highOrCritical: s?.highOrCritical,
        };
      }),
    [states, stateStats],
  );
  const districtRegions = useMemo<Region[]>(
    () =>
      compact || !selectedState
        ? []
        : (districts?.features ?? [])
            .filter((f) => f.properties.state === selectedState)
            .map((f) => {
              const d = f.properties.district ?? f.properties.name ?? '';
              const key = f.properties.key ?? `${selectedState}|${d}`;
              const s = districtStats?.get(key);
              return {
                key,
                name: d,
                feature: f,
                height: heightFor(s?.avgRisk) * 0.8 + 0.6,
                band: s ? riskFromScore(s.avgRisk) : null,
                avgRisk: s?.avgRisk,
                projects: s?.projects,
                openCases: s?.openCases,
              };
            }),
    [districts, districtStats, selectedState, compact],
  );
  const inDistrictView = districtRegions.length > 0;

  const heightOf = useMemo(() => {
    const st = new Map(stateRegions.map((r) => [r.key, r.height]));
    const di = new Map(districtRegions.map((r) => [r.key, r.height]));
    return (p: MapProject) => {
      if (inDistrictView && p.state === selectedState) {
        for (const d of p.districts) {
          const h = di.get(`${p.state}|${d}`);
          if (h != null) return h;
        }
      }
      return st.get(p.state) ?? 0.5;
    };
  }, [stateRegions, districtRegions, inDistrictView, selectedState]);

  const focusBox = useMemo(() => {
    if (!selectedState) return states ? bboxOf(states.features) : null;
    const f = states?.features.filter((x) => x.properties.state === selectedState) ?? [];
    return f.length ? bboxOf(f) : null;
  }, [states, selectedState, compact]);

  const stateDim = useMemo(() => (r: Region) => inDistrictView || (!!selectedState && r.key !== selectedState), [inDistrictView, selectedState]);
  const districtDim = useMemo(() => (r: Region) => !!selectedDistrict && r.key !== selectedDistrict, [selectedDistrict]);

  const pillarProjects = useMemo(() => (inDistrictView ? projects.filter((p) => p.state === selectedState) : projects), [projects, inDistrictView, selectedState]);

  const hoverRegion = (kind: 'state' | 'district') => (r: Region | null, e?: ThreeEvent<PointerEvent>) => {
    if (!r || !e) return setHover(null);
    const lines =
      r.avgRisk == null
        ? ['No projects in the current filter']
        : [`Mean risk ${r.avgRisk}% · ${r.band}`, `${r.projects} project${r.projects === 1 ? '' : 's'}${r.highOrCritical != null ? ` · ${r.highOrCritical} High/Critical` : ''}${r.openCases != null ? ` · ${r.openCases} open cases` : ''}`];
    setHover({ kind, title: kind === 'district' ? `${r.name}, ${selectedState}` : r.name, lines, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  };

  return (
    <>
      <hemisphereLight args={['#ffffff', '#c9d2dc', 1.1]} />
      <directionalLight position={[-120, 220, 140]} intensity={1.5} />
      <directionalLight position={[160, 90, -120]} intensity={0.35} />
      <group>
        {stateRegions.map((r) => (
          <RegionMesh
            key={r.key}
            r={r}
            dim={stateDim(r)}
            selected={r.key === selectedState && !inDistrictView}
            onHover={inDistrictView ? () => undefined : hoverRegion('state')}
            onClick={(x) => props.onSelectState?.(selectedState === x.key ? null : x.key)}
          />
        ))}
        <Outlines regions={stateRegions} color="#8a96a3" dimAll={inDistrictView} isDim={stateDim} />
      </group>
      {inDistrictView && (
        <group>
          {districtRegions.map((r) => (
            <RegionMesh
              key={r.key}
              r={r}
              dim={districtDim(r)}
              selected={r.key === selectedDistrict}
              onHover={hoverRegion('district')}
              onClick={(x) => props.onSelectDistrict?.(selectedDistrict === x.key ? null : x.key)}
            />
          ))}
          <Outlines regions={districtRegions} color="#6b7785" dimAll={false} isDim={districtDim} />
        </group>
      )}
      <Pillars
        projects={pillarProjects}
        baseHeight={heightOf}
        onOpen={props.onOpenProject}
        onHover={(p, e) =>
          p && e
            ? setHover({
                kind: 'project',
                title: p.name,
                lines: [`${p.id} · ${p.district}, ${p.state}`, `Risk ${p.riskScore}% · ${p.riskBand} · ${p.stage}`, 'Click to open the project'],
                x: e.nativeEvent.offsetX,
                y: e.nativeEvent.offsetY,
              })
            : setHover(null)
        }
      />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={30}
        maxDistance={900}
        maxPolarAngle={Math.PI * 0.46}
        autoRotate={!!compact && !props.reduced}
        autoRotateSpeed={0.35}
        enablePan={!compact}
        enableZoom={!compact}
      />
      <CameraFocus box={focusBox} compact={!!compact} />
    </>
  );
}

export default function IndiaMap3D(props: IndiaMap3DProps) {
  const { height = 620, compact, className } = props;
  const [hover, setHover] = useState<Hover>(null);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ready = !!props.states;
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-line bg-gradient-to-b from-surface-2 to-surface ${className ?? ''}`}
      style={{ height }}
      role="img"
      aria-label={`3D map of India: States${props.selectedState ? ` and districts of ${props.selectedState}` : ''} raised by mean project risk, with ${props.projects.length} projects shown as pillars. The 2D map and the table below carry the same data.`}
    >
      {ready ? (
        <Canvas dpr={[1, 1.75]} camera={{ fov: 32, near: 1, far: 5000, position: [0, 420, 360] }} gl={{ antialias: true, alpha: true }} onPointerMissed={() => setHover(null)}>
          <Scene {...props} setHover={setHover} reduced={reduced} />
        </Canvas>
      ) : (
        <div className="grid h-full place-items-center text-sm text-ink-3">Loading boundaries…</div>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-[280px] rounded-lg border border-line bg-surface/95 px-3 py-2 shadow-pop backdrop-blur"
          style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 14 }}
        >
          <p className="text-sm font-semibold text-ink">{hover.title}</p>
          {hover.lines.map((l) => (
            <p key={l} className="text-xs text-ink-2">
              {l}
            </p>
          ))}
        </div>
      )}
      {!compact && (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-surface/85 px-2 py-1 text-2xs text-ink-3 backdrop-blur">
          Drag to rotate · scroll to zoom · right-drag to pan · click a {props.selectedState ? 'district' : 'State'} to drill in · click a pillar to open the project
        </p>
      )}
    </div>
  );
}
