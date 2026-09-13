/**
 * Authority & dependency registry.
 *
 * One configuration source for every screen and script that needs to know
 * *who* is involved in an acquisition and *why*:
 *
 *   acquisition framework (statute)  →  which notifications, forums and gates apply
 *   project type + subtype           →  which acquiring / requiring bodies are eligible
 *   state                            →  which state departments and district designations apply
 *   district / sub-district          →  which named district offices own the file
 *   land category & project flags    →  which supporting departments are pulled in
 *
 * Nothing in the scoring, lifecycle, intervention or alert logic hardcodes a
 * department. They all call `buildDependencyNetwork` / `authorityOptions`.
 * Adding a state means adding a STATE_PROFILES entry (or relying on the
 * generic profile); adding a project type means adding a PROJECT_TYPES entry.
 *
 * Basis labels are deliberate:
 *   'statute'     the framework reference itself (Act and section)
 *   'configured'  a designation or agency assignment held in this registry for
 *                 the demonstration; real assignments follow the project's own
 *                 notification or government order and must be confirmed there
 *   'project'     the body is named by the project record itself
 */

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

export const REGISTRY_NOTE =
  'Configurable demonstration registry. Statutory references identify the framework; named offices and agency ' +
  'assignments are indicative and must be confirmed against the project notification or government order.';

/* ================================================================ frameworks */

const GENERIC_MILESTONES = {
  'Land Identification': 'Alignment / site freeze and preliminary land schedule',
  'Survey & Verification': 'Joint measurement survey and record-of-rights reconciliation',
  Notification: 'Publication of the acquisition notification',
  'Objection / Claims': 'Hearing and disposal of objections',
  Valuation: 'Market value determination',
  Compensation: 'Award and compensation disbursement',
  Possession: 'Possession and handover to the requiring body',
  'Rehabilitation & Resettlement': 'R&R entitlement delivery',
  Closure: 'Mutation, records update and case closure',
};

export const FRAMEWORKS = {
  RFCTLARR: {
    id: 'RFCTLARR',
    name: 'Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013',
    short: 'RFCTLARR Act, 2013',
    mode: 'ownership',
    siaRequired: true,
    disputeForum: 'Land Acquisition, Rehabilitation and Resettlement Authority (s.51)',
    milestones: {
      ...GENERIC_MILESTONES,
      'Land Identification': 'Requiring body proposal and preliminary land schedule',
      'Survey & Verification': 'Social Impact Assessment (s.4) and joint measurement',
      Notification: 'Preliminary notification (s.11)',
      'Objection / Claims': 'Hearing of objections (s.15)',
      Valuation: 'Declaration (s.19) and market value determination (ss.26–30)',
      Compensation: 'Award by the Collector (s.23) and disbursement',
      Possession: 'Taking possession after payment (s.38)',
      'Rehabilitation & Resettlement': 'R&R award and entitlement delivery (s.31)',
    },
  },
  NH_ACT: {
    id: 'NH_ACT',
    name: 'National Highways Act, 1956 (ss.3A–3J)',
    short: 'NH Act, 1956',
    mode: 'ownership',
    siaRequired: false,
    note: 'Compensation and R&R follow the First to Third Schedules of the RFCTLARR Act, 2013.',
    disputeForum: 'Arbitrator appointed by the Central Government (s.3G(5))',
    milestones: {
      ...GENERIC_MILESTONES,
      Notification: 'Notification of intention to acquire (s.3A)',
      'Objection / Claims': 'Hearing of objections by the competent authority (s.3C)',
      Valuation: 'Declaration of acquisition (s.3D) and determination of amount (s.3G)',
      Compensation: 'Deposit and payment of amount (s.3H)',
      Possession: 'Taking possession (s.3E)',
    },
  },
  RAILWAYS_ACT: {
    id: 'RAILWAYS_ACT',
    name: 'Railways Act, 1989 — Chapter IVA (special railway projects)',
    short: 'Railways Act, 1989 (Ch. IVA)',
    mode: 'ownership',
    siaRequired: false,
    note: 'Compensation and R&R follow the First to Third Schedules of the RFCTLARR Act, 2013.',
    disputeForum: 'Arbitrator appointed by the Central Government (s.20F)',
    milestones: {
      ...GENERIC_MILESTONES,
      Notification: 'Notification of intention to acquire (s.20A)',
      'Objection / Claims': 'Hearing of objections (s.20D)',
      Valuation: 'Declaration of acquisition (s.20E) and determination of amount (s.20F)',
      Compensation: 'Deposit and payment of amount (s.20H)',
      Possession: 'Taking possession (s.20I)',
    },
  },
  PMP_ACT: {
    id: 'PMP_ACT',
    name: 'Petroleum and Minerals Pipelines (Acquisition of Right of User in Land) Act, 1962',
    short: 'PMP Act, 1962',
    mode: 'right_of_user',
    siaRequired: false,
    note: 'Acquires a right of user; ownership stays with the landowner, who may continue cultivation above the pipeline.',
    disputeForum: 'District Judge (s.10)',
    milestones: {
      ...GENERIC_MILESTONES,
      Notification: 'Notification of intention to acquire right of user (s.3)',
      'Objection / Claims': 'Hearing of objections by the competent authority (s.5)',
      Valuation: 'Declaration of acquisition of right of user (s.6)',
      Compensation: 'Determination and payment of compensation (s.10)',
      Possession: 'Entry for laying the pipeline (s.7)',
      'Rehabilitation & Resettlement': 'Restoration of land and crop compensation',
      Closure: 'Right-of-user entries in records and case closure',
    },
  },
  ELECTRICITY_ROW: {
    id: 'ELECTRICITY_ROW',
    name: 'Electricity Act, 2003 (ss.67–68, 164) read with the Indian Telegraph Act, 1885 (ss.10–16)',
    short: 'Electricity Act RoW',
    mode: 'right_of_way',
    siaRequired: false,
    note: 'Line corridors proceed on right of way: land is not acquired; tower-base and corridor compensation is paid under state RoW guidelines.',
    disputeForum: 'District Judge (Telegraph Act s.16)',
    milestones: {
      ...GENERIC_MILESTONES,
      Notification: 'Route approval and s.164 authorisation',
      'Objection / Claims': 'Objections and District Magistrate orders on right of way',
      Valuation: 'Tower-base and corridor compensation assessment',
      Compensation: 'Right-of-way compensation disbursement',
      Possession: 'Access for tower foundations and stringing',
      'Rehabilitation & Resettlement': 'Crop and tree damage settlement',
      Closure: 'Corridor records update and case closure',
    },
  },
  KIAD_ACT: {
    id: 'KIAD_ACT',
    name: 'Karnataka Industrial Areas Development Act, 1966 (Chapter VII)',
    short: 'KIAD Act, 1966',
    mode: 'ownership',
    siaRequired: false,
    disputeForum: 'Civil court reference on compensation (s.30 read with the central Act)',
    milestones: {
      ...GENERIC_MILESTONES,
      Notification: 'Preliminary notification (s.28(1))',
      'Objection / Claims': 'Hearing of objections (s.28(3))',
      Valuation: 'Final notification (s.28(4)) and price determination',
      Compensation: 'Consent award / award and disbursement (s.29)',
      Possession: 'Taking possession (s.28(6))',
    },
  },
  MID_ACT: {
    id: 'MID_ACT',
    name: 'Maharashtra Industrial Development Act, 1961 (Chapter VI)',
    short: 'MID Act, 1961',
    mode: 'ownership',
    siaRequired: false,
    disputeForum: 'Reference to the Collector / civil court on compensation (s.34)',
    milestones: {
      ...GENERIC_MILESTONES,
      Notification: 'Notice of intention to acquire (s.32(2))',
      'Objection / Claims': 'Hearing of objections (s.32(3))',
      Valuation: 'Notification of acquisition (s.32(1)) and compensation assessment (s.33)',
      Compensation: 'Agreement or award and disbursement (s.33)',
      Possession: 'Taking possession (s.32(5))',
    },
  },
};

