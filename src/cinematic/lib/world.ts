/**
 * Synthetic land model. Everything here is generated from a fixed seed:
 * terrain, a planned project corridor, Voronoi land parcels, villages, and a
 * synthetic acquisition case for every parcel the corridor crosses.
 * None of it is cadastral, government or real-world data.
 */
import { Delaunay } from 'd3-delaunay';
import { createNoise2D } from 'simplex-noise';
import { mulberry32, gauss, poisson, clamp, smoothstep, sigmoid, type Rand } from './rng';
import { BASE_DAYS, COMPLETE } from './stages';

export const TODAY = 540; // demo snapshot day
export const DAY_MAX = 1260;
export const ROW_HALF = 4.3; // right-of-way half width (world units)
export const BAND = 24; // parcel band half width around the corridor
export const X_MIN = -68;
export const X_MAX = 68;
export const UNIT_M = 40; // 1 world unit ≈ 40 m (for display only)
export const SEGMENTS = 6;
export const CLUSTER_X = -11;

export const corridorZ = (x: number) => 6 * Math.sin(x * 0.045) + 3 * Math.sin(x * 0.11 + 1.2) - 1;
export const corridorSlope = (x: number) => 6 * 0.045 * Math.cos(x * 0.045) + 3 * 0.11 * Math.cos(x * 0.11 + 1.2);
export const riverX = (z: number) => 24 + 4 * Math.sin(z * 0.12) + 2 * Math.sin(z * 0.05 + 0.7);

const n1 = createNoise2D(mulberry32(7));
const n2 = createNoise2D(mulberry32(11));
function fbm(noise: (x: number, y: number) => number, x: number, z: number, oct: number) {
  let a = 0.5;
  let f = 1;
  let s = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, z * f);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

export function terrainHeight(x: number, z: number) {
  const d = Math.abs(z - corridorZ(x));
  const ridged = 1 - Math.abs(fbm(n1, x * 0.018 + 3, z * 0.018 - 2, 4));
  const hills = (0.25 + 0.75 * ridged * ridged) * 22 * smoothstep(21, 52, d);
  const ends = smoothstep(72, 96, Math.abs(x)) * (6 + 8 * ridged);
  const base = fbm(n2, x * 0.06, z * 0.06, 3) * 0.42;
  const rx = x - riverX(z);
  const river = -1.9 * Math.exp(-(rx * rx) / 2.2) * (1 - smoothstep(30, 55, d));
  return base + hills + ends + river;
}

export const VILLAGES = [
  { name: 'V-01', x: -52, off: 13 },
  { name: 'V-02', x: -27, off: -14 },
  { name: 'V-03', x: 2, off: 15 },
  { name: 'V-04', x: 40, off: -13 },
  { name: 'V-05', x: 57, off: 14 },
].map((v) => ({ ...v, z: corridorZ(v.x) + v.off, r: 5.2 }));

/** Administrative units (synthetic). Parcels take the nearest centre. */
export const ADMIN_UNITS = [
  { name: 'V-01', x: -52, z: corridorZ(-52) + 6 },
  { name: 'V-02', x: -30, z: corridorZ(-30) - 6 },
  { name: 'V-03', x: -8, z: corridorZ(-8) + 7 },
  { name: 'V-04', x: 10, z: corridorZ(10) - 8 },
  { name: 'V-05', x: 40, z: corridorZ(40) - 5 },
  { name: 'V-06', x: 58, z: corridorZ(58) + 8 },
];

export const LAND_USES = ['Agricultural', 'Residential', 'Orchard', 'Forest fringe', 'Government', 'Riverine'] as const;
export type LandUse = (typeof LAND_USES)[number];

export interface AcqCase {
  owners: number;
  unresolved: number;
  legal: boolean;
  families: number;
  rrStart: number; // R&R progress already achieved before the R&R stage (0..1)
  notifDelay: number; // days
  objections: number;
  responsiveness: number; // 0..1
  histDelay: number; // 0..1 area-level historical delay index
  difficulty: number; // latent (never shown)
  entries: number[]; // entry day of stage k (k=0..11), entries[12] = completion
  actions: number[]; // recorded action days, sorted
  missing: string[]; // feature keys with missing source data
  eps: number; // parcel-level residual ("other signals")
  ownerGroup: number; // shared ownership record group (-1 = none)
}

