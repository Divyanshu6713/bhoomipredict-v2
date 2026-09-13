/**
 * Administrative geography shared by the generator, the API and validation.
 *
 * District names, centroids and sub-district names come from the boundary
 * layers built by scripts/build-geo.mjs, so every district a project names is
 * one that the GIS layer can draw, and every coordinate the generator emits
 * falls inside the district polygon it claims.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GEO_DIR = path.resolve(__dirname, '..', '..', 'data', 'geo');

let indexCache = null;
let polygonCache = null;
let stateCache = null;

export function districtIndex() {
  if (!indexCache) {
    const raw = JSON.parse(fs.readFileSync(path.join(GEO_DIR, 'districts-index.json'), 'utf8'));
    indexCache = {
      attribution: raw.attribution,
      districts: raw.districts,
      byKey: new Map(raw.districts.map((d) => [d.key, d])),
      byState: raw.districts.reduce((m, d) => {
        if (!m.has(d.state)) m.set(d.state, []);
        m.get(d.state).push(d);
        return m;
      }, new Map()),
    };
  }
  return indexCache;
}

export function districtPolygons() {
  if (!polygonCache) {
    const raw = JSON.parse(fs.readFileSync(path.join(GEO_DIR, 'india-districts.json'), 'utf8'));
    polygonCache = new Map(raw.features.map((f) => [f.properties.key, f.geometry]));
  }
  return polygonCache;
}

export function statePolygons() {
  if (!stateCache) {
    const raw = JSON.parse(fs.readFileSync(path.join(GEO_DIR, 'india-states.json'), 'utf8'));
    stateCache = new Map(raw.features.map((f) => [f.properties.state, f.geometry]));
  }
  return stateCache;
}

/* ---------------------------------------------------------------- geometry */

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
  if (!geometry) return false;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    if (!pointInRing(x, y, poly[0])) continue;
    let hole = false;
    for (let r = 1; r < poly.length; r++) if (pointInRing(x, y, poly[r])) hole = true;
    if (!hole) return true;
  }
  return false;
}

/** Which state polygon contains a point, or null. */
export function stateAt(lat, lon) {
  for (const [state, geom] of statePolygons()) if (pointInGeometry(lon, lat, geom)) return state;
  return null;
}

/** True when the point lies inside the named district's polygon. */
export function inDistrict(key, lat, lon) {
  return pointInGeometry(lon, lat, districtPolygons().get(key));
}

/* ------------------------------------------------------- corpus geography */

/**
 * States carried by the synthetic corpus, with sampling weights. Districts are
 * named explicitly where a state has well-known acquisition corridors; the
 * remainder of each state's list is filled from the boundary index.
 */