/* ======================================================= dependency codes */

/**
 * Fixed dependency codes. The order is part of the data contract: case records
 * store pending dependencies as a bitmask over this list.
 */
export const DEPENDENCY_CODES = [
  'PRIMARY',
  'DISTRICT_HEAD',
  'LA_OFFICER',
  'LAND_RECORDS',
  'SUB_DIVISION',
  'FOREST',
  'SIA_UNIT',
  'RR_ADMIN',
  'DISPUTE_FORUM',
  'TREASURY',
  'REGISTRATION',
  'VALUATION_SUPPORT',
  'UTILITIES',
  'AVIATION',
  'RAILWAY_INTERFACE',
  'HIGHWAY_INTERFACE',
  'CENTRAL_SANCTION',
  'CONSOLIDATION',
  'URBAN_LOCAL_BODY',
];

export const DEPENDENCY_BIT = Object.fromEntries(DEPENDENCY_CODES.map((c, i) => [c, 1 << i]));

/** What each dependency is for, which stages it gates, and whether it can block a stage outright. */
export const DEPENDENCY_META = {
  PRIMARY: {
    label: 'Acquiring / requiring body',
    category: 'acquiring_body',
    stages: ['Land Identification', 'Compensation', 'Possession'],
    gate: false,
    pendingAction: 'Alignment freeze, compensation fund deposit or taking over possession',
  },
  DISTRICT_HEAD: {
    label: 'District administration',
    category: 'district_administration',
    stages: ['Notification', 'Objection / Claims', 'Compensation', 'Possession'],
    gate: false,
    pendingAction: 'Approval of notification drafts, award approval or possession orders',
  },
  LA_OFFICER: {
    label: 'Competent authority for acquisition',
    category: 'acquisition_officer',
    stages: ['Notification', 'Objection / Claims', 'Valuation', 'Compensation', 'Possession'],
    gate: false,
    pendingAction: 'Objection hearings, award computation or disbursement orders',
  },
  LAND_RECORDS: {
    label: 'Land records & survey',
    category: 'land_records',
    stages: ['Survey & Verification', 'Notification', 'Valuation', 'Closure'],
    gate: true,
    pendingAction: 'Joint measurement, sub-division survey or record-of-rights reconciliation',
  },
  SUB_DIVISION: {
    label: 'Sub-divisional & tehsil revenue office',
    category: 'district_administration',
    stages: ['Survey & Verification', 'Objection / Claims', 'Closure'],
    gate: false,
    pendingAction: 'Field verification of titles and mutation entries',
  },
  FOREST: {
    label: 'Forest clearance',
    category: 'clearance',
    stages: ['Land Identification', 'Survey & Verification', 'Possession'],
    gate: true,
    pendingAction: 'Forest diversion proposal (Stage-I / Stage-II clearance) pending',
  },
  SIA_UNIT: {
    label: 'Social Impact Assessment',
    category: 'clearance',
    stages: ['Survey & Verification', 'Notification'],
    gate: true,
    pendingAction: 'SIA study, public hearing or expert group appraisal pending',
  },
  RR_ADMIN: {
    label: 'Rehabilitation & resettlement',
    category: 'supporting',
    stages: ['Compensation', 'Possession', 'Rehabilitation & Resettlement'],
    gate: false,
    pendingAction: 'R&R entitlements, resettlement site or R&R award pending',
  },
  DISPUTE_FORUM: {
    label: 'Dispute forum',
    category: 'dispute_forum',
    stages: ['Objection / Claims', 'Compensation'],
    gate: false,
    pendingAction: 'References on compensation or objections awaiting disposal',
  },
  TREASURY: {
    label: 'Compensation funds & treasury',
    category: 'supporting',
    stages: ['Compensation'],
    gate: true,
    pendingAction: 'Fund release or treasury / PFMS clearance pending',
  },
  REGISTRATION: {
    label: 'Stamps & registration',
    category: 'supporting',
    stages: ['Closure'],
    gate: false,
    pendingAction: 'Registration and mutation of acquired land pending',
  },
  VALUATION_SUPPORT: {
    label: 'Crop, tree & structure valuation',
    category: 'supporting',
    stages: ['Valuation'],
    gate: false,
    pendingAction: 'Valuation reports for crops, trees or structures pending',
  },
  UTILITIES: {
    label: 'Utility shifting',
    category: 'supporting',
    stages: ['Possession'],
    gate: false,
    pendingAction: 'Electricity, water or telecom utility shifting estimates pending',
  },
  AVIATION: {
    label: 'Civil aviation clearance',
    category: 'clearance',
    stages: ['Land Identification', 'Survey & Verification', 'Notification'],
    gate: true,
    pendingAction: 'Site clearance, in-principle approval or height-clearance NOC pending',
  },
  RAILWAY_INTERFACE: {
    label: 'Railway interface approval',
    category: 'clearance',
    stages: ['Survey & Verification', 'Possession'],
    gate: true,
    pendingAction: 'General arrangement drawing for the railway crossing awaiting approval',
  },
  HIGHWAY_INTERFACE: {
    label: 'Highway crossing permission',
    category: 'clearance',
    stages: ['Survey & Verification', 'Possession'],
    gate: false,
    pendingAction: 'Permission to cross the national highway pending',
  },
  CENTRAL_SANCTION: {
    label: 'Central sanction / notification',
    category: 'clearance',
    stages: ['Land Identification', 'Notification', 'Valuation'],
    gate: true,
    pendingAction: 'Central approval, gazette notification or appraisal pending',
  },
  CONSOLIDATION: {
    label: 'Land consolidation proceedings',
    category: 'land_records',
    stages: ['Survey & Verification', 'Valuation', 'Closure'],
    gate: false,
    pendingAction: 'Open consolidation (chakbandi) proceedings to be reconciled',
  },
  URBAN_LOCAL_BODY: {
    label: 'Urban local body',
    category: 'supporting',
    stages: ['Land Identification', 'Possession'],
    gate: false,
    pendingAction: 'Building permissions, TDR or municipal NOC pending',
  },
};

/* ============================================================ project types */

