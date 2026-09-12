/**
 * Geographic and administrative reference data for the synthetic corpus.
 *
 * State centroids are approximate geographic centres; district entries carry a
 * small deterministic offset from their state centroid so parcels cluster
 * plausibly inside a state without implying survey-grade positioning. Nothing
 * here is derived from an official acquisition record — see the prototype data
 * notice in README.md.
 */

/** code, name, zone, approximate centroid, spread (degrees) used for jitter. */
export const STATES = [
  { code: 'RJ', name: 'Rajasthan', zone: 'North', lat: 26.9, lon: 74.2, spread: 2.6, weight: 12 },
  { code: 'UP', name: 'Uttar Pradesh', zone: 'North', lat: 26.85, lon: 80.6, spread: 2.4, weight: 14 },
  { code: 'MH', name: 'Maharashtra', zone: 'West', lat: 19.4, lon: 75.6, spread: 2.4, weight: 13 },
  { code: 'KA', name: 'Karnataka', zone: 'South', lat: 14.7, lon: 76.1, spread: 2.2, weight: 11 },
  { code: 'GJ', name: 'Gujarat', zone: 'West', lat: 22.5, lon: 71.8, spread: 2.1, weight: 10 },
  { code: 'MP', name: 'Madhya Pradesh', zone: 'Central', lat: 23.4, lon: 78.2, spread: 2.6, weight: 10 },
  { code: 'TN', name: 'Tamil Nadu', zone: 'South', lat: 11.2, lon: 78.4, spread: 2.0, weight: 9 },
  { code: 'TG', name: 'Telangana', zone: 'South', lat: 17.9, lon: 79.1, spread: 1.6, weight: 8 },
  { code: 'AP', name: 'Andhra Pradesh', zone: 'South', lat: 15.6, lon: 79.6, spread: 2.1, weight: 7 },
  { code: 'HR', name: 'Haryana', zone: 'North', lat: 29.2, lon: 76.3, spread: 1.2, weight: 6 },
  { code: 'PB', name: 'Punjab', zone: 'North', lat: 30.85, lon: 75.4, spread: 1.1, weight: 5 },
  { code: 'BR', name: 'Bihar', zone: 'East', lat: 25.6, lon: 85.5, spread: 1.5, weight: 5 },
  { code: 'WB', name: 'West Bengal', zone: 'East', lat: 23.4, lon: 87.8, spread: 1.8, weight: 5 },
  { code: 'OD', name: 'Odisha', zone: 'East', lat: 20.6, lon: 84.6, spread: 1.9, weight: 4 },
  { code: 'CG', name: 'Chhattisgarh', zone: 'Central', lat: 21.6, lon: 82.0, spread: 1.9, weight: 4 },
  { code: 'JH', name: 'Jharkhand', zone: 'East', lat: 23.6, lon: 85.4, spread: 1.4, weight: 3 },
  { code: 'KL', name: 'Kerala', zone: 'South', lat: 10.3, lon: 76.4, spread: 1.6, weight: 3 },
  { code: 'AS', name: 'Assam', zone: 'North East', lat: 26.3, lon: 92.6, spread: 1.7, weight: 3 },
  { code: 'UK', name: 'Uttarakhand', zone: 'North', lat: 30.1, lon: 79.0, spread: 1.2, weight: 2 },
  { code: 'HP', name: 'Himachal Pradesh', zone: 'North', lat: 31.8, lon: 77.2, spread: 1.2, weight: 2 },
  { code: 'DL', name: 'Delhi NCR', zone: 'North', lat: 28.62, lon: 77.1, spread: 0.4, weight: 3 },
  { code: 'GA', name: 'Goa', zone: 'West', lat: 15.35, lon: 74.05, spread: 0.35, weight: 1 },
  { code: 'TR', name: 'Tripura', zone: 'North East', lat: 23.8, lon: 91.6, spread: 0.6, weight: 1 },
  { code: 'ML', name: 'Meghalaya', zone: 'North East', lat: 25.55, lon: 91.3, spread: 0.8, weight: 1 },
];

export const STATE_BY_NAME = new Map(STATES.map((s) => [s.name, s]));

