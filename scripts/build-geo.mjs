/**
 * Administrative boundary layers for the GIS screens and the corpus generator.
 *
 *   node scripts/build-geo.mjs            # uses data/geo/source/, downloading if absent
 *
 * Source
 * ------
 * State, district and sub-district boundaries from the INDIAN-SHAPEFILES
 * collection (https://github.com/datta07/INDIAN-SHAPEFILES, MIT licence), which
 * follows the Survey of India depiction of the national boundary: Jammu &
 * Kashmir and Ladakh are shown in full, and the layers carry LGD / Census codes.
 * Nothing here is hand-drawn.
 *
 * The raw files are large (~100 MB), so they are simplified once with mapshaper
 * (a build-time tool invoked through npx; it is not a runtime dependency) and
 * the compact outputs in data/geo/ are committed:
 *
 *   data/geo/india-outline.json     national boundary (dissolved from the state layer)
 *   data/geo/india-states.json      36 states / UTs
 *   data/geo/india-districts.json   districts, names repaired
 *   data/geo/districts-index.json   per-district centroid, bbox, area and sub-district names
 *
 * The source shipped some names with a broken transliteration encoding
 * ("K>NGRA", "Bengal#ru (Urban)", or truncated Karnataka names such as "H").
 * They are repaired deterministically: character substitutions for the
 * diacritics, and Census-2011 district codes for the truncated names.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'geo');
const SRC = path.join(OUT, 'source');
const TMP = path.join(SRC, 'simplified');

const BASE = 'https://raw.githubusercontent.com/datta07/INDIAN-SHAPEFILES/master/INDIA';
const FILES = {
  states: 'INDIA_STATES.geojson',
  districts: 'INDIA_DISTRICTS.geojson',
  subDistricts: 'INDIAN_SUB_DISTRICTS.geojson',
};

/** Simplification interval in metres — ~600 m keeps district shapes recognisable at state zoom. */
const INTERVAL = 600;