export const PROJECT_TYPES = {
  'National Highway': {
    key: 'national_highway',
    linear: true,
    subtypes: ['Four-laning', 'Six-laning', 'Bypass', 'Greenfield corridor'],
    framework: () => 'NH_ACT',
    central: 'Ministry of Road Transport & Highways (gazette notifications under the NH Act)',
    centralWhen: () => true,
  },
  Expressway: {
    key: 'expressway',
    linear: true,
    subtypes: ['Greenfield expressway', 'Access-controlled upgrade'],
    framework: ({ primary }) => (/NHAI/.test(primary) ? 'NH_ACT' : 'RFCTLARR'),
    central: 'Ministry of Road Transport & Highways (where declared a national highway)',
    centralWhen: ({ frameworkId }) => frameworkId === 'NH_ACT',
  },
  Railway: {
    key: 'railway',
    linear: true,
    subtypes: ['New line', 'Doubling / tripling', 'Dedicated freight corridor', 'High-speed rail', 'Suburban rail'],
    framework: ({ subtype }) => (subtype === 'Suburban rail' ? 'RFCTLARR' : 'RAILWAYS_ACT'),
    central: 'Ministry of Railways (special railway project notification)',
    centralWhen: ({ frameworkId }) => frameworkId === 'RAILWAYS_ACT',
  },
  'Metro Rail': {
    key: 'metro',
    linear: true,
    subtypes: ['Elevated corridor', 'Underground corridor', 'Depot & stabling land'],
    framework: () => 'RFCTLARR',
    central: 'Ministry of Housing & Urban Affairs (central share approval)',
    centralWhen: () => true,
  },
  'Urban Infrastructure': {
    key: 'urban',
    linear: false,
    subtypes: ['Ring road', 'Planned layout / township', 'Water supply & sewerage', 'Flyover & grade separator'],
    framework: () => 'RFCTLARR',
    central: null,
    centralWhen: () => false,
  },
  Industrial: {
    key: 'industrial',
    linear: false,
    subtypes: ['Industrial park', 'Industrial corridor node', 'Logistics park'],
    framework: ({ state }) => (state === 'Karnataka' ? 'KIAD_ACT' : state === 'Maharashtra' ? 'MID_ACT' : 'RFCTLARR'),
    central: 'National Industrial Corridor Development Corporation (corridor nodes only)',
    centralWhen: ({ subtype }) => subtype === 'Industrial corridor node',
  },
  Irrigation: {
    key: 'irrigation',
    linear: false,
    subtypes: ['Canal network', 'Lift irrigation scheme', 'Reservoir submergence', 'Command area development'],
    framework: () => 'RFCTLARR',
    central: 'Central Water Commission (techno-economic appraisal of major projects)',
    centralWhen: ({ subtype }) => subtype === 'Reservoir submergence' || subtype === 'Canal network',
  },
  'Power Transmission': {
    key: 'transmission',
    linear: true,
    subtypes: ['400 kV line', '765 kV line', 'Substation'],
    framework: ({ subtype }) => (subtype === 'Substation' ? 'RFCTLARR' : 'ELECTRICITY_ROW'),
    central: 'Central Electricity Authority / Ministry of Power (s.164 authorisation for inter-state lines)',
    centralWhen: ({ subtype }) => subtype === '765 kV line',
  },
  'Renewable Energy': {
    key: 'renewable',
    linear: false,
    subtypes: ['Solar park', 'Wind farm', 'Hybrid park'],
    framework: () => 'RFCTLARR',
    central: 'Ministry of New & Renewable Energy / SECI (solar park scheme approval)',
    centralWhen: ({ subtype }) => subtype !== 'Wind farm',
  },
  Pipeline: {
    key: 'pipeline',
    linear: true,
    subtypes: ['Natural gas trunk line', 'Petroleum product pipeline'],
    framework: () => 'PMP_ACT',
    central: 'Ministry of Petroleum & Natural Gas (appointment of the competent authority and notifications)',
    centralWhen: () => true,
  },
  Airport: {
    key: 'airport',
    linear: false,
    subtypes: ['Greenfield airport', 'Runway extension', 'Terminal & apron expansion'],
    framework: () => 'RFCTLARR',
    central: 'Ministry of Civil Aviation (site clearance and in-principle approval)',
    centralWhen: () => false, // carried by the AVIATION dependency instead
  },
};

export const PROJECT_TYPE_NAMES = Object.keys(PROJECT_TYPES);

/* ============================================================ state profiles */

/**
 * The two states worked through in detail. Other states use the compact table
 * below, which carries designations and agencies but fewer district overrides.
 */
const KARNATAKA = {
  code: 'KA',
  subDistrictLabel: 'Taluk',
  districtHead: 'Deputy Commissioner',
  laOfficer: 'Special Land Acquisition Officer',
  subDivisionOfficer: 'Assistant Commissioner',
  tehsilOfficer: 'Tahsildar',
  revenueDepartment: 'Revenue Department, Government of Karnataka',
  landRecords: {
    name: 'Survey, Settlement and Land Records (SSLR) Department',
    districtOffice: 'Deputy Director of Land Records',
    subDistrictOffice: 'Assistant Director of Land Records',
    portal: 'Bhoomi (RTC records)',
    work: 'survey sketches, hissa / podi survey and RTC reconciliation',
  },
  registration: 'Department of Stamps and Registration, Karnataka',
  forest: 'Karnataka Forest Department',
  pwd: 'Public Works Department, Karnataka',
  treasury: 'Khajane-II treasury, Government of Karnataka',
  railwayZone: () => 'South Western Railway',
  agencies: {
    'National Highway': ['National Highways Authority of India (NHAI)', 'MoRTH Regional Office, Bengaluru', 'Public Works Department, Karnataka (NH wing)'],
    Expressway: ['National Highways Authority of India (NHAI)', 'Karnataka Road Development Corporation Ltd (KRDCL)'],
    'Metro Rail': ['Bangalore Metro Rail Corporation Ltd (BMRCL)'],
    'Urban Infrastructure': ({ district }) =>
      /Bengaluru/.test(district)
        ? ['Bangalore Development Authority (BDA)', 'Bruhat Bengaluru Mahanagara Palike (BBMP)']
        : [`${district} Urban Development Authority`, `${district} City Municipal Council`],
    Industrial: ['Karnataka Industrial Areas Development Board (KIADB)'],
    Irrigation: ({ district }) => {
      const vjnl = ['Vijayapura', 'Bagalkote', 'Kalaburagi', 'Yadgir', 'Raichur'];
      const cnnl = ['Mandya', 'Mysuru', 'Hassan', 'Chamarajanagar', 'Kodagu', 'Ramanagara', 'Tumakuru', 'Bengaluru Rural', 'Bengaluru Urban'];
      if (vjnl.includes(district)) return ['Visvesvaraya Jala Nigam Ltd (VJNL)', 'Water Resources Department, Karnataka'];
      if (cnnl.includes(district)) return ['Cauvery Neeravari Nigam Ltd (CNNL)', 'Water Resources Department, Karnataka'];
      return ['Karnataka Neeravari Nigam Ltd (KNNL)', 'Water Resources Department, Karnataka'];
    },
    'Power Transmission': ['Karnataka Power Transmission Corporation Ltd (KPTCL)', 'Power Grid Corporation of India Ltd (POWERGRID)'],
    'Renewable Energy': ['Karnataka Renewable Energy Development Ltd (KREDL)', 'Karnataka Solar Power Development Corporation Ltd (KSPDCL)'],
    Airport: ({ subtype }) =>
      subtype === 'Greenfield airport'
        ? ['Karnataka State Industrial and Infrastructure Development Corporation (KSIIDC)']
        : ['Airports Authority of India (AAI)'],
    Railway: ({ subtype }) =>
      subtype === 'Suburban rail'
        ? ['Rail Infrastructure Development Company (Karnataka) Ltd (K-RIDE)']
        : subtype === 'Dedicated freight corridor'
          ? ['Dedicated Freight Corridor Corporation of India Ltd (DFCCIL)']
          : ['Ministry of Railways — South Western Railway'],
  },
};

