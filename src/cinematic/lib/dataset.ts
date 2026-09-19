/** Singleton synthetic dataset shared by the 3D world and the UI. */
import { buildWorld, TODAY, stageAt, segmentName, type Parcel } from './world';
import { calibrate, score, bandOf, type Score, type Band } from './model';
import { COMPLETE } from './stages';
import { mulberry32, gauss, clamp } from './rng';

export const world = buildWorld();
calibrate(world);

export const PROJECT_NAME = 'NH Corridor Demo';

export interface Snapshot {
  score: Score | null;
  band: Band | null;
  stage: number;
}

/** Scores at the demo snapshot day, by parcel index. */
export const today: Snapshot[] = world.parcels.map((p) => {
  if (!p.acq) return { score: null, band: null, stage: -1 };
  const s = score(p, TODAY)!;
  const stage = stageAt(p, TODAY);
  return { score: s, band: stage >= COMPLETE ? null : bandOf(s.p), stage };
});

export const hero = world.byId.get(world.heroId)!;
export const hero2 = world.byId.get(world.hero2Id)!;

export function parcelById(id: string): Parcel | undefined {
  return world.byId.get(id.trim().toUpperCase().replace(/^P?-?(\d+)$/, 'P-$1'));
}

export const openCases = world.row.filter((p) => today[p.idx].stage < COMPLETE);
export const highCases = openCases.filter((p) => today[p.idx].band === 'high');

export const alerts = [...highCases]
  .sort((a, b) => today[b.idx].score!.p - today[a.idx].score!.p)
  .slice(0, 14)
  .map((p) => {
    const s = today[p.idx].score!;
    const top = s.rows.find((r) => r.contribution > 0);
    return {
      id: p.id,
      idx: p.idx,
      p: s.p,
      next: s.nextMilestone ?? '—',
      top: top?.label ?? '—',
      segment: segmentName(p.segment),
    };
  });

export const CLUSTER_R = 8.5;
export const clusterParcels = world.row.filter(
  (p) => Math.hypot(p.cx - world.clusterCenter[0], p.cz - world.clusterCenter[1]) < CLUSTER_R && today[p.idx].band === 'high',
);

/** Work-front status at a given day: share of right-of-way parcels possessed. */
export function segmentStatus(day: number) {
  return world.segmentBounds.map((_, s) => {
    const ps = world.row.filter((p) => p.segment === s);
    const ready = ps.filter((p) => stageAt(p, day) >= 10).length;
    const high = ps.filter((p) => {
      const st = stageAt(p, day);
      if (st >= COMPLETE) return false;
      const sc = day === TODAY ? today[p.idx].score : score(p, day);
      return !!sc && sc.p >= 0.55;
    }).length;
    return { segment: s, name: segmentName(s), total: ps.length, ready, high, share: ps.length ? ready / ps.length : 0 };
  });
}

export const segmentsToday = segmentStatus(TODAY);

/** Parcels that currently block their work front (not possessed, and the front is otherwise mostly ready or high risk). */
export function isBlocking(p: Parcel) {
  if (!p.acq) return false;
  const st = today[p.idx].stage;
  return st < 10 && (today[p.idx].band === 'high' || segmentsToday[p.segment].share > 0.6);
}

/* ---------- District / state roll-up (synthetic) ---------- */
export interface District {
  q: number;
  r: number;
  name: string;
  activeCases: number;
  highRisk: number;
  clusters: number;
  unresolved: number;
  constructionDeps: number;
  riskIndex: number; // 0..1
  trend: number[];
  isHome: boolean;
}

const drand = mulberry32(404);
const HEX: [number, number][] = [];
for (let q = -2; q <= 2; q++) for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) HEX.push([q, r]);

export const districts: District[] = HEX.map(([q, r], i) => {
  const isHome = q === 0 && r === 0;
  const active = isHome ? openCases.length + 612 : Math.round(180 + drand() * 900);
  const riskIndex = isHome ? 0.62 : clamp(0.18 + drand() * 0.55 + gauss(drand, 0, 0.08));
  const highRisk = isHome ? highCases.length + 71 : Math.round(active * (0.04 + riskIndex * 0.18));
  const trend: number[] = [];
  let v = riskIndex * 0.8;
  for (let t = 0; t < 12; t++) {
    v = clamp(v + gauss(drand, 0.012, 0.035));
    trend.push(v);
  }
  return {
    q,
    r,
    name: isHome ? 'D-07 (home district)' : `D-${String(i + 1).padStart(2, '0')}`,
    activeCases: active,
    highRisk,
    clusters: Math.max(0, Math.round(highRisk / 28 + drand() * 1.5)),
    unresolved: Math.round(active * (0.2 + drand() * 0.2)),
    constructionDeps: Math.round(highRisk * (0.3 + drand() * 0.3)),
    riskIndex,
    trend,
    isHome,
  };
});

export const stateTotals = districts.reduce(
  (a, d) => ({
    active: a.active + d.activeCases,
    high: a.high + d.highRisk,
    clusters: a.clusters + d.clusters,
    unresolved: a.unresolved + d.unresolved,
    deps: a.deps + d.constructionDeps,
  }),
  { active: 0, high: 0, clusters: 0, unresolved: 0, deps: 0 },
);

export function stageDistribution(parcels: Parcel[], day: number) {
  const counts = new Array(COMPLETE + 1).fill(0);
  for (const p of parcels) counts[Math.max(0, stageAt(p, day))]++;
  return counts;
}