async function ensureSource() {
  fs.mkdirSync(TMP, { recursive: true });
  for (const name of Object.values(FILES)) {
    const file = path.join(SRC, name);
    if (fs.existsSync(file)) continue;
    console.log(`[geo] downloading ${name}…`);
    const res = await fetch(`${BASE}/${name}`);
    if (!res.ok) throw new Error(`download failed for ${name}: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
}

function mapshaper(args) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npx, ['--yes', 'mapshaper', ...args], { stdio: 'inherit', shell: process.platform === 'win32' });
}

/* ------------------------------------------------------------ name repair */

const DIACRITIC = { '>': 'A', '|': 'I', '@': 'U', '#': 'u', '\\': 'i' };

/** Census-2011 codes for the Karnataka districts whose names arrived truncated. */
const KARNATAKA_BY_CODE = {
  '0555': 'Belagavi', '0556': 'Bagalkote', '0557': 'Vijayapura', '0558': 'Bidar', '0559': 'Raichur',
  '0560': 'Koppal', '0561': 'Gadag', '0562': 'Dharwad', '0563': 'Uttara Kannada', '0564': 'Haveri',
  '0565': 'Ballari', '0566': 'Chitradurga', '0567': 'Davanagere', '0568': 'Shivamogga', '0569': 'Udupi',
  '0570': 'Chikkamagaluru', '0571': 'Tumakuru', '0572': 'Bengaluru Urban', '0573': 'Mandya', '0574': 'Hassan',
  '0575': 'Dakshina Kannada', '0576': 'Kodagu', '0577': 'Mysuru', '0578': 'Chamarajanagar', '0579': 'Kalaburagi',
  '0580': 'Yadgir', '0581': 'Kolar', '0582': 'Chikkaballapura', '0583': 'Bengaluru Rural', '0584': 'Ramanagara',
};

const SMALL_WORDS = new Set(['and', 'of', 'the']);

const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/(\s+|-|\(|\))/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');

const repair = (s) => (s ?? '').replace(/[>|@#\\]/g, (ch) => DIACRITIC[ch]).trim();

/** State names as the application spells them. */
const STATE_NAME = {
  'ANDAMAN & NICOBAR': 'Andaman & Nicobar Islands',
  'ANDAMAN AND NICOBAR ISLANDS': 'Andaman & Nicobar Islands',
  'JAMMU & KASHMIR': 'Jammu & Kashmir',
  'JAMMU AND KASHMIR': 'Jammu & Kashmir',
  'DADRA & NAGAR HAVELI': 'Dadra & Nagar Haveli and Daman & Diu',
  'DAMAN & DIU': 'Dadra & Nagar Haveli and Daman & Diu',
  'DADRA & NAGAR HAVELI & DAMAN & DIU': 'Dadra & Nagar Haveli and Daman & Diu',
  ORISSA: 'Odisha',
};

export const stateName = (raw) => STATE_NAME[repair(raw).toUpperCase()] ?? titleCase(repair(raw));

function districtName(props) {
  const state = (props.state ?? '').toUpperCase();
  if (state === 'KARNATAKA' && KARNATAKA_BY_CODE[props.dist_code]) return KARNATAKA_BY_CODE[props.dist_code];
  const fixed = repair(props.district)
    .replace(/Bengaluru/i, 'Bengaluru')
    .replace(/24PARGANAS/i, '24 Parganas');
  return titleCase(fixed);
}

/* ---------------------------------------------------------------- geometry */

const round = (v) => Math.round(v * 1000) / 1000;

function eachRing(geometry, fn) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) for (let r = 0; r < poly.length; r++) fn(poly[r], r === 0);
}

function bboxOf(geometry) {
  const b = [180, 90, -180, -90];
  eachRing(geometry, (ring) => {
    for (const [x, y] of ring) {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  });
  return b.map(round);
}

/** Area-weighted centroid of the outer rings (planar, adequate at district scale). */
function centroidOf(geometry) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  eachRing(geometry, (ring, outer) => {
    const sign = outer ? 1 : -1;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += sign * f;
      cx += sign * (ring[j][0] + ring[i][0]) * f;
      cy += sign * (ring[j][1] + ring[i][1]) * f;
    }
  });
  if (Math.abs(a) < 1e-12) {
    const b = bboxOf(geometry);
    return [round((b[0] + b[2]) / 2), round((b[1] + b[3]) / 2)];
  }
  return [round(cx / (3 * a)), round(cy / (3 * a))];
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(x, y, geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    if (!pointInRing(x, y, poly[0])) continue;
    let hole = false;
    for (let r = 1; r < poly.length; r++) if (pointInRing(x, y, poly[r])) hole = true;
    if (!hole) return true;
  }
  return false;
}

/** Approximate area in km² (equirectangular, scaled by latitude). */
function areaKm2(geometry) {
  let total = 0;
  eachRing(geometry, (ring, outer) => {
    let s = 0;
    const lat0 = ring.reduce((acc, p) => acc + p[1], 0) / ring.length;
    const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      s += ring[j][0] * kx * ring[i][1] * 110.57 - ring[i][0] * kx * ring[j][1] * 110.57;
    }
    total += (outer ? 1 : -1) * Math.abs(s / 2);
  });
  return Math.round(total);
}

/* -------------------------------------------------------------------- main */

async function main() {
  await ensureSource();
  const src = (k) => path.join(SRC, FILES[k]);
  const tmp = (n) => path.join(TMP, n);

  console.log('[geo] simplifying layers with mapshaper…');
  mapshaper([src('states'), '-simplify', `interval=${INTERVAL}`, 'keep-shapes', '-filter-fields', 'STNAME,State_LGD',
    '-o', 'format=geojson', 'precision=0.001', tmp('states.json')]);
  mapshaper([src('states'), '-dissolve', '-simplify', `interval=${INTERVAL}`, 'keep-shapes',
    '-o', 'format=geojson', 'precision=0.001', tmp('outline.json')]);
  mapshaper(['-i', src('districts'), '-filter', '"state != null && state.indexOf(\'GUJARAT and\') < 0"',
    '-simplify', `interval=${INTERVAL}`, 'keep-shapes', '-filter-fields', 'state,district,dist_code',
    '-o', 'format=geojson', 'precision=0.001', tmp('districts.json')]);

  const read = (n) => JSON.parse(fs.readFileSync(tmp(n), 'utf8'));
  const states = read('states.json');
  const outline = read('outline.json');
  const districts = read('districts.json');

  const stateFeatures = states.features.map((f) => ({
    type: 'Feature',
    properties: { state: stateName(f.properties.STNAME), lgd: f.properties.State_LGD ?? null },
    geometry: f.geometry,
  }));
  // Dadra & Nagar Haveli and Daman & Diu were merged in 2020; the state layer
  // still carries them apart, so fold the two parts into one feature.
  const merged = new Map();
  for (const f of stateFeatures) {
    const prev = merged.get(f.properties.state);
    if (!prev) {
      merged.set(f.properties.state, f);
      continue;
    }
    const toMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
    prev.geometry = { type: 'MultiPolygon', coordinates: [...toMulti(prev.geometry), ...toMulti(f.geometry)] };
  }

  const districtFeatures = districts.features
    .filter((f) => f.geometry && f.properties.district)
    .map((f) => {
      const state = stateName(f.properties.state);
      const district = districtName(f.properties);
      return {
        type: 'Feature',
        properties: { state, district, key: `${state}|${district}`, code: f.properties.dist_code ?? null },
        geometry: f.geometry,
      };
    });

  // Duplicate names inside one state (split features) are merged into one district.
  const byKey = new Map();
  for (const f of districtFeatures) {
    const prev = byKey.get(f.properties.key);
    if (!prev) {
      byKey.set(f.properties.key, f);
      continue;
    }
    const toMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
    prev.geometry = { type: 'MultiPolygon', coordinates: [...toMulti(prev.geometry), ...toMulti(f.geometry)] };
  }

  /* Sub-district names, joined spatially: the sub-district layer uses Census
   * 2011 district names, which no longer match post-2011 districts, so each
   * sub-district is assigned to whichever current district contains its centroid. */
  console.log('[geo] joining sub-districts…');
  const sub = JSON.parse(fs.readFileSync(src('subDistricts'), 'utf8'));
  const index = Array.from(byKey.values()).map((f) => ({ f, bbox: bboxOf(f.geometry), subs: new Set() }));
  let joined = 0;
  for (const sf of sub.features) {
    if (!sf.geometry || !sf.properties.sdtname) continue;
    const [x, y] = centroidOf(sf.geometry);
    for (const d of index) {
      const b = d.bbox;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (pointInGeometry(x, y, d.f.geometry)) {
        d.subs.add(titleCase(repair(sf.properties.sdtname)));
        joined++;
        break;
      }
    }
  }

  const districtIndex = index.map((d) => ({
    state: d.f.properties.state,
    district: d.f.properties.district,
    key: d.f.properties.key,
    centroid: centroidOf(d.f.geometry),
    bbox: d.bbox,
    areaKm2: areaKm2(d.f.geometry),
    subDistricts: Array.from(d.subs).sort(),
  }));

  fs.mkdirSync(OUT, { recursive: true });
  const attribution = {
    source: 'INDIAN-SHAPEFILES (github.com/datta07/INDIAN-SHAPEFILES), MIT licence',
    depiction: 'National boundary as depicted by the Survey of India, including the whole of Jammu & Kashmir and Ladakh',
    processing: `Simplified with mapshaper (interval ${INTERVAL} m, precision 0.001°); names repaired; see scripts/build-geo.mjs`,
    note: 'Administrative boundaries for visualisation. Not for legal or cadastral use.',
  };
  const write = (name, obj) => {
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
    console.log(`[geo] ${name} ${(fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0)} KB`);
  };
  // A dissolve without fields comes back as a GeometryCollection.
  const outlineGeoms = outline.features ? outline.features.map((f) => f.geometry) : outline.geometries;
  write('india-outline.json', { type: 'FeatureCollection', attribution, features: outlineGeoms.map((geometry) => ({ type: 'Feature', properties: { name: 'India' }, geometry })) });
  write('india-states.json', { type: 'FeatureCollection', attribution, features: Array.from(merged.values()) });
  write('india-districts.json', { type: 'FeatureCollection', attribution, features: Array.from(byKey.values()) });
  write('districts-index.json', { attribution, districts: districtIndex });
  console.log(`[geo] ${merged.size} states/UTs · ${byKey.size} districts · ${joined} sub-districts joined`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