/** UP railway divisions sit in three zones; the district decides which. */
const UP_NCR = ['Prayagraj', 'Kanpur Nagar', 'Kanpur Dehat', 'Fatehpur', 'Kaushambi', 'Jhansi', 'Lalitpur', 'Jalaun', 'Mahoba', 'Banda', 'Hamirpur', 'Chitrakoot', 'Agra', 'Mathura', 'Firozabad', 'Etawah', 'Aligarh', 'Hathras', 'Mainpuri', 'Auraiya', 'Etah', 'Kasganj'];
const UP_NER = ['Gorakhpur', 'Deoria', 'Basti', 'Kushinagar', 'Mahrajganj', 'Siddharthnagar', 'Sant Kabir Nagar', 'Ballia', 'Mau', 'Azamgarh', 'Gonda', 'Bahraich', 'Balrampur', 'Shrawasti'];

const UTTAR_PRADESH = {
  code: 'UP',
  subDistrictLabel: 'Tehsil',
  districtHead: 'District Magistrate (Collector)',
  laOfficer: 'Additional District Magistrate (Land Acquisition)',
  subDivisionOfficer: 'Sub-Divisional Magistrate',
  tehsilOfficer: 'Tehsildar',
  fieldRecords: 'Lekhpal and Revenue Inspector (Kanungo)',
  revenueDepartment: 'Revenue Department, Government of Uttar Pradesh',
  landRecords: {
    name: 'Revenue Department — land records (Board of Revenue, U.P.)',
    districtOffice: 'District Land Records Office',
    subDistrictOffice: 'Tehsil record room (Registrar Kanungo)',
    portal: 'UP Bhulekh (khatauni records)',
    work: 'khatauni / khasra reconciliation, Lekhpal field verification and dakhil-kharij (mutation)',
  },
  consolidation: 'Consolidation Department (Chakbandi), Uttar Pradesh',
  registration: 'Stamp and Registration Department, Uttar Pradesh',
  forest: 'Uttar Pradesh Forest Department',
  pwd: 'Public Works Department, Uttar Pradesh',
  treasury: 'Koshvani treasury, Government of Uttar Pradesh',
  railwayZone: ({ district }) =>
    UP_NCR.includes(district) ? 'North Central Railway' : UP_NER.includes(district) ? 'North Eastern Railway' : 'Northern Railway',
  agencies: {
    'National Highway': ['National Highways Authority of India (NHAI)', 'MoRTH Regional Office, Lucknow', 'Public Works Department, Uttar Pradesh (NH wing)'],
    Expressway: ['Uttar Pradesh Expressways Industrial Development Authority (UPEIDA)', 'National Highways Authority of India (NHAI)'],
    'Metro Rail': ['Uttar Pradesh Metro Rail Corporation (UPMRC)'],
    'Urban Infrastructure': ({ district }) => {
      const da = {
        Lucknow: 'Lucknow Development Authority (LDA)',
        Ghaziabad: 'Ghaziabad Development Authority (GDA)',
        'Kanpur Nagar': 'Kanpur Development Authority (KDA)',
        Prayagraj: 'Prayagraj Development Authority (PDA)',
        Varanasi: 'Varanasi Development Authority (VDA)',
        Agra: 'Agra Development Authority (ADA)',
        Meerut: 'Meerut Development Authority (MDA)',
      }[district];
      return [da ?? `${district} Development Authority`, 'Uttar Pradesh Awas Evam Vikas Parishad'];
    },
    Industrial: ({ district }) =>
      district === 'Gautam Buddha Nagar'
        ? ['Yamuna Expressway Industrial Development Authority (YEIDA)', 'Uttar Pradesh State Industrial Development Authority (UPSIDA)']
        : ['Uttar Pradesh State Industrial Development Authority (UPSIDA)'],
    Irrigation: ['Irrigation and Water Resources Department, Uttar Pradesh'],
    'Power Transmission': ['Uttar Pradesh Power Transmission Corporation Ltd (UPPTCL)', 'Power Grid Corporation of India Ltd (POWERGRID)'],
    'Renewable Energy': ['Uttar Pradesh New and Renewable Energy Development Agency (UPNEDA)'],
    Airport: ({ subtype, district }) =>
      subtype === 'Greenfield airport'
        ? district === 'Gautam Buddha Nagar'
          ? ['Yamuna Expressway Industrial Development Authority (YEIDA)']
          : ['Civil Aviation Department, Uttar Pradesh']
        : ['Airports Authority of India (AAI)'],
    Railway: ({ subtype, district }) =>
      subtype === 'Dedicated freight corridor'
        ? ['Dedicated Freight Corridor Corporation of India Ltd (DFCCIL)']
        : [`Ministry of Railways — ${UTTAR_PRADESH.railwayZone({ district })}`],
  },
};

/**
 * Compact profiles for the remaining states.
 * [code, sub-district label, district head, acquisition officer, land records department, portal,
 *  highway agency, industrial agency, metro agency, transmission utility, renewable agency, irrigation agency, railway zone]
 */
