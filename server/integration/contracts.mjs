/**
 * Government data integration contracts.
 *
 *   Frontend → LandPulse AI API → Data Integration Layer → Government / external sources
 *
 * Each provider kind below is a contract: the methods an adapter must
 * implement, what they return, and the kind of official system that would
 * sit behind them in a deployment. LandPulse AI does not connect to any of
 * those systems today. The only adapters registered are synthetic ones that
 * read the demonstration corpus and label every response as such.
 *
 * To connect a real source, implement the same methods (for example an HTTP
 * client for a state land-records API), register it in `adapters.mjs`, and
 * select it with the matching LANDPULSE_PROVIDER_<KIND> environment variable.
 * The API and the screens consume the contract, not the adapter.
 *
 * Every method resolves to an Envelope:
 *
 *   {
 *     data:        the payload (shape per method below) or null when the source holds nothing
 *     provenance:  { kind, adapter, mode, label, source, retrievedAt }
 *   }
 *
 * `mode` is one of DATA_MODES; the UI renders it wherever the data appears.
 */

/** Where a figure on screen comes from. Shown to users, never inferred. */
export const DATA_MODES = {
  synthetic: { id: 'synthetic', label: 'Synthetic demo data', description: 'Generated for demonstration and model development. Not an official record.' },
  user: { id: 'user', label: 'User-entered', description: 'Entered through a form or CSV upload by a signed-in user of this prototype.' },
  model: { id: 'model', label: 'Model-generated', description: 'Produced by the delay-risk model or the rule engine from the data above. An estimate, not an observation.' },
  integration: { id: 'integration', label: 'Government integration (not connected)', description: 'Contract defined and adapter slot ready. No official system is connected in this prototype.' },
  official: { id: 'official', label: 'Official source', description: 'Retrieved from a connected government system. Not used by any adapter in this prototype.' },
};

/**
 * Parcel reference. Synthetic adapters resolve `caseId`; a real adapter would
 * resolve the land-record identifiers.
 *   { caseId?, state, district, subDistrict?, village?, surveyNumber? }
 *
 * Project reference.
 *   { projectId, state?, district? }
 */
export const PROVIDER_CONTRACTS = {
  landRecords: {
    label: 'Land records',
    description: 'Record of rights, ownership, land classification and mutation status for a parcel.',
    methods: {
      getRecordOfRights: {
        input: 'ParcelRef',
        returns: '{ surveyNumber, village, subDistrict, landType, areaHa, ownership, numberOfOwners, verificationStatus, documentCompleteness, mutationStatus, recordSystem }',
      },
    },
    futureSources: ['State record-of-rights systems digitised under the Digital India Land Records Modernization Programme (DILRMP)', 'State land-records portals named in the authority registry'],
  },
  registration: {
    label: 'Registration & encumbrance',
    description: 'Registered transactions and encumbrances on a parcel.',
    methods: {
      getEncumbrances: { input: 'ParcelRef', returns: '{ encumbrances: Array<{ type, date, party }>, lastTransactionDate }' },
    },
    futureSources: ['National Generic Document Registration System (NGDRS) and state registration systems'],
  },
  courtCases: {
    label: 'Court & dispute records',
    description: 'Litigation and references on compensation connected to a parcel or project.',
    methods: {
      getCasesForParcel: { input: 'ParcelRef', returns: '{ legalDispute, caseCount, disputeComplexity, forum }' },
    },
    futureSources: ['eCourts Services / National Judicial Data Grid (NJDG)', 'LARR Authority registries'],
  },
  compensation: {
    label: 'Compensation & payments',
    description: 'Award, deposit and disbursement status for a parcel.',
    methods: {
      getCompensation: { input: 'ParcelRef', returns: '{ status, band, completionPct, pendingDays, treasury }' },
    },
    futureSources: ['Public Financial Management System (PFMS)', 'State treasury systems', 'Acquiring-body deposit records'],
  },
  notifications: {
    label: 'Acquisition notifications',
    description: 'Statutory notifications and their dates for a project.',
    methods: {
      getNotifications: { input: 'ProjectRef', returns: 'Array<{ stage, milestone, status, plannedDate, actualDate }>' },
    },
    futureSources: ['e-Gazette of India and State Gazettes', 'Bhoomi Rashi (MoRTH, national highway acquisition notifications)'],
  },
  projectStatus: {
    label: 'Project progress',
    description: 'Lifecycle stage, milestones and physical progress for a project.',
    methods: {
      getProjectStatus: { input: 'ProjectRef', returns: '{ currentStage, stageStatus, progressPct, milestoneDeadline, stages }' },
    },
    futureSources: ['PM Gati Shakti National Master Plan', 'Ministry and implementing-agency project monitoring systems'],
  },
  clearances: {
    label: 'Forest & environment clearances',
    description: 'Forest diversion, Social Impact Assessment and other clearances a project depends on.',
    methods: {
      getClearances: { input: 'ProjectRef', returns: 'Array<{ code, name, required, pendingShare, stages }>' },
    },
    futureSources: ['PARIVESH (MoEFCC clearance portal)', 'State SIA units'],
  },
  gis: {
    label: 'GIS & geospatial',
    description: 'Parcel location, administrative boundary and project alignment.',
    methods: {
      getParcelGeometry: { input: 'ParcelRef', returns: '{ point: [lon, lat], boundaryKey, geometry: "point" | "polygon" }' },
    },
    futureSources: ['PM Gati Shakti National Master Plan layers', 'Bhuvan (NRSC / ISRO)', 'Survey of India', 'State cadastral maps'],
  },
  administrativeUnits: {
    label: 'Administrative units',
    description: 'Official codes and names for states, districts, sub-districts and villages.',
    methods: {
      getUnit: { input: '{ level, name, parent }', returns: '{ name, level, lgdCode }' },
    },
    futureSources: ['Local Government Directory (LGD)'],
  },
};

export const PROVIDER_KINDS = Object.keys(PROVIDER_CONTRACTS);

/** Throws when an adapter does not implement its contract. */
export function assertImplements(kind, adapter) {
  const contract = PROVIDER_CONTRACTS[kind];
  if (!contract) throw new Error(`Unknown provider kind "${kind}"`);
  const missing = Object.keys(contract.methods).filter((m) => typeof adapter[m] !== 'function');
  if (missing.length) throw new Error(`Adapter "${adapter.id}" for ${kind} is missing: ${missing.join(', ')}`);
  if (!DATA_MODES[adapter.mode]) throw new Error(`Adapter "${adapter.id}" declares unknown mode "${adapter.mode}"`);
  return adapter;
}

export const envelope = (kind, adapter, data, source) => ({
  data,
  provenance: {
    kind,
    adapter: adapter.id,
    mode: adapter.mode,
    label: DATA_MODES[adapter.mode].label,
    source,
    retrievedAt: new Date().toISOString(),
  },
});
