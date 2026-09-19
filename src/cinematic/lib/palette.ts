/** One palette for the 3D world and the DOM. Risk colours only ever mean risk. */
export const C = {
  bg: '#05070a',
  ink: '#0b0f14',
  parcel: '#1a222b',
  parcelRow: '#223039',
  mist: '#e3eaee',
  gis: '#72b8c8',
  gisDim: '#3a7d8e',
  low: '#5f9b86',
  med: '#e1a43c',
  high: '#e0612f',
  crit: '#d8443a',
  ok: '#5aa37f',
  legal: '#b35a78',
  water: '#1d4656',
};

export const BAND_COLOR = { low: C.low, medium: C.med, high: C.high } as const;

/** Lifecycle ramp (cool, sequential) for 12 stages + complete. */
export const STAGE_RAMP = [
  '#2b3b4c',
  '#2f4658',
  '#325265',
  '#355e71',
  '#386a7c',
  '#3b7686',
  '#3f838f',
  '#468f97',
  '#b35a78',
  '#6b8fa8',
  '#7fa8b4',
  '#9cc3c9',
  '#5aa37f',
];

export const LANDUSE_COLOR: Record<string, string> = {
  Agricultural: '#4d5b3a',
  Residential: '#6a5f55',
  Orchard: '#3f6147',
  'Forest fringe': '#2c4a3a',
  Government: '#465a72',
  Riverine: '#2c5361',
};

export const VILLAGE_COLOR = ['#72b8c8', '#9aa7d8', '#c8a878', '#86c2a0', '#c890a8', '#a8c878'];

export function riskColor(p: number) {
  return p >= 0.55 ? C.high : p >= 0.3 ? C.med : C.low;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Signed log-odds contribution; tiny values print as a neutral 0.00. */
export const fmtC = (c: number) => (Math.abs(c) < 0.005 ? '0.00' : `${c > 0 ? '+' : '−'}${Math.abs(c).toFixed(2)}`);