const COMPACT = {
  Rajasthan: ['RJ', 'Tehsil', 'District Collector', 'Land Acquisition Officer', 'Revenue Department — Land Records, Rajasthan', 'Apna Khata', 'Public Works Department, Rajasthan', 'Rajasthan State Industrial Development & Investment Corporation (RIICO)', 'Jaipur Metro Rail Corporation (JMRC)', 'Rajasthan Rajya Vidyut Prasaran Nigam Ltd (RVPN)', 'Rajasthan Renewable Energy Corporation Ltd (RRECL)', 'Water Resources Department, Rajasthan', 'North Western Railway'],
  Maharashtra: ['MH', 'Taluka', 'District Collector', 'Special Land Acquisition Officer', 'Settlement Commissioner and Director of Land Records, Maharashtra', 'Mahabhumi (7/12 extracts)', 'Maharashtra State Road Development Corporation (MSRDC)', 'Maharashtra Industrial Development Corporation (MIDC)', 'Maharashtra Metro Rail Corporation Ltd (MahaMetro)', 'Maharashtra State Electricity Transmission Co. Ltd (MSETCL)', 'Maharashtra Energy Development Agency (MEDA)', 'Water Resources Department, Maharashtra', 'Central Railway'],
  Gujarat: ['GJ', 'Taluka', 'District Collector', 'Special Land Acquisition Officer', 'Settlement Commissioner and Director of Land Records, Gujarat', 'AnyROR', 'Roads & Buildings Department, Gujarat', 'Gujarat Industrial Development Corporation (GIDC)', 'Gujarat Metro Rail Corporation (GMRC)', 'Gujarat Energy Transmission Corporation Ltd (GETCO)', 'Gujarat Power Corporation Ltd (GPCL)', 'Sardar Sarovar Narmada Nigam Ltd (SSNNL)', 'Western Railway'],
  'Madhya Pradesh': ['MP', 'Tehsil', 'District Collector', 'Land Acquisition Officer (Sub-Divisional Officer)', 'Commissioner Land Records, Madhya Pradesh', 'MP Bhulekh', 'Madhya Pradesh Road Development Corporation (MPRDC)', 'MP Industrial Development Corporation (MPIDC)', 'Madhya Pradesh Metro Rail Corporation Ltd (MPMRCL)', 'MP Power Transmission Company Ltd (MPPTCL)', 'Rewa Ultra Mega Solar Ltd (RUMSL)', 'Water Resources Department, Madhya Pradesh', 'West Central Railway'],
  'Tamil Nadu': ['TN', 'Taluk', 'District Collector', 'Special Tahsildar (Land Acquisition)', 'Survey and Settlement Department, Tamil Nadu', 'Tamil Nilam (patta / chitta)', 'Highways Department, Tamil Nadu', 'State Industries Promotion Corporation of Tamil Nadu (SIPCOT)', 'Chennai Metro Rail Ltd (CMRL)', 'Tamil Nadu Transmission Corporation Ltd (TANTRANSCO)', 'Tamil Nadu Green Energy Corporation Ltd', 'Water Resources Department, Tamil Nadu', 'Southern Railway'],
  Telangana: ['TG', 'Mandal', 'District Collector', 'Special Deputy Collector (Land Acquisition)', 'Survey, Settlement and Land Records Department, Telangana', 'State land records portal', 'Roads & Buildings Department, Telangana', 'Telangana State Industrial Infrastructure Corporation (TGIIC)', 'Hyderabad Metro Rail Ltd (HMRL)', 'Transmission Corporation of Telangana Ltd (TGTRANSCO)', 'Telangana Renewable Energy Development Corporation (TGREDCO)', 'Irrigation & CAD Department, Telangana', 'South Central Railway'],
  'Andhra Pradesh': ['AP', 'Mandal', 'District Collector', 'Special Deputy Collector (Land Acquisition)', 'Survey, Settlement and Land Records Department, Andhra Pradesh', 'Meebhoomi', 'Roads & Buildings Department, Andhra Pradesh', 'Andhra Pradesh Industrial Infrastructure Corporation (APIIC)', 'Andhra Pradesh Metro Rail Corporation', 'Transmission Corporation of Andhra Pradesh Ltd (APTRANSCO)', 'New & Renewable Energy Development Corporation of AP (NREDCAP)', 'Water Resources Department, Andhra Pradesh', 'South Central Railway'],
  Haryana: ['HR', 'Tehsil', 'Deputy Commissioner', 'Land Acquisition Collector', 'Revenue Department — Land Records, Haryana', 'Jamabandi', 'Public Works (B&R) Department, Haryana', 'Haryana State Industrial & Infrastructure Development Corporation (HSIIDC)', 'Haryana Mass Rapid Transport Corporation (HMRTC)', 'Haryana Vidyut Prasaran Nigam Ltd (HVPNL)', 'Haryana Renewable Energy Development Agency (HAREDA)', 'Irrigation & Water Resources Department, Haryana', 'Northern Railway'],
  Punjab: ['PB', 'Tehsil', 'Deputy Commissioner', 'Land Acquisition Collector', 'Revenue Department — Land Records, Punjab', 'PLRS Jamabandi', 'Public Works Department (B&R), Punjab', 'Punjab Small Industries & Export Corporation (PSIEC)', 'State metro agency (as notified)', 'Punjab State Transmission Corporation Ltd (PSTCL)', 'Punjab Energy Development Agency (PEDA)', 'Water Resources Department, Punjab', 'Northern Railway'],
  Bihar: ['BR', 'Circle (Anchal)', 'District Magistrate', 'District Land Acquisition Officer', 'Revenue and Land Reforms Department, Bihar', 'Bihar Bhumi', 'Bihar State Road Development Corporation (BSRDC)', 'Bihar Industrial Area Development Authority (BIADA)', 'Patna Metro Rail Corporation (PMRC)', 'Bihar State Power Transmission Company Ltd (BSPTCL)', 'Bihar Renewable Energy Development Agency (BREDA)', 'Water Resources Department, Bihar', 'East Central Railway'],
  'West Bengal': ['WB', 'Block', 'District Magistrate', 'Land Acquisition Collector', 'Land & Land Reforms Department, West Bengal', 'Banglarbhumi', 'Public Works Department, West Bengal', 'West Bengal Industrial Development Corporation (WBIDC)', 'Kolkata Metro Rail Corporation (KMRC)', 'West Bengal State Electricity Transmission Co. Ltd (WBSETCL)', 'West Bengal Renewable Energy Development Agency (WBREDA)', 'Irrigation & Waterways Department, West Bengal', 'Eastern Railway'],
  Odisha: ['OD', 'Tahasil', 'District Collector', 'Special Land Acquisition Officer', 'Revenue & Disaster Management Department — Land Records, Odisha', 'Bhulekh Odisha', 'Works Department, Odisha', 'Industrial Infrastructure Development Corporation (IDCO)', 'State metro agency (as notified)', 'Odisha Power Transmission Corporation Ltd (OPTCL)', 'Odisha Renewable Energy Development Agency (OREDA)', 'Water Resources Department, Odisha', 'East Coast Railway'],
  Chhattisgarh: ['CG', 'Tehsil', 'District Collector', 'Land Acquisition Officer', 'Revenue Department — Land Records, Chhattisgarh', 'Bhuiyan', 'Public Works Department, Chhattisgarh', 'Chhattisgarh State Industrial Development Corporation (CSIDC)', 'State metro agency (as notified)', 'Chhattisgarh State Power Transmission Company Ltd (CSPTCL)', 'Chhattisgarh Renewable Energy Development Agency (CREDA)', 'Water Resources Department, Chhattisgarh', 'South East Central Railway'],
  Jharkhand: ['JH', 'Circle (Anchal)', 'Deputy Commissioner', 'District Land Acquisition Officer', 'Revenue, Registration & Land Reforms Department, Jharkhand', 'Jharbhoomi', 'Road Construction Department, Jharkhand', 'Jharkhand Industrial Area Development Authority (JIADA)', 'State metro agency (as notified)', 'Jharkhand Urja Sancharan Nigam Ltd (JUSNL)', 'Jharkhand Renewable Energy Development Agency (JREDA)', 'Water Resources Department, Jharkhand', 'South Eastern Railway'],
  Kerala: ['KL', 'Taluk', 'District Collector', 'Special Tahsildar (Land Acquisition)', 'Survey and Land Records Department, Kerala', 'ReLIS land records', 'Public Works Department, Kerala', 'Kerala State Industrial Development Corporation (KSIDC)', 'Kochi Metro Rail Ltd (KMRL)', 'Kerala State Electricity Board Ltd (KSEB)', 'Agency for New and Renewable Energy Research and Technology (ANERT)', 'Water Resources Department, Kerala', 'Southern Railway'],
  Assam: ['AS', 'Revenue Circle', 'Deputy Commissioner', 'Land Acquisition Officer (Additional Deputy Commissioner)', 'Revenue & Disaster Management Department — Land Records, Assam', 'Dharitree', 'Public Works (Roads) Department, Assam', 'Assam Industrial Development Corporation (AIDC)', 'State metro agency (as notified)', 'Assam Electricity Grid Corporation Ltd (AEGCL)', 'Assam Energy Development Agency (AEDA)', 'Water Resources Department, Assam', 'Northeast Frontier Railway'],
  Uttarakhand: ['UK', 'Tehsil', 'District Magistrate', 'Special Land Acquisition Officer', 'Revenue Department — Land Records, Uttarakhand', 'Devbhoomi land records', 'Public Works Department, Uttarakhand', 'State Infrastructure & Industrial Development Corporation of Uttarakhand (SIIDCUL)', 'Uttarakhand Metro Rail Corporation', 'Power Transmission Corporation of Uttarakhand Ltd (PTCUL)', 'Uttarakhand Renewable Energy Development Agency (UREDA)', 'Irrigation Department, Uttarakhand', 'Northern Railway'],
  'Himachal Pradesh': ['HP', 'Tehsil', 'Deputy Commissioner', 'Land Acquisition Collector', 'Revenue Department — Land Records, Himachal Pradesh', 'HimBhoomi', 'Public Works Department, Himachal Pradesh', 'Himachal Pradesh State Industrial Development Corporation (HPSIDC)', 'State metro agency (as notified)', 'HP Power Transmission Corporation Ltd (HPPTCL)', 'HIMURJA', 'Jal Shakti Vibhag, Himachal Pradesh', 'Northern Railway'],
  Delhi: ['DL', 'Sub-Division', 'District Magistrate', 'Land Acquisition Collector', 'Revenue Department, Government of NCT of Delhi', 'Delhi land records portal', 'Public Works Department, Delhi', 'Delhi State Industrial & Infrastructure Development Corporation (DSIIDC)', 'Delhi Metro Rail Corporation (DMRC)', 'Delhi Transco Ltd (DTL)', 'Energy Efficiency and Renewable Energy Management Centre, Delhi', 'Irrigation & Flood Control Department, Delhi', 'Northern Railway'],
  Goa: ['GA', 'Taluka', 'District Collector', 'Deputy Collector (Land Acquisition)', 'Directorate of Settlement and Land Records, Goa', 'State land records portal', 'Public Works Department, Goa', 'Goa Industrial Development Corporation (GIDC Goa)', 'State metro agency (as notified)', 'Electricity Department, Goa', 'Goa Energy Development Agency (GEDA)', 'Water Resources Department, Goa', 'Konkan Railway Corporation Ltd'],
  Tripura: ['TR', 'Sub-Division', 'District Magistrate', 'Land Acquisition Collector', 'Revenue Department — Land Records, Tripura', 'State land records portal', 'Public Works Department, Tripura', 'Tripura Industrial Development Corporation (TIDC)', 'State metro agency (as notified)', 'Tripura State Electricity Corporation Ltd (TSECL)', 'Tripura Renewable Energy Development Agency (TREDA)', 'Water Resources Department, Tripura', 'Northeast Frontier Railway'],
  Meghalaya: ['ML', 'Block', 'Deputy Commissioner', 'Land Acquisition Officer', 'Revenue & Disaster Management Department, Meghalaya', 'State land records portal', 'Public Works Department (Roads), Meghalaya', 'Meghalaya Industrial Development Corporation (MIDC Meghalaya)', 'State metro agency (as notified)', 'Meghalaya Power Transmission Corporation Ltd (MePTCL)', 'Meghalaya New & Renewable Energy Development Agency (MNREDA)', 'Water Resources Department, Meghalaya', 'Northeast Frontier Railway'],
  'Jammu & Kashmir': ['JK', 'Tehsil', 'Deputy Commissioner', 'Collector Land Acquisition', 'Revenue Department — Land Records, Jammu & Kashmir', 'State land records portal', 'Public Works (R&B) Department, Jammu & Kashmir', 'Jammu & Kashmir State Industrial Development Corporation (SIDCO)', 'State metro agency (as notified)', 'Jammu & Kashmir Power Transmission Corporation Ltd (JKPTCL)', 'Jammu & Kashmir Energy Development Agency (JAKEDA)', 'Jal Shakti Department, Jammu & Kashmir', 'Northern Railway'],
};

