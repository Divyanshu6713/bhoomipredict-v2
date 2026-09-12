/** Deterministic PRNG helpers shared by the generation scripts. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export const int = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;

export const float = (rng, min, max) => rng() * (max - min) + min;

export const chance = (rng, p) => rng() < p;

export const weighted = (rng, entries) => {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = rng() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
};

export const shuffle = (rng, arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Standard normal via Box-Muller (cached second draw). */
export function gaussFactory(rng) {
  let spare = null;
  return function gauss(mean = 0, sd = 1) {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return mean + sd * v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = rng() * 2 - 1;
      v = rng() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * mul;
    return mean + sd * u * mul;
  };
}

/** Exponential draw with the given mean. */
export const expo = (rng, mean) => -Math.log(1 - rng()) * mean;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/* ------------------------------------------------------------------ dates */

const MS_DAY = 86400000;

export const dayFromISO = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_DAY);

export const isoFromDay = (day) => new Date(day * MS_DAY).toISOString().slice(0, 10);

export const addDays = (iso, days) => isoFromDay(dayFromISO(iso) + days);
