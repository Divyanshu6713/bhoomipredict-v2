/**
 * Per-layer visual targets for every parcel. Recomputed only when the layer
 * or the timeline day changes; the render loop eases towards them.
 */
import * as THREE from 'three';
import { world, today, segmentsToday } from '../lib/dataset';
import { score, bandOf, compStatusAt } from '../lib/model';
import { stageAt, TODAY } from '../lib/world';
import { COMPLETE } from '../lib/stages';
import { C, STAGE_RAMP, LANDUSE_COLOR, VILLAGE_COLOR, BAND_COLOR } from '../lib/palette';
import type { LayerId } from '../lib/store';

export type ModeLayer = LayerId | 'overview' | 'ambient';

export interface Targets {
  color: Float32Array; // rgb
  border: Float32Array; // rgb
  lift: Float32Array;
  glow: Float32Array;
  dim: Float32Array;
  risk: Float32Array; // probability at that day (0 when n/a)
}

const N = world.parcels.length;
const col = new THREE.Color();
const tmp = new THREE.Color();
const hex = (h: string) => new THREE.Color(h);
const PAL = {
  parcel: hex(C.parcel),
  row: hex(C.parcelRow),
  gis: hex(C.gis),
  gisDim: hex(C.gisDim),
  low: hex(C.low),
  med: hex(C.med),
  high: hex(C.high),
  ok: hex(C.ok),
  legal: hex(C.legal),
  done: hex('#18231f'),
  slate: hex('#263540'),
  process: hex('#34505e'),
  paleAmber: hex('#bba374'),
};

const boundaryParcel = world.parcels.map((p) => p.neighbors.some((n) => world.parcels[n].village !== p.village));

function alloc(): Targets {
  return {
    color: new Float32Array(N * 3),
    border: new Float32Array(N * 3),
    lift: new Float32Array(N),
    glow: new Float32Array(N),
    dim: new Float32Array(N),
    risk: new Float32Array(N),
  };
}

const cache = new Map<string, Targets>();