function compactProfile(state) {
  const row = COMPACT[state];
  if (!row) return null;
  const [code, subLabel, head, lao, lrName, portal, highway, industrial, metro, transco, renewable, irrigation, zone] = row;
  return {
    code,
    subDistrictLabel: subLabel,
    districtHead: head,
    laOfficer: lao,
    subDivisionOfficer: 'Sub-Divisional Officer',
    tehsilOfficer: 'Tehsildar',
    revenueDepartment: `Revenue Department, ${state}`,
    landRecords: {
      name: lrName,
      districtOffice: 'District land records office',
      subDistrictOffice: `${subLabel} revenue office`,
      portal,
      work: 'survey, sub-division of holdings and record-of-rights reconciliation',
    },
    registration: `Registration Department, ${state}`,
    forest: `${state} Forest Department`,
    pwd: highway,
    treasury: `State treasury, ${state}`,
    railwayZone: () => zone,
    agencies: {
      'National Highway': ['National Highways Authority of India (NHAI)', 'MoRTH Regional Office', `${highway} (NH wing)`],
      Expressway: ['National Highways Authority of India (NHAI)', highway],
      'Metro Rail': [metro],
      'Urban Infrastructure': ({ district }) => [`${district} Development Authority`, `${district} Municipal Corporation`],
      Industrial: [industrial],
      Irrigation: [irrigation],
      'Power Transmission': [transco, 'Power Grid Corporation of India Ltd (POWERGRID)'],
      'Renewable Energy': [renewable],
      Airport: ({ subtype }) =>
        subtype === 'Greenfield airport' ? [`Civil Aviation Department, ${state}`] : ['Airports Authority of India (AAI)'],
      Railway: ({ subtype }) =>
        subtype === 'High-speed rail' && (state === 'Gujarat' || state === 'Maharashtra')
          ? ['National High Speed Rail Corporation Ltd (NHSRCL)']
          : subtype === 'Dedicated freight corridor'
            ? ['Dedicated Freight Corridor Corporation of India Ltd (DFCCIL)']
            : [`Ministry of Railways — ${zone}`],
    },
  };
}

/** Used when a state has no entry at all — designations stay generic rather than invented. */
function genericProfile(state) {
  return {
    code: state.slice(0, 2).toUpperCase(),
    subDistrictLabel: 'Tehsil',
    districtHead: 'District Collector',
    laOfficer: 'Land Acquisition Officer',
    subDivisionOfficer: 'Sub-Divisional Officer',
    tehsilOfficer: 'Tehsildar',
    revenueDepartment: `Revenue Department, ${state}`,
    landRecords: {
      name: `Land records & survey department, ${state}`,
      districtOffice: 'District land records office',
      subDistrictOffice: 'Tehsil revenue office',
      portal: 'State land records portal',
      work: 'survey and record-of-rights reconciliation',
    },
    registration: `Registration Department, ${state}`,
    forest: `${state} Forest Department`,
    pwd: `Public Works Department, ${state}`,
    treasury: `State treasury, ${state}`,
    railwayZone: () => 'Zonal railway (as notified)',
    agencies: {},
    generic: true,
  };
}

export const STATE_PROFILES = {
  Karnataka: KARNATAKA,
  'Uttar Pradesh': UTTAR_PRADESH,
};

export function stateProfile(state) {
  return STATE_PROFILES[state] ?? compactProfile(state) ?? genericProfile(state);
}