/** Revenue districts used for case generation, keyed by state name. */
export const DISTRICTS = {
  Rajasthan: ['Alwar', 'Jaipur', 'Dausa', 'Bharatpur', 'Sawai Madhopur', 'Kota', 'Bhilwara', 'Ajmer', 'Sikar', 'Jhunjhunu', 'Udaipur', 'Nagaur'],
  'Uttar Pradesh': ['Gautam Buddh Nagar', 'Bulandshahr', 'Aligarh', 'Kanpur Dehat', 'Jhansi', 'Varanasi', 'Meerut', 'Hapur', 'Etawah', 'Prayagraj', 'Ayodhya', 'Bareilly', 'Gorakhpur'],
  Maharashtra: ['Palghar', 'Thane', 'Nashik', 'Ahmednagar', 'Pune', 'Raigad', 'Jalgaon', 'Aurangabad', 'Satara', 'Solapur', 'Nagpur', 'Wardha'],
  Karnataka: ['Ramanagara', 'Mandya', 'Mysuru', 'Tumakuru', 'Bengaluru Rural', 'Chitradurga', 'Davanagere', 'Hassan', 'Belagavi', 'Kalaburagi', 'Ballari'],
  Gujarat: ['Valsad', 'Navsari', 'Surat', 'Bharuch', 'Vadodara', 'Anand', 'Kheda', 'Ahmedabad', 'Rajkot', 'Mehsana', 'Banaskantha'],
  'Madhya Pradesh': ['Ratlam', 'Mandsaur', 'Ujjain', 'Dewas', 'Sehore', 'Guna', 'Shivpuri', 'Bhopal', 'Jabalpur', 'Sagar', 'Gwalior', 'Khargone'],
  'Tamil Nadu': ['Kancheepuram', 'Tiruvallur', 'Vellore', 'Salem', 'Erode', 'Tiruppur', 'Madurai', 'Thanjavur', 'Cuddalore', 'Dindigul'],
  Telangana: ['Rangareddy', 'Medak', 'Nalgonda', 'Warangal', 'Karimnagar', 'Siddipet', 'Sangareddy', 'Khammam', 'Mahabubnagar'],
  'Andhra Pradesh': ['Anantapur', 'Kurnool', 'Guntur', 'Krishna', 'Chittoor', 'Nellore', 'Prakasam', 'East Godavari', 'West Godavari'],
  Haryana: ['Gurugram', 'Faridabad', 'Palwal', 'Rewari', 'Sonipat', 'Karnal', 'Hisar', 'Ambala', 'Jhajjar'],
  Punjab: ['Ludhiana', 'Patiala', 'Jalandhar', 'Bathinda', 'Sangrur', 'Amritsar', 'Rupnagar', 'Moga'],
  Bihar: ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur', 'Nalanda', 'Rohtas', 'Saran', 'Purnia'],
  'West Bengal': ['Hooghly', 'Nadia', 'Purba Bardhaman', 'Howrah', 'Murshidabad', 'Bankura', 'Paschim Medinipur', 'Malda'],
  Odisha: ['Khordha', 'Cuttack', 'Jajpur', 'Angul', 'Sambalpur', 'Puri', 'Dhenkanal', 'Keonjhar'],
  Chhattisgarh: ['Raipur', 'Durg', 'Bilaspur', 'Raigarh', 'Korba', 'Janjgir-Champa', 'Rajnandgaon'],
  Jharkhand: ['Ranchi', 'Dhanbad', 'Bokaro', 'Hazaribagh', 'East Singhbhum', 'Ramgarh', 'Giridih'],
  Kerala: ['Ernakulam', 'Thrissur', 'Palakkad', 'Kozhikode', 'Kollam', 'Alappuzha', 'Malappuram'],
  Assam: ['Kamrup', 'Nagaon', 'Sonitpur', 'Dibrugarh', 'Barpeta', 'Jorhat', 'Cachar'],
  Uttarakhand: ['Dehradun', 'Haridwar', 'Udham Singh Nagar', 'Nainital', 'Pauri Garhwal'],
  'Himachal Pradesh': ['Solan', 'Shimla', 'Kangra', 'Una', 'Mandi'],
  'Delhi NCR': ['South West Delhi', 'North Delhi', 'Dwarka', 'Najafgarh', 'Narela'],
  Goa: ['North Goa', 'South Goa'],
  Tripura: ['West Tripura', 'Gomati', 'Sepahijala'],
  Meghalaya: ['East Khasi Hills', 'Ri Bhoi', 'West Garo Hills'],
};

/** Tehsil / taluka qualifiers combined with a district name. */
export const TEHSIL_SUFFIX = ['Sadar', 'North', 'South', 'East', 'West', 'Rural', 'Kasba', 'Ghat', 'Tanda', 'Bazar'];