export function getTargets(layer: ModeLayer, day: number): Targets {
  const key = `${layer}|${Math.round(day)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = alloc();
  const put = (i: number, c: THREE.Color, b: THREE.Color, lift: number, glow: number, dim = 1) => {
    t.color[i * 3] = c.r;
    t.color[i * 3 + 1] = c.g;
    t.color[i * 3 + 2] = c.b;
    t.border[i * 3] = b.r;
    t.border[i * 3 + 1] = b.g;
    t.border[i * 3 + 2] = b.b;
    t.lift[i] = lift;
    t.glow[i] = glow;
    t.dim[i] = dim;
  };
  const isToday = Math.round(day) === TODAY;

  for (const p of world.parcels) {
    const i = p.idx;
    // context parcels (outside the right-of-way)
    if (!p.acq) {
      col.copy(PAL.parcel);
      let border = PAL.gisDim;
      let glow = 0.12;
      let dim = 1;
      if (layer === 'landuse') {
        col.set(LANDUSE_COLOR[p.landUse]).multiplyScalar(0.8);
        glow = 0.2;
      } else if (layer === 'admin') {
        border = tmp.set(VILLAGE_COLOR[p.village]);
        glow = boundaryParcel[i] ? 0.85 : 0.3;
        col.copy(PAL.parcel).lerp(tmp, 0.08);
      } else if (layer === 'infra' || layer === 'ambient') {
        dim = 0.7;
      } else if (layer === 'construction' || layer === 'litigation' || layer === 'risk') {
        dim = 0.75;
      }
      put(i, col, border, 0, glow, dim);
      continue;
    }

    const stage = stageAt(p, day);
    const done = stage >= COMPLETE;
    const sc = isToday ? today[i].score : score(p, day);
    const prob = done || !sc ? 0 : sc.p;
    t.risk[i] = prob;
    const band = done ? null : bandOf(prob);
    const a = p.acq;

    switch (layer) {
      case 'overview':
      case 'ambient': {
        if (done) put(i, PAL.done, PAL.gisDim, 0.02, 0.25);
        else {
          col.copy(PAL.row).lerp(hex(BAND_COLOR[band!]), band === 'high' ? 0.66 : band === 'medium' ? 0.4 : 0.12);
          put(i, col, PAL.gis, 0.08 + (band === 'high' ? 0.45 : band === 'medium' ? 0.14 : 0), 0.45);
        }
        break;
      }
      case 'parcels':
        put(i, PAL.row, PAL.gis, 0.06, 0.8);
        break;
      case 'status': {
        if (done) put(i, PAL.ok, PAL.ok, 0.05, 0.5);
        else if (stage >= 10) put(i, col.copy(PAL.gis).multiplyScalar(0.7), PAL.gis, 0.12, 0.6);
        else if (stage === 8) put(i, PAL.legal, PAL.legal, 0.2, 0.6);
        else if (stage >= 5) put(i, PAL.process, PAL.gis, 0.1, 0.5);
        else put(i, PAL.slate, PAL.gisDim, 0.06, 0.4);
        break;
      }
      case 'risk': {
        if (done) put(i, PAL.done, PAL.gisDim, 0.02, 0.2, 0.85);
        else put(i, hex(BAND_COLOR[band!]), hex(BAND_COLOR[band!]), 0.15 + prob * 2.6, 0.55);
        break;
      }
      case 'stage': {
        const c = hex(STAGE_RAMP[Math.max(0, stage)]);
        put(i, c, done ? PAL.ok : PAL.gis, done ? 0.04 : 0.1 + Math.max(0, stage) * 0.05 + prob * 0.8, 0.45);
        break;
      }
      case 'ownership': {
        const share = day < a.entries[8] && a.owners ? a.unresolved / a.owners : 0;
        col.copy(PAL.slate).lerp(PAL.med, share);
        put(i, col, a.ownerGroup >= 0 ? PAL.gis : PAL.gisDim, 0.06 + share * 1.4, a.ownerGroup >= 0 ? 0.9 : 0.35);
        break;
      }
      case 'litigation': {
        const active = a.legal && day >= a.entries[3] && day < a.entries[9];
        if (active) put(i, PAL.legal, PAL.legal, 0.9, 0.9);
        else if (a.legal && day >= a.entries[9]) put(i, col.copy(PAL.legal).multiplyScalar(0.4), PAL.gisDim, 0.08, 0.35);
        else put(i, PAL.slate, PAL.gisDim, 0.04, 0.25, 0.8);
        break;
      }
      case 'compensation': {
        const cs = compStatusAt(stage);
        if (done || stage > 7) put(i, PAL.ok, PAL.ok, 0.06, 0.45);
        else if (cs.x === 1) put(i, PAL.med, PAL.med, 0.7, 0.8);
        else if (cs.x === 0.5) put(i, PAL.paleAmber, PAL.paleAmber, 0.35, 0.6);
        else put(i, PAL.slate, PAL.gisDim, 0.05, 0.3);
        break;
      }
      case 'rr': {
        if (!a.families) put(i, PAL.slate, PAL.gisDim, 0.03, 0.25, 0.8);
        else {
          const doneRR = day >= a.entries[10];
          col.copy(doneRR ? PAL.ok : PAL.med);
          put(i, col, col, 0.2 + a.families * 0.2, 0.7);
        }
        break;
      }
      case 'construction': {
        const seg = segmentsToday[p.segment];
        if (stage >= 10) put(i, col.copy(PAL.ok).multiplyScalar(0.55), PAL.ok, 0.03, 0.35);
        else {
          const blocking = band === 'high' || seg.share > 0.55;
          put(i, blocking ? PAL.high : PAL.med, blocking ? PAL.high : PAL.med, blocking ? 0.9 : 0.35, 0.8);
        }
        break;
      }
      case 'landuse':
        put(i, hex(LANDUSE_COLOR[p.landUse]), PAL.gis, 0.06, 0.7);
        break;
      case 'infra':
        put(i, PAL.row, PAL.gisDim, 0.04, 0.4, 0.7);
        break;
      case 'admin':
        put(i, col.copy(PAL.row).lerp(tmp.set(VILLAGE_COLOR[p.village]), 0.12), tmp.set(VILLAGE_COLOR[p.village]), 0.05, boundaryParcel[i] ? 0.95 : 0.5);
        break;
    }
  }
  if (cache.size > 64) cache.clear();
  cache.set(key, t);
  return t;
}