export const PROFILED_STATES = [...Object.keys(STATE_PROFILES), ...Object.keys(COMPACT)];

/* ======================================================= national agencies */

const NATIONAL_FALLBACK = {
  'National Highway': ['National Highways Authority of India (NHAI)', 'MoRTH Regional Office'],
  Expressway: ['National Highways Authority of India (NHAI)'],
  Railway: ['Ministry of Railways — zonal railway'],
  'Metro Rail': ['State metro rail corporation (as notified)'],
  'Urban Infrastructure': ['Development authority / urban local body (as notified)'],
  Industrial: ['State industrial development corporation (as notified)'],
  Irrigation: ['State Water Resources / Irrigation Department'],
  'Power Transmission': ['Power Grid Corporation of India Ltd (POWERGRID)', 'State Transmission Utility'],
  'Renewable Energy': ['Solar Energy Corporation of India Ltd (SECI)', 'State renewable energy nodal agency'],
  Pipeline: ['GAIL (India) Ltd', 'Indian Oil Corporation Ltd (IOCL)', 'Bharat Petroleum Corporation Ltd (BPCL)', 'Hindustan Petroleum Corporation Ltd (HPCL)'],
  Airport: ['Airports Authority of India (AAI)'],
};

/**
 * Eligible primary acquiring / requiring bodies for a project context. The
 * first entry is the default. Unrelated agencies never appear: an irrigation
 * project is never offered the Airports Authority of India.
 */
export function authorityOptions({ projectType, subtype, state, district }) {
  const type = PROJECT_TYPES[projectType];
  if (!type) return [];
  const st = subtype ?? type.subtypes[0];
  if (projectType === 'Pipeline') return NATIONAL_FALLBACK.Pipeline;
  const profile = stateProfile(state);
  const entry = profile.agencies[projectType];
  const list = typeof entry === 'function' ? entry({ subtype: st, district, state }) : entry;
  const out = list && list.length ? list : NATIONAL_FALLBACK[projectType] ?? [];
  return Array.from(new Set(out));
}

/* =================================================== network construction */

/**
 * Deterministic project flags that pull in interface departments. They are
 * derived from the project context (and, for the generator, a seeded draw),
 * never from the UI alone.
 */
export const DEFAULT_FLAGS = { forestLand: false, crossesRailway: false, crossesHighway: false, consolidationOpen: false };

const withDistrict = (title, district) => (district ? `${title}, ${district}` : title);

/**
 * The dependency network for one project context.
 *
 * Returns every body the acquisition depends on, why it is involved, the
 * stages it gates and its basis. Pending actions are applied separately (see
 * `applyPending`) because they come from case data or scenario input.
 */