export const VILLAGE_PREFIX = [
  'Rampur', 'Nandgaon', 'Kesarpura', 'Bhojpur', 'Chandanpur', 'Devgarh', 'Sultanpur',
  'Hirapur', 'Basantpur', 'Mahadevpura', 'Kothari', 'Gopalpura', 'Narsingpur', 'Anandpur',
  'Shivpura', 'Kalyanpur', 'Jamalpur', 'Sonpur', 'Tilakpur', 'Madhavpur', 'Barkheda',
  'Lakhanpur', 'Sitapur', 'Gangapur', 'Amarpur', 'Veerapura', 'Doddanahalli', 'Halepura',
  'Ratanpur', 'Mohanpura', 'Jalalpur', 'Karanpur', 'Bhagwanpura', 'Nayagaon', 'Salempur',
  'Chikkanahalli', 'Thimmapura', 'Pimpalgaon', 'Wadgaon', 'Shirsgaon', 'Kolhapura', 'Bhagatpur',
];

export const VILLAGE_SUFFIX = ['Khurd', 'Kalan', 'Buzurg', '', '', '', 'Tanda', 'Bazar', 'Pahadi', ''];

export const PROJECT_TYPES = [
  'Expressway',
  'National Highway',
  'Railway Corridor',
  'Metro Rail',
  'Industrial Corridor',
  'Irrigation',
  'Power Transmission',
  'Airport',
];

export const AUTHORITIES = {
  Expressway: ['NHAI', 'State Road Development Corporation'],
  'National Highway': ['NHAI', 'MoRTH — Regional Office', 'State PWD (NH Wing)'],
  'Railway Corridor': ['Ministry of Railways', 'DFCCIL', 'NHSRCL'],
  'Metro Rail': ['Metro Rail Corporation', 'Urban Development Authority'],
  'Industrial Corridor': ['NICDC', 'State Industrial Development Corporation'],
  Irrigation: ['State Water Resources Department', 'Command Area Development Authority'],
  'Power Transmission': ['POWERGRID', 'State Transmission Utility'],
  Airport: ['Airports Authority of India', 'State Civil Aviation Department'],
};

/** Anchor corridors — the recognisable names a reviewer looks for first. */
export const ANCHOR_PROJECTS = [
  { name: 'Delhi-Mumbai Expressway - Package 7', state: 'Rajasthan', type: 'Expressway' },
  { name: 'Bengaluru-Mysuru Infrastructure Corridor', state: 'Karnataka', type: 'Expressway' },
  { name: 'Mumbai-Ahmedabad Rail Corridor', state: 'Gujarat', type: 'Railway Corridor' },
  { name: 'NH-48 Six-Laning - Vadodara Section', state: 'Gujarat', type: 'National Highway' },
  { name: 'Delhi-Mumbai Industrial Corridor - Node 4', state: 'Madhya Pradesh', type: 'Industrial Corridor' },
  { name: 'Ludhiana-Bathinda Railway Doubling Project', state: 'Punjab', type: 'Railway Corridor' },
  { name: 'Chennai Peripheral Ring Road - Phase II', state: 'Tamil Nadu', type: 'Expressway' },
  { name: 'Hyderabad Regional Ring Road - North Arc', state: 'Telangana', type: 'Expressway' },
  { name: 'Ganga Expressway - Meerut to Prayagraj Section', state: 'Uttar Pradesh', type: 'Expressway' },
  { name: 'Mumbai-Nagpur Link - Eastern Extension', state: 'Maharashtra', type: 'Expressway' },
  { name: 'Navi Mumbai Airport Influence Notified Area', state: 'Maharashtra', type: 'Airport' },
  { name: 'Bhopal Metro - Orange Line Extension', state: 'Madhya Pradesh', type: 'Metro Rail' },
  { name: 'Jaipur Ring Road Widening - Sector C', state: 'Rajasthan', type: 'National Highway' },
  { name: 'Bengaluru Suburban Rail - Corridor 2', state: 'Karnataka', type: 'Railway Corridor' },
  { name: 'Narmada Canal Command Expansion', state: 'Gujarat', type: 'Irrigation' },
  { name: 'Eastern Freight Corridor - Link 9', state: 'Uttar Pradesh', type: 'Railway Corridor' },
  { name: '765kV Transmission Line - Western Grid', state: 'Maharashtra', type: 'Power Transmission' },
  { name: 'Chitradurga-Davangere Industrial Park', state: 'Karnataka', type: 'Industrial Corridor' },
  { name: 'Left Main Canal Modernisation - Reach 3', state: 'Andhra Pradesh', type: 'Irrigation' },
  { name: 'Kanpur Metro - Phase 2 Alignment', state: 'Uttar Pradesh', type: 'Metro Rail' },
];

