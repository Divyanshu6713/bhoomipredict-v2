/**
 * National administrative reference: every State and Union Territory of India.
 *
 * `name` is the key used across the platform and matches the boundary layers
 * in data/geo; `officialName` is the constitutional / official name where it
 * differs. `zonalCouncil` follows the Zonal Councils constituted under the
 * States Reorganisation Act, 1956 (with the North Eastern Council for the
 * north-eastern states); island territories sit outside the councils.
 *
 * `lgdCode` is intentionally null: Local Government Directory codes are filled
 * when the LGD integration is connected (see server/integration), rather than
 * typed in by hand.
 */

export const STATE_TYPES = { STATE: 'State', UT: 'Union Territory' };

export const ZONES = ['Northern', 'Central', 'Eastern', 'Western', 'Southern', 'North Eastern', 'Island Territories'];

const S = (name, code, zonalCouncil, extra = {}) => ({ name, code, type: STATE_TYPES.STATE, zonalCouncil, officialName: name, lgdCode: null, ...extra });
const U = (name, code, zonalCouncil, extra = {}) => ({ name, code, type: STATE_TYPES.UT, zonalCouncil, officialName: name, lgdCode: null, ...extra });

export const STATES_AND_UTS = [
  S('Andhra Pradesh', 'AP', 'Southern'),
  S('Arunachal Pradesh', 'AR', 'North Eastern'),
  S('Assam', 'AS', 'North Eastern'),
  S('Bihar', 'BR', 'Eastern'),
  S('Chhattisgarh', 'CG', 'Central'),
  S('Goa', 'GA', 'Western'),
  S('Gujarat', 'GJ', 'Western'),
  S('Haryana', 'HR', 'Northern'),
  S('Himachal Pradesh', 'HP', 'Northern'),
  S('Jharkhand', 'JH', 'Eastern'),
  S('Karnataka', 'KA', 'Southern'),
  S('Kerala', 'KL', 'Southern'),
  S('Madhya Pradesh', 'MP', 'Central'),
  S('Maharashtra', 'MH', 'Western'),
  S('Manipur', 'MN', 'North Eastern'),
  S('Meghalaya', 'ML', 'North Eastern'),
  S('Mizoram', 'MZ', 'North Eastern'),
  S('Nagaland', 'NL', 'North Eastern'),
  S('Odisha', 'OD', 'Eastern'),
  S('Punjab', 'PB', 'Northern'),
  S('Rajasthan', 'RJ', 'Northern'),
  S('Sikkim', 'SK', 'North Eastern'),
  S('Tamil Nadu', 'TN', 'Southern'),
  S('Telangana', 'TG', 'Southern'),
  S('Tripura', 'TR', 'North Eastern'),
  S('Uttar Pradesh', 'UP', 'Central'),
  S('Uttarakhand', 'UK', 'Central'),
  S('West Bengal', 'WB', 'Eastern'),
  U('Andaman & Nicobar Islands', 'AN', 'Island Territories', { officialName: 'Andaman and Nicobar Islands' }),
  U('Chandigarh', 'CH', 'Northern'),
  U('Dadra & Nagar Haveli and Daman & Diu', 'DH', 'Western', { officialName: 'Dadra and Nagar Haveli and Daman and Diu' }),
  U('Delhi', 'DL', 'Northern', { officialName: 'National Capital Territory of Delhi', government: 'Government of NCT of Delhi' }),
  U('Jammu & Kashmir', 'JK', 'Northern', { officialName: 'Jammu and Kashmir', government: 'Government of Jammu & Kashmir' }),
  U('Ladakh', 'LA', 'Northern'),
  U('Lakshadweep', 'LD', 'Island Territories'),
  U('Puducherry', 'PY', 'Southern', { government: 'Government of Puducherry' }),
];

export const STATE_BY_NAME = new Map(STATES_AND_UTS.map((s) => [s.name, s]));
export const STATE_BY_CODE = new Map(STATES_AND_UTS.map((s) => [s.code, s]));

export const stateInfo = (name) => STATE_BY_NAME.get(name) ?? null;
export const stateCode = (name) => STATE_BY_NAME.get(name)?.code ?? null;

/** Name of the government (or administration) of a State / UT. */
export function stateGovernmentName(name) {
  const s = stateInfo(name);
  if (!s) return `Government of ${name}`;
  if (s.government) return s.government;
  return s.type === STATE_TYPES.STATE ? `Government of ${s.name}` : `Administration of ${s.officialName}`;
}

/** The five regional power grids of the national grid. Island territories are not grid-connected. */
export const GRID_REGIONS = {
  'Northern Region': ['Jammu & Kashmir', 'Ladakh', 'Himachal Pradesh', 'Punjab', 'Chandigarh', 'Haryana', 'Delhi', 'Rajasthan', 'Uttar Pradesh', 'Uttarakhand'],
  'Western Region': ['Gujarat', 'Madhya Pradesh', 'Chhattisgarh', 'Maharashtra', 'Goa', 'Dadra & Nagar Haveli and Daman & Diu'],
  'Southern Region': ['Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Puducherry'],
  'Eastern Region': ['Bihar', 'Jharkhand', 'Odisha', 'West Bengal', 'Sikkim'],
  'North Eastern Region': ['Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Tripura'],
};

/**
 * Revenue divisions, configured where the platform demonstrates a
 * State → Division → District structure. States without an entry skip the
 * division level; nothing is inferred for them.
 */
export const REVENUE_DIVISIONS = {
  Karnataka: {
    'Bengaluru Division': ['Bengaluru Urban', 'Bengaluru Rural', 'Ramanagara', 'Chikkaballapura', 'Kolar', 'Tumakuru', 'Chitradurga', 'Davanagere', 'Shivamogga'],
    'Mysuru Division': ['Mysuru', 'Mandya', 'Hassan', 'Chamarajanagar', 'Kodagu', 'Chikkamagaluru', 'Dakshina Kannada', 'Udupi'],
    'Belagavi Division': ['Belagavi', 'Bagalkote', 'Vijayapura', 'Dharwad', 'Gadag', 'Haveri', 'Uttara Kannada'],
    'Kalaburagi Division': ['Kalaburagi', 'Bidar', 'Yadgir', 'Raichur', 'Koppal', 'Ballari', 'Vijayanagara'],
  },
  Maharashtra: {
    'Konkan Division': ['Mumbai', 'Mumbai Suburban', 'Thane', 'Palghar', 'Raigarh', 'Ratnagiri', 'Sindhudurg'],
    'Pune Division': ['Pune', 'Satara', 'Sangli', 'Kolhapur', 'Solapur'],
    'Nashik Division': ['Nashik', 'Dhule', 'Nandurbar', 'Jalgaon', 'Ahmednagar'],
    'Chhatrapati Sambhajinagar Division': ['Chhatrapati Sambhajinagar', 'Jalna', 'Beed', 'Dharashiv', 'Latur', 'Nanded', 'Parbhani', 'Hingoli'],
    'Amravati Division': ['Amravati', 'Akola', 'Washim', 'Buldhana', 'Yavatmal'],
    'Nagpur Division': ['Nagpur', 'Wardha', 'Bhandara', 'Gondia', 'Chandrapur', 'Gadchiroli'],
  },
};