export interface Parcel {
  idx: number;
  id: string;
  poly: [number, number][]; // inset polygon (x, z)
  cx: number;
  cz: number;
  y: number; // slab base height
  areaHa: number;
  inRoW: boolean;
  dist: number; // signed offset from corridor centre line
  landUse: LandUse;
  village: number; // admin unit index
  tehsil: 0 | 1;
  segment: number; // work front index (RoW parcels)
  neighbors: number[];
  acq: AcqCase | null;
}

export interface World {
  parcels: Parcel[];
  row: Parcel[];
  byId: Map<string, Parcel>;
  heroId: string;
  hero2Id: string;
  buildings: { x: number; z: number; y: number; w: number; d: number; h: number; rot: number }[];
  segmentBounds: [number, number][];
  roadChunks: { x0: number; x1: number; availDay: number; segment: number }[];
  clusterCenter: [number, number];
}

function polygonArea(poly: [number, number][]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function centroid(poly: [number, number][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    const f = x1 * z2 - x2 * z1;
    a += f;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  a *= 0.5;
  return [cx / (6 * a), cz / (6 * a)];
}

export const segmentOf = (x: number) =>
  clamp(Math.floor(((x - X_MIN) / (X_MAX - X_MIN)) * SEGMENTS), 0, SEGMENTS - 1);

export const segmentName = (s: number) => `C${s + 1}`;

function buildSchedule(rand: Rand, c: Omit<AcqCase, 'entries' | 'actions'>, segment: number) {
  const entries: number[] = [];
  let t = 8 + segment * 16 + rand() * 46;
  const share = c.owners ? c.unresolved / c.owners : 0;
  for (let k = 0; k < 12; k++) {
    entries.push(t);
    let dur = BASE_DAYS[k] * Math.exp(gauss(rand, 0, 0.2) + 0.2 * c.difficulty);
    if (k === 1) dur *= 1 + 0.9 * share;
    if (k === 3) dur += c.notifDelay;
    if (k === 4) dur *= 1 + 0.18 * c.objections;
    if (k === 7) dur *= 1 + 1.1 * share + (1 - c.responsiveness) * 0.6;
    if (k === 8) dur = c.legal ? (110 + rand() * 170) * Math.exp(0.15 * c.difficulty) : 0;
    if (k === 9) dur = c.families > 0 ? (34 + 9 * c.families) * (1.4 - c.rrStart) * (1.6 - c.responsiveness) : 0;
    if (k === 10) dur *= 1 + 0.4 * (1 - c.responsiveness);
    t += Math.max(0, dur);
  }
  entries.push(t);
  const actions: number[] = [];
  for (let k = 0; k < 12; k++) {
    const a = entries[k];
    const b = entries[k + 1];
    if (b <= a) continue;
    actions.push(a);
    let s = a;
    const gap = 16 + 34 * (1 - c.responsiveness) + 10 * c.difficulty;
    for (;;) {
      s += Math.max(6, gap * (0.4 + rand() * 1.2));
      if (s >= b) break;
      actions.push(s);
    }
  }
  actions.push(entries[12]);
  actions.sort((x, y) => x - y);
  return { entries, actions };
}

export function stageAt(p: Parcel, day: number) {
  const e = p.acq?.entries;
  if (!e) return -1;
  if (day < e[0]) return 0;
  if (day >= e[12]) return COMPLETE;
  let k = 0;
  for (let i = 0; i < 12; i++) if (e[i] <= day && e[i + 1] > e[i]) k = i;
  return k;
}

export function lastActionBefore(p: Parcel, day: number) {
  const a = p.acq!.actions;
  let lo = 0;
  let hi = a.length - 1;
  let best = a[0];
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (a[m] <= day) {
      best = a[m];
      lo = m + 1;
    } else hi = m - 1;
  }
  return Math.min(best, day);
}

export function buildWorld(): World {
  const rand = mulberry32(20260918);
  type Seed = { x: number; z: number; kind: 'field' | 'village' | 'ghost'; v?: number };
  const seeds: Seed[] = [];
  const SX = 2.2;
  const SZ = 2.8;
  const inVillage = (x: number, z: number) =>
    VILLAGES.findIndex((v) => (x - v.x) ** 2 + (z - v.z) ** 2 < v.r * v.r);
  const nearRiver = (x: number, z: number) => Math.abs(x - riverX(z)) < 1.25;

  for (let x = X_MIN - 7; x <= X_MAX + 7; x += SX) {
    for (let r = -10; r <= 10; r++) {
      const jx = x + (rand() - 0.5) * SX * 0.75;
      const off = r * SZ + (rand() - 0.5) * SZ * 0.62;
      const z = corridorZ(jx) + off;
      const ghost = Math.abs(r) >= 10 || jx < X_MIN || jx > X_MAX;
      if (ghost) {
        seeds.push({ x: jx, z, kind: 'ghost' });
        continue;
      }
      if (inVillage(jx, z) >= 0 || nearRiver(jx, z)) continue;
      if (Math.abs(off) > 6 && rand() < 0.1) continue; // occasional larger holdings
      seeds.push({ x: jx, z, kind: 'field' });
    }
  }
  VILLAGES.forEach((v, vi) => {
    for (let gx = -v.r; gx <= v.r; gx += 1.3) {
      for (let gz = -v.r; gz <= v.r; gz += 1.3) {
        const x = v.x + gx + (rand() - 0.5) * 0.6;
        const z = v.z + gz + (rand() - 0.5) * 0.6;
        if ((x - v.x) ** 2 + (z - v.z) ** 2 < v.r * v.r && !nearRiver(x, z)) seeds.push({ x, z, kind: 'village', v: vi });
      }
    }
  });
  // the river is a gap: fill it with ghost cells
  for (let z = -60; z <= 60; z += 0.9) seeds.push({ x: riverX(z), z, kind: 'ghost' });

  const delaunay = Delaunay.from(seeds.map((s) => [s.x, s.z] as [number, number]));
  const vor = delaunay.voronoi([-82, -62, 82, 62]);
  const parcels: Parcel[] = [];
  const seedToParcel = new Int32Array(seeds.length).fill(-1);
  const parcelSeed: number[] = [];

  seeds.forEach((s, i) => {
    if (s.kind === 'ghost') return;
    const cell = vor.cellPolygon(i);
    if (!cell) return;
    let poly = cell.slice(0, -1).map((p) => [p[0], p[1]] as [number, number]);
    let area = Math.abs(polygonArea(poly));
    if (area < 0.35 || area > 22) return;
    const [cx, cz] = centroid(poly);
    const gap = s.kind === 'village' ? 0.1 : 0.13;
    poly = poly.map(([x, z]) => {
      const dx = x - cx;
      const dz = z - cz;
      const l = Math.hypot(dx, dz) || 1;
      const k = Math.max(0.2, (l - gap) / l);
      return [cx + dx * k, cz + dz * k];
    });
    area = Math.abs(polygonArea(poly));
    const dist = cz - corridorZ(cx);
    const inRoW =
      cx > X_MIN + 0.5 && cx < X_MAX - 0.5 && poly.some(([x, z]) => Math.abs(z - corridorZ(x)) < ROW_HALF);
    let y = terrainHeight(cx, cz);
    for (const [x, z] of poly) y = Math.max(y, terrainHeight(x, z));
    let landUse: LandUse = 'Agricultural';
    const rv = rand();
    if (s.kind === 'village') landUse = 'Residential';
    else if (Math.abs(cx - riverX(cz)) < 4.2) landUse = 'Riverine';
    else if (Math.abs(dist) > 15 && rv < 0.38) landUse = 'Forest fringe';
    else if (rv < 0.06) landUse = 'Government';
    else if (rv < 0.16) landUse = 'Orchard';
    let village = 0;
    let best = Infinity;
    ADMIN_UNITS.forEach((u, ui) => {
      const d2 = (u.x - cx) ** 2 + (u.z - cz) ** 2;
      if (d2 < best) {
        best = d2;
        village = ui;
      }
    });
    seedToParcel[i] = parcels.length;
    parcelSeed.push(i);
    parcels.push({
      idx: parcels.length,
      id: '',
      poly,
      cx,
      cz,
      y,
      areaHa: +(area * (UNIT_M * UNIT_M) / 10000).toFixed(2),
      inRoW,
      dist,
      landUse,
      village,
      tehsil: cx < riverX(cz) ? 0 : 1,
      segment: segmentOf(cx),
      neighbors: [],
      acq: null,
    });
  });

  parcels.forEach((p, pi) => {
    const si = parcelSeed[pi];
    const ns: number[] = [];
    for (const n of delaunay.neighbors(si)) if (seedToParcel[n] >= 0) ns.push(seedToParcel[n]);
    p.neighbors = ns;
  });

  // stable IDs: west → east, like a survey register
  const order = [...parcels].sort((a, b) => a.cx - b.cx || a.cz - b.cz);
  order.forEach((p, i) => (p.id = `P-${1001 + i}`));

  const row = parcels.filter((p) => p.inRoW);
  const clusterZ = corridorZ(CLUSTER_X);

  // hero parcels sit inside the high-risk cluster
  const byDist = (x: number, z: number) =>
    [...row].sort((a, b) => (a.cx - x) ** 2 + (a.cz - z) ** 2 - ((b.cx - x) ** 2 + (b.cz - z) ** 2));
  const hero = byDist(CLUSTER_X + 1.5, clusterZ + 0.8)[0];
  const hero2 = byDist(CLUSTER_X - 5.5, clusterZ - 1.5).find((p) => p !== hero)!;
  const swapId = (p: Parcel, id: string) => {
    const other = parcels.find((q) => q.id === id);
    if (other && other !== p) other.id = p.id;
    p.id = id;
  };
  swapId(hero, 'P-1042');
  swapId(hero2, 'P-2048');

  // synthetic acquisition cases for right-of-way parcels
  const villageHist = ADMIN_UNITS.map(() => clamp(0.35 + gauss(rand, 0, 0.15)));
  let group = 0;
  const rowSorted = [...row].sort((a, b) => a.cx - b.cx);
  const groups = new Map<Parcel, number>();
  for (let i = 0; i < rowSorted.length; i++) {
    const p = rowSorted[i];
    if (groups.has(p)) continue;
    if (rand() < 0.3) {
      const mates = p.neighbors.map((n) => parcels[n]).filter((q) => q.inRoW && !groups.has(q));
      if (mates.length) {
        groups.set(p, group);
        mates.slice(0, 1 + Math.floor(rand() * 2)).forEach((q) => groups.set(q, group));
        group++;
      }
    }
  }

  for (const p of row) {
    const dc = Math.hypot(p.cx - CLUSTER_X, p.cz - clusterZ);
    const difficulty = gauss(rand) + (dc < 8 ? 1.25 * (1 - dc / 10) + 0.5 : 0);
    const owners = 1 + Math.min(5, poisson(rand, 1.3 + 0.3 * Math.max(0, difficulty)));
    let unresolved = 0;
    for (let o = 0; o < owners; o++) if (rand() < sigmoid(-1.7 + 0.9 * difficulty)) unresolved++;
    const families =
      p.landUse === 'Residential' ? 1 + Math.floor(rand() * 7) : rand() < 0.16 ? 1 + Math.floor(rand() * 2) : 0;
    const base = {
      owners,
      unresolved,
      legal: rand() < sigmoid(-2.5 + 0.95 * difficulty),
      families,
      rrStart: rand() * 0.45,
      notifDelay: Math.max(0, gauss(rand, 12 + 12 * difficulty, 12)),
      objections: Math.min(5, poisson(rand, Math.max(0.1, 0.5 + 0.55 * difficulty))),
      responsiveness: clamp(0.72 - 0.13 * difficulty + gauss(rand, 0, 0.13), 0.08, 0.98),
      histDelay: clamp(villageHist[p.village] + gauss(rand, 0, 0.05)),
      difficulty,
      missing: [] as string[],
      eps: gauss(rand, 0, 0.32),
      ownerGroup: groups.get(p) ?? -1,
    };
    if (rand() < 0.08) base.missing.push(['rr', 'response', 'notif'][Math.floor(rand() * 3)]);
    const sched = buildSchedule(rand, base, p.segment);
    p.acq = { ...base, ...sched };
  }

  // Scripted demo cases (still synthetic) so the story is reproducible.
  const h = hero.acq!;
  Object.assign(h, {
    owners: 5,
    unresolved: 3,
    legal: true,
    families: 3,
    rrStart: 0.1,
    notifDelay: 34,
    objections: 2,
    responsiveness: 0.42,
    missing: ['rr'],
    entries: [42, 78, 148, 204, 286, 420, 575, 622, 688, 806, 858, 890, 914],
    actions: [42, 60, 78, 110, 148, 170, 204, 240, 286, 330, 372, 420, 455, 494, 575, 622, 688, 806, 858, 890, 914],
  });
  const h2 = hero2.acq!;
  Object.assign(h2, {
    owners: 6,
    unresolved: 4,
    legal: false,
    families: 5,
    rrStart: 0.05,
    notifDelay: 22,
    objections: 3,
    responsiveness: 0.3,
    missing: [],
    entries: [30, 66, 128, 186, 258, 352, 468, 598, 640, 640, 772, 810, 842],
    actions: [30, 66, 100, 128, 186, 220, 258, 300, 352, 400, 440, 468, 479, 598, 640, 772, 810, 842],
  });

  // buildings on residential plots
  const brand = mulberry32(99);
  const buildings: World['buildings'] = [];
  for (const p of parcels) {
    if (p.landUse !== 'Residential') continue;
    const count = p.areaHa > 0.35 ? 2 : 1;
    for (let b = 0; b < count; b++) {
      const w = 0.35 + brand() * 0.45;
      const d = 0.3 + brand() * 0.4;
      buildings.push({
        x: p.cx + (brand() - 0.5) * 0.5,
        z: p.cz + (brand() - 0.5) * 0.5,
        y: p.y + 0.28,
        w,
        d,
        h: 0.25 + brand() * 0.7,
        rot: Math.atan(corridorSlope(p.cx)) + (brand() - 0.5) * 0.3,
      });
    }
  }
  // scattered farmsteads
  for (const p of parcels) {
    if (p.landUse === 'Agricultural' && !p.inRoW && brand() < 0.05) {
      buildings.push({ x: p.cx, z: p.cz, y: p.y + 0.28, w: 0.35, d: 0.3, h: 0.25 + brand() * 0.2, rot: brand() * 3 });
    }
  }

  const segmentBounds: [number, number][] = [];
  for (let s = 0; s < SEGMENTS; s++) {
    const a = X_MIN + ((X_MAX - X_MIN) * s) / SEGMENTS;
    segmentBounds.push([a, a + (X_MAX - X_MIN) / SEGMENTS]);
  }

  // corridor construction chunks: a chunk opens when every parcel it crosses is possessed
  const roadChunks: World['roadChunks'] = [];
  const STEP = 0.8;
  for (let x = X_MIN; x < X_MAX - 0.01; x += STEP) {
    const x1 = x + STEP;
    let avail = 0;
    for (const p of row) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (const [px] of p.poly) {
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
      }
      if (maxX < x || minX > x1 || Math.abs(p.dist) > ROW_HALF * 0.55) continue;
      avail = Math.max(avail, p.acq!.entries[10]);
    }
    roadChunks.push({ x0: x, x1, availDay: avail + 45, segment: segmentOf(x + STEP / 2) });
  }

  const byId = new Map(parcels.map((p) => [p.id, p]));
  return {
    parcels,
    row,
    byId,
    heroId: 'P-1042',
    hero2Id: 'P-2048',
    buildings,
    segmentBounds,
    roadChunks,
    clusterCenter: [CLUSTER_X, clusterZ],
  };
}