export const GENERIC_TEMPLATES = {
  Expressway: ['{d} Expressway - Package {n}{s}', 'Access-Controlled Expressway - {d} Reach'],
  'National Highway': [
    'NH-{h} Four-Laning - {d} Section',
    'NH-{h} Bypass Development - {d}',
    'NH-{h} Widening - Package {n}{s}',
  ],
  'Railway Corridor': ['{d} Railway Doubling Project', '{d} Rail Electrification & Doubling', 'Freight Corridor Link - {d}'],
  'Metro Rail': ['{d} Metro - Depot & Alignment Land', '{d} Metro Phase {n} Corridor'],
  'Industrial Corridor': ['{d} Industrial Corridor Development', '{d} Integrated Manufacturing Cluster'],
  Irrigation: ['{d} Lift Irrigation Scheme', '{d} Canal Network Expansion', '{d} Reservoir Submergence Area'],
  'Power Transmission': ['{d} Transmission Corridor - 400kV', 'Substation & Line Corridor - {d}'],
  Airport: ['{d} Greenfield Airport - Phase {n}', '{d} Airport Expansion Land Pool'],
};

/** Statutory acquisition lifecycle (RFCTLARR-shaped, nine stages). */
export const LIFECYCLE_STAGES = [
  'Land Identification',
  'Survey & Verification',
  'Notification',
  'Objection / Claims',
  'Valuation',
  'Compensation',
  'Possession',
  'Rehabilitation & Resettlement',
  'Closure',
];

/** Nominal duration of each stage in days, and its historical slip propensity. */
export const STAGE_PROFILE = {
  'Land Identification': { days: 45, slip: 0.1 },
  'Survey & Verification': { days: 75, slip: 0.22 },
  Notification: { days: 60, slip: 0.15 },
  'Objection / Claims': { days: 90, slip: 0.38 },
  Valuation: { days: 70, slip: 0.27 },
  Compensation: { days: 110, slip: 0.44 },
  Possession: { days: 80, slip: 0.31 },
  'Rehabilitation & Resettlement': { days: 120, slip: 0.35 },
  Closure: { days: 35, slip: 0.08 },
};

/** Milestone inside each stage that the next deadline refers to. */
export const STAGE_MILESTONE = {
  'Land Identification': 'Alignment freeze & preliminary land schedule',
  'Survey & Verification': 'Joint measurement and revenue record reconciliation',
  Notification: 'Section 11 preliminary notification publication',
  'Objection / Claims': 'Disposal of objections under Section 15',
  Valuation: 'Market value determination and award computation',
  Compensation: 'Award declaration and compensation disbursement',
  Possession: 'Possession memo and physical handover to PIU',
  'Rehabilitation & Resettlement': 'R&R entitlement delivery and site readiness',
  Closure: 'Mutation, records update and case closure',
};

export const LAND_TYPES = [
  'Irrigated Agricultural',
  'Dry Agricultural',
  'Barren',
  'Residential',
  'Commercial',
  'Orchard/Plantation',
  'Grazing/Common',
];

export const OWNERSHIP_LEVELS = ['Single', 'Joint', 'Fragmented', 'Disputed'];
export const COMPENSATION_STATUSES = ['Not Initiated', 'Assessed', 'Awarded', 'Partially Paid', 'Paid'];
export const COMPENSATION_BANDS = ['Under 5L', '5-15L', '15-40L', '40L-1Cr', 'Above 1Cr'];
export const DISPUTE_COMPLEXITY = ['None', 'Low', 'Moderate', 'High'];
export const RESPONSIVENESS = ['Low', 'Moderate', 'High'];
export const VERIFICATION_STATUSES = ['Pending', 'In Progress', 'Verified'];
export const APPROVAL_STATUSES = ['Not Submitted', 'Submitted', 'Under Review', 'Approved'];
export const POSSESSION_STATUSES = ['Not Initiated', 'Notice Issued', 'Partial', 'Complete'];
export const RR_STATUSES = ['Not Applicable', 'Not Started', 'In Progress', 'Complete'];
export const PRIORITIES = ['Routine', 'Important', 'Critical'];
export const RISK_BANDS = ['Low', 'Medium', 'High', 'Critical'];
export const CASE_STATUSES = ['Active', 'On Hold', 'Completed'];