export const CORPUS_STATES = [
  { state: 'Uttar Pradesh', zone: 'North', weight: 14, prefer: ['Gautam Buddha Nagar', 'Bulandshahr', 'Aligarh', 'Kanpur Nagar', 'Kanpur Dehat', 'Jhansi', 'Varanasi', 'Meerut', 'Hapur', 'Etawah', 'Prayagraj', 'Ayodhya', 'Bareilly', 'Gorakhpur', 'Lucknow', 'Agra'] },
  { state: 'Maharashtra', zone: 'West', weight: 13, prefer: ['Palghar', 'Thane', 'Nashik', 'Ahmednagar', 'Pune', 'Raigarh', 'Jalgaon', 'Chhatrapati Sambhajinagar', 'Satara', 'Solapur', 'Nagpur', 'Wardha'] },
  { state: 'Rajasthan', zone: 'North', weight: 12, prefer: ['Alwar', 'Jaipur', 'Dausa', 'Bharatpur', 'Sawai Madhopur', 'Kota', 'Bhilwara', 'Ajmer', 'Sikar', 'Jhunjhunu', 'Udaipur', 'Nagaur'] },
  { state: 'Karnataka', zone: 'South', weight: 12, prefer: ['Ramanagara', 'Mandya', 'Mysuru', 'Tumakuru', 'Bengaluru Rural', 'Chitradurga', 'Davanagere', 'Hassan', 'Belagavi', 'Kalaburagi', 'Ballari', 'Vijayapura', 'Bagalkote', 'Shivamogga'] },
  { state: 'Gujarat', zone: 'West', weight: 10, prefer: ['Valsad', 'Navsari', 'Surat', 'Bharuch', 'Vadodara', 'Anand', 'Kheda', 'Ahmadabad', 'Rajkot', 'Mahesana', 'Banas Kantha'] },
  { state: 'Madhya Pradesh', zone: 'Central', weight: 10, prefer: ['Ratlam', 'Mandsaur', 'Ujjain', 'Dewas', 'Sehore', 'Guna', 'Shivpuri', 'Bhopal', 'Jabalpur', 'Sagar', 'Gwalior', 'Khargone'] },
  { state: 'Tamil Nadu', zone: 'South', weight: 9, prefer: ['Kanchipuram', 'Chengalpattu', 'Tiruvannamalai', 'Vellore', 'Salem', 'Erode', 'Tiruppur', 'Madurai', 'Thanjavur', 'Cuddalore', 'Dindigul'] },
  { state: 'Telangana', zone: 'South', weight: 8, prefer: ['Ranga Reddy', 'Medak', 'Nalgonda', 'Warangal', 'Karimnagar', 'Siddipet', 'Sangareddy', 'Khammam', 'Mahabubnagar'] },
  { state: 'Andhra Pradesh', zone: 'South', weight: 7, prefer: ['Ananthapuramu', 'Kurnool', 'Guntur', 'Krishna', 'Chittoor', 'Sri Potti Sriramulu Nellore', 'Prakasam', 'East Godavari', 'West Godavari'] },
  { state: 'Haryana', zone: 'North', weight: 6, prefer: ['Gurugram', 'Faridabad', 'Palwal', 'Rewari', 'Sonipat', 'Karnal', 'Hisar', 'Ambala', 'Jhajjar'] },
  { state: 'Punjab', zone: 'North', weight: 5, prefer: ['Ludhiana', 'Patiala', 'Jalandhar', 'Bathinda', 'Sangrur', 'Amritsar', 'Rupnagar', 'Moga'] },
  { state: 'Bihar', zone: 'East', weight: 5, prefer: ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur', 'Nalanda', 'Rohtas', 'Saran', 'Purnia'] },
  { state: 'West Bengal', zone: 'East', weight: 5, prefer: ['Hugli', 'Nadia', 'Purba Barddhaman', 'Haora', 'Murshidabad', 'Bankura', 'Paschim Medinipur', 'Maldah'] },
  { state: 'Odisha', zone: 'East', weight: 4, prefer: ['Khordha', 'Cuttack', 'Jajapur', 'Anugul', 'Sambalpur', 'Puri', 'Dhenkanal', 'Keonjhar (Kendujhar)'] },
  { state: 'Chhattisgarh', zone: 'Central', weight: 4, prefer: ['Raipur', 'Durg', 'Bilaspur', 'Raigarh', 'Korba', 'Janjgir-Champa', 'Rajnandgaon'] },
  { state: 'Jharkhand', zone: 'East', weight: 3, prefer: ['Ranchi', 'Dhanbad', 'Bokaro', 'Hazaribagh', 'East Singhbhum', 'Ramgarh', 'Giridih'] },
  { state: 'Kerala', zone: 'South', weight: 3, prefer: ['Ernakulam', 'Thrissur', 'Palakkad', 'Kozhikode', 'Kollam', 'Alappuzha', 'Malappuram'] },
  { state: 'Assam', zone: 'North East', weight: 3, prefer: ['Kamrup Rural', 'Nagaon', 'Sonitpur', 'Dibrugarh', 'Barpeta', 'Jorhat', 'Cachar'] },
  { state: 'Uttarakhand', zone: 'North', weight: 2, prefer: ['Dehradun', 'Haridwar', 'Udham Singh Nagar', 'Nainital', 'Pauri Garhwal'] },
  { state: 'Himachal Pradesh', zone: 'North', weight: 2, prefer: ['Solan', 'Shimla', 'Kangra', 'Una', 'Mandi'] },
  { state: 'Delhi', zone: 'North', weight: 2, prefer: ['South West', 'North West', 'North', 'West', 'South'] },
  { state: 'Jammu & Kashmir', zone: 'North', weight: 1, prefer: ['Jammu', 'Kathua', 'Samba', 'Udhampur', 'Anantnag'] },
  { state: 'Goa', zone: 'West', weight: 1, prefer: ['North Goa', 'South Goa'] },
  { state: 'Tripura', zone: 'North East', weight: 1, prefer: ['West Tripura', 'Gomti', 'Sepahijala'] },
  { state: 'Meghalaya', zone: 'North East', weight: 1, prefer: ['East Khasi Hills', 'Ri Bhoi', 'West Garo Hills'] },
];

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Resolve a preferred district name against the boundary index, tolerating
 * spelling variants ("Ahmednagar" / "Ahmadnagar"). Unknown names are dropped
 * rather than invented.
 */
export function resolveDistrict(state, name) {
  const list = districtIndex().byState.get(state) ?? [];
  const n = norm(name);
  return (
    list.find((d) => norm(d.district) === n) ??
    list.find((d) => norm(d.district).startsWith(n.slice(0, 6)) && Math.abs(norm(d.district).length - n.length) <= 3) ??
    null
  );
}

/** Districts the corpus may use for a state: preferred names first, then the rest of the state. */
export function corpusDistricts(state, max = 14) {
  const cfg = CORPUS_STATES.find((s) => s.state === state);
  const all = districtIndex().byState.get(state) ?? [];
  const chosen = [];
  const seen = new Set();
  for (const name of cfg?.prefer ?? []) {
    const d = resolveDistrict(state, name);
    if (d && !seen.has(d.key)) {
      chosen.push(d);
      seen.add(d.key);
    }
  }
  for (const d of all) {
    if (chosen.length >= max) break;
    if (!seen.has(d.key) && d.subDistricts.length) {
      chosen.push(d);
      seen.add(d.key);
    }
  }
  return chosen.slice(0, Math.max(max, chosen.length));
}

/** State-level centroid from its districts (area weighted). */
export function stateCentroid(state) {
  const list = districtIndex().byState.get(state) ?? [];
  let a = 0;
  let x = 0;
  let y = 0;
  for (const d of list) {
    a += d.areaKm2;
    x += d.centroid[0] * d.areaKm2;
    y += d.centroid[1] * d.areaKm2;
  }
  return a ? [x / a, y / a] : null;
}

export const ALL_STATES = () => Array.from(districtIndex().byState.keys()).sort();