export function buildDependencyNetwork(ctx) {
  const {
    projectType,
    subtype: subtypeIn,
    state,
    district,
    subDistrict,
    primaryAuthority,
    affectedFamilies = 0,
    agriculturalLand = true,
    flags: flagsIn = {},
  } = ctx;
  const type = PROJECT_TYPES[projectType];
  if (!type) throw new Error(`Unknown project type "${projectType}"`);
  const subtype = type.subtypes.includes(subtypeIn) ? subtypeIn : type.subtypes[0];
  const flags = { ...DEFAULT_FLAGS, ...flagsIn };
  const profile = stateProfile(state);
  const options = authorityOptions({ projectType, subtype, state, district });
  const primary = primaryAuthority && options.includes(primaryAuthority) ? primaryAuthority : options[0];
  const frameworkId = type.framework({ subtype, state, primary });
  const framework = FRAMEWORKS[frameworkId];
  const subLabel = profile.subDistrictLabel;
  const nodes = [];

  const add = (code, fields) => {
    const meta = DEPENDENCY_META[code];
    nodes.push({
      code,
      role: meta.label,
      category: meta.category,
      stages: fields.stages ?? meta.stages,
      gate: fields.gate ?? meta.gate,
      pendingActionText: fields.pendingAction ?? meta.pendingAction,
      basis: 'configured',
      ...fields,
    });
  };

  add('PRIMARY', {
    name: primary,
    level: /Ministry|Authority of India|NHAI|POWERGRID|DFCCIL|NHSRCL|GAIL|IOCL|BPCL|HPCL|SECI|MoRTH/.test(primary) ? 'central' : 'state',
    why:
      framework.mode === 'ownership'
        ? `Requiring body for this ${projectType.toLowerCase()} project: proposes the land schedule, deposits compensation and takes over possession.`
        : `Project entity holding the ${framework.mode === 'right_of_user' ? 'right of user' : 'right of way'}: funds compensation and executes works on the corridor.`,
    basis: 'project',
  });

  if (type.central && type.centralWhen({ subtype, frameworkId })) {
    const statutory = frameworkId === 'NH_ACT' || frameworkId === 'RAILWAYS_ACT' || frameworkId === 'PMP_ACT';
    add('CENTRAL_SANCTION', {
      name: type.central,
      level: 'central',
      why: statutory
        ? `Under the ${framework.short}, acquisition notifications are issued by the Central Government, so each notification waits on central approval.`
        : 'Central approval or appraisal is a precondition for sanction and fund release.',
      basis: statutory ? 'statute' : 'configured',
    });
  }

  add('DISTRICT_HEAD', {
    name: withDistrict(profile.districtHead, district),
    level: 'district',
    why: `Heads district administration for the acquisition: approves notification drafts, awards and possession orders in ${district ?? 'the district'}.`,
  });

  const laName =
    frameworkId === 'NH_ACT'
      ? withDistrict('Competent Authority for Land Acquisition (CALA)', district)
      : frameworkId === 'RAILWAYS_ACT'
        ? withDistrict('Competent Authority (special railway project)', district)
        : frameworkId === 'PMP_ACT'
          ? withDistrict('Competent Authority (PMP Act)', district)
          : frameworkId === 'ELECTRICITY_ROW'
            ? withDistrict(`${profile.districtHead} — right-of-way orders`, district)
            : frameworkId === 'KIAD_ACT'
              ? 'Special Land Acquisition Officer, KIADB'
              : frameworkId === 'MID_ACT'
                ? 'Special Land Acquisition Officer, MIDC'
                : withDistrict(profile.laOfficer, district);
  add('LA_OFFICER', {
    name: laName,
    level: 'district',
    why:
      frameworkId === 'NH_ACT' || frameworkId === 'RAILWAYS_ACT' || frameworkId === 'PMP_ACT'
        ? `The ${framework.short} vests hearings and awards in a competent authority designated by notification; in ${state} this is typically a ${profile.laOfficer} or ${profile.subDivisionOfficer}.`
        : frameworkId === 'ELECTRICITY_ROW'
          ? 'Right-of-way objections and compensation orders on line corridors sit with the district magistrate.'
          : `Conducts hearings, computes the award and orders disbursement under the ${framework.short}.`,
    basis: frameworkId === 'RFCTLARR' ? 'configured' : 'statute',
  });

  add('LAND_RECORDS', {
    name: `${profile.landRecords.name}${district ? ` — ${profile.landRecords.districtOffice}, ${district}` : ''}`,
    level: 'state',
    why: `Land-record and survey dependency, not the acquiring authority: ${profile.landRecords.work} (${profile.landRecords.portal}) must reconcile before the schedule is notified and before mutation at closure.`,
  });

  add('SUB_DIVISION', {
    name: subDistrict
      ? `${profile.subDivisionOfficer} and ${profile.tehsilOfficer}, ${subDistrict} ${subLabel}`
      : `${profile.subDivisionOfficer} and ${profile.tehsilOfficer}`,
    level: 'sub-district',
    why: `Field verification of titles, notices to interested persons${profile.fieldRecords ? ` (through the ${profile.fieldRecords})` : ''} and mutation entries at ${subLabel.toLowerCase()} level.`,
  });

  if (framework.siaRequired) {
    add('SIA_UNIT', {
      name: `State Social Impact Assessment Unit, ${state}`,
      level: 'state',
      why: 'The RFCTLARR Act requires a Social Impact Assessment (s.4) and expert group appraisal (s.7) before the preliminary notification.',
      basis: 'statute',
    });
  }

  if (flags.forestLand || (projectType === 'Irrigation' && subtype === 'Reservoir submergence')) {
    add('FOREST', {
      name: `${profile.forest} / Ministry of Environment, Forest & Climate Change`,
      level: 'state',
      why: 'Part of the alignment is recorded forest land; diversion needs forest clearance before possession can be taken.',
      basis: 'statute',
    });
  }

  if (affectedFamilies > 0 && framework.mode === 'ownership') {
    add('RR_ADMIN', {
      name: `Administrator for Rehabilitation & Resettlement${district ? `, ${district}` : ''}`,
      level: 'district',
      why: `${affectedFamilies.toLocaleString('en-IN')} affected families are recorded; R&R entitlements must be delivered before possession is completed.`,
      basis: frameworkId === 'RFCTLARR' ? 'statute' : 'configured',
    });
  }

  add('DISPUTE_FORUM', {
    name: framework.disputeForum,
    level: frameworkId === 'RFCTLARR' ? 'state' : 'district',
    why: `Forum for references on objections and compensation under the ${framework.short}.`,
    basis: 'statute',
  });

  add('TREASURY', {
    name: `${profile.treasury} / requiring-body deposit`,
    level: 'state',
    why:
      framework.mode === 'ownership'
        ? 'Compensation can only be disbursed once the requiring body has deposited funds and the treasury has cleared the release.'
        : 'Right-of-way / right-of-user compensation is released from funds deposited by the project entity.',
  });

  if (framework.mode === 'ownership') {
    add('REGISTRATION', {
      name: profile.registration,
      level: 'state',
      why: 'Acquired land must be registered and mutated in favour of the requiring body before the case can close.',
    });
  }

  if (agriculturalLand) {
    add('VALUATION_SUPPORT', {
      name: `Agriculture, Horticulture & ${projectType === 'Urban Infrastructure' || projectType === 'Metro Rail' ? 'Public Works' : 'Forest'} departments (valuation)`,
      level: 'district',
      why: 'Crops, trees and structures on the parcels are valued by line departments before the award.',
    });
  }

  if (type.linear || projectType === 'Urban Infrastructure' || projectType === 'Airport') {
    add('UTILITIES', {
      name: `Utility owners — electricity distribution company, water board, telecom (${district ?? state})`,
      level: 'district',
      why: 'Utilities on the alignment must be shifted before the site can be handed over clear of encumbrances.',
    });
  }

  if (projectType === 'Airport') {
    add('AVIATION', {
      name:
        subtype === 'Greenfield airport'
          ? 'Ministry of Civil Aviation (site clearance) and Airports Authority of India (NOC)'
          : 'Airports Authority of India — aerodrome planning & height clearance',
      level: 'central',
      why:
        subtype === 'Greenfield airport'
          ? 'A greenfield airport needs site clearance and in-principle approval from the Ministry of Civil Aviation before land is notified.'
          : 'Expansion land must match the approved airport master plan and obstacle limitation surfaces.',
      basis: 'configured',
    });
  }

  if (flags.crossesRailway && projectType !== 'Railway' && type.linear) {
    add('RAILWAY_INTERFACE', {
      name: `${profile.railwayZone({ district })} — bridge / crossing approval`,
      level: 'central',
      why: 'The alignment crosses a railway line; the general arrangement drawing for the crossing needs zonal railway approval.',
    });
  }

  if (flags.crossesHighway && projectType !== 'National Highway' && projectType !== 'Expressway' && type.linear) {
    add('HIGHWAY_INTERFACE', {
      name: 'National Highways Authority of India — crossing permission',
      level: 'central',
      why: 'The alignment crosses a national highway; crossing permission is needed before works can start on those parcels.',
    });
  }

  if (flags.consolidationOpen && profile.consolidation) {
    add('CONSOLIDATION', {
      name: profile.consolidation,
      level: 'state',
      why: 'Consolidation proceedings are open in part of the project area; plot numbers must be reconciled before valuation and mutation.',
    });
  }

  if (projectType === 'Metro Rail' || projectType === 'Urban Infrastructure') {
    add('URBAN_LOCAL_BODY', {
      name: `${district ?? state} municipal corporation / urban local body`,
      level: 'district',
      why: 'Urban parcels carry building permissions, TDR claims and municipal dues that the local body must settle.',
    });
  }

  return {
    context: { projectType, subtype, state, district: district ?? null, subDistrict: subDistrict ?? null, subDistrictLabel: subLabel },
    framework: { id: framework.id, name: framework.name, short: framework.short, mode: framework.mode, note: framework.note ?? null, siaRequired: framework.siaRequired },
    primaryAuthority: primary,
    authorityOptions: options,
    stateProfile: {
      state,
      generic: Boolean(profile.generic),
      districtHead: profile.districtHead,
      laOfficer: profile.laOfficer,
      subDistrictLabel: subLabel,
      revenueDepartment: profile.revenueDepartment,
      landRecords: profile.landRecords,
    },
    milestones: framework.milestones,
    nodes,
    dependencyCount: nodes.length,
    note: REGISTRY_NOTE,
  };
}

/** Codes of the nodes present in a network, as a bitmask. */
export const networkMask = (network) => network.nodes.reduce((m, n) => m | DEPENDENCY_BIT[n.code], 0);

/** Nodes relevant to a stage (the stage appears in the node's gated stages). */
export const nodesForStage = (network, stage) => network.nodes.filter((n) => n.stages.includes(stage));

export function maskToCodes(mask) {
  const out = [];
  for (let i = 0; i < DEPENDENCY_CODES.length; i++) if (mask & (1 << i)) out.push(DEPENDENCY_CODES[i]);
  return out;
}

export function codesToMask(codes) {
  let m = 0;
  for (const c of codes) if (DEPENDENCY_BIT[c] !== undefined) m |= DEPENDENCY_BIT[c];
  return m;
}

/**
 * Inter-department coordination score (0–100, higher is better) for a network,
 * given the historical delay rate of the acquiring authority. More agencies
 * and more gating clearances mean more hand-offs. Deterministic.
 */
export function coordinationScore(network, authorityDelayRate = 0.33) {
  const gates = network.nodes.filter((n) => n.gate).length;
  const central = network.nodes.filter((n) => n.level === 'central').length;
  const raw = 100 - (network.dependencyCount - 6) * 3.2 - gates * 2.5 - central * 2 - (authorityDelayRate - 0.25) * 60;
  return Math.round(Math.max(20, Math.min(98, raw)));
}
