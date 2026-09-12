/**
 * Tile-cartogram layout for India. Each state occupies one cell on an 11x9 grid
 * positioned to approximate its real geography — readable at a glance and
 * guaranteed legible at any screen size, unlike a true choropleth outline.
 *
 * This is layout only; every figure drawn on it comes from the API.
 */
export interface StateTile {
  code: string;
  name: string;
  col: number;
  row: number;
  zone: 'North' | 'South' | 'East' | 'West' | 'Central' | 'North East';
}

export const STATE_TILES: StateTile[] = [
  { code: 'LA', name: 'Ladakh', col: 4, row: 0, zone: 'North' },
  { code: 'JK', name: 'Jammu & Kashmir', col: 3, row: 1, zone: 'North' },
  { code: 'HP', name: 'Himachal Pradesh', col: 4, row: 1, zone: 'North' },
  { code: 'PB', name: 'Punjab', col: 3, row: 2, zone: 'North' },
  { code: 'HR', name: 'Haryana', col: 4, row: 2, zone: 'North' },
  { code: 'UK', name: 'Uttarakhand', col: 5, row: 2, zone: 'North' },
  { code: 'SK', name: 'Sikkim', col: 7, row: 2, zone: 'North East' },
  { code: 'AR', name: 'Arunachal Pradesh', col: 9, row: 2, zone: 'North East' },
  { code: 'RJ', name: 'Rajasthan', col: 3, row: 3, zone: 'North' },
  { code: 'DL', name: 'Delhi NCR', col: 4, row: 3, zone: 'North' },
  { code: 'UP', name: 'Uttar Pradesh', col: 5, row: 3, zone: 'North' },
  { code: 'BR', name: 'Bihar', col: 6, row: 3, zone: 'East' },
  { code: 'AS', name: 'Assam', col: 8, row: 3, zone: 'North East' },
  { code: 'NL', name: 'Nagaland', col: 9, row: 3, zone: 'North East' },
  { code: 'GJ', name: 'Gujarat', col: 2, row: 4, zone: 'West' },
  { code: 'MP', name: 'Madhya Pradesh', col: 4, row: 4, zone: 'Central' },
  { code: 'CG', name: 'Chhattisgarh', col: 5, row: 4, zone: 'Central' },
  { code: 'JH', name: 'Jharkhand', col: 6, row: 4, zone: 'East' },
  { code: 'WB', name: 'West Bengal', col: 7, row: 4, zone: 'East' },
  { code: 'ML', name: 'Meghalaya', col: 8, row: 4, zone: 'North East' },
  { code: 'MN', name: 'Manipur', col: 9, row: 4, zone: 'North East' },
  { code: 'MH', name: 'Maharashtra', col: 3, row: 5, zone: 'West' },
  { code: 'OD', name: 'Odisha', col: 6, row: 5, zone: 'East' },
  { code: 'TR', name: 'Tripura', col: 8, row: 5, zone: 'North East' },
  { code: 'MZ', name: 'Mizoram', col: 9, row: 5, zone: 'North East' },
  { code: 'GA', name: 'Goa', col: 3, row: 6, zone: 'West' },
  { code: 'TG', name: 'Telangana', col: 5, row: 6, zone: 'South' },
  { code: 'AP', name: 'Andhra Pradesh', col: 6, row: 6, zone: 'South' },
  { code: 'KA', name: 'Karnataka', col: 4, row: 7, zone: 'South' },
  { code: 'PY', name: 'Puducherry', col: 6, row: 7, zone: 'South' },
  { code: 'KL', name: 'Kerala', col: 4, row: 8, zone: 'South' },
  { code: 'TN', name: 'Tamil Nadu', col: 5, row: 8, zone: 'South' },
  { code: 'AN', name: 'Andaman & Nicobar', col: 8, row: 8, zone: 'South' },
];

export const STATE_TILE_BY_NAME = new Map(STATE_TILES.map((s) => [s.name, s]));

export const ZONES = ['North', 'South', 'East', 'West', 'Central', 'North East'] as const;
