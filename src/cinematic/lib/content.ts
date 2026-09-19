/** Copy shared by the 3D scenes and the DOM, kept in one place so they never disagree. */
import { hero, today } from './dataset';

const S = today[hero.idx].score!;
const A = hero.acq!;

export const SIGNATURE_LAYERS = [
  {
    key: 'comp',
    layer: 'Compensation',
    driver: 'Compensation not initiated',
    check: 'Check payment file and beneficiary verification',
    owner: 'Compensation desk',
  },
  {
    key: 'owner',
    layer: 'Ownership',
    driver: `${A.unresolved}/${A.owners} ownership records unresolved`,
    check: 'Refer ownership conflict for record reconciliation / legal review',
    owner: 'Revenue records',
  },
  {
    key: 'legal',
    layer: 'Legal',
    driver: 'Active legal case',
    check: 'Check legal-case status and next hearing date',
    owner: 'Legal cell',
  },
  {
    key: 'idle',
    layer: 'Activity',
    driver: `${Math.round(S.idleDays)} days since last recorded action`,
    check: 'Check statutory prerequisites for possession',
    owner: 'Acquisition officer',
  },
] as const;

export const contributionOf = (key: string) => S.rows.find((r) => r.key === key)?.contribution ?? 0;

export const OFFICER_CHECKS = [
  { id: 'c1', text: 'Verify compensation / payment file', owner: 'Compensation desk' },
  { id: 'c2', text: 'Review ownership-record reconciliation', owner: 'Revenue records' },
  { id: 'c3', text: 'Check legal-case status', owner: 'Legal cell' },
  { id: 'c4', text: 'Review prerequisites for possession', owner: 'Acquisition officer' },
];

export const LIMITS = [
  {
    k: 'DATA',
    title: 'No standardized national labelled dataset.',
    body: 'Outcome labels (did a milestone slip, and by how much) are not published in one schema. This prototype uses synthetic data; real use needs labelled history under a data-sharing agreement.',
  },
  {
    k: 'LAW',
    title: 'Different legal regimes and state workflows.',
    body: 'Central and state acquisition laws, and highway-specific procedures, order stages differently. Stage models and checks must be configured per regime and reviewed by legal experts.',
  },
  {
    k: 'MODEL',
    title: 'Predictions require validation.',
    body: 'Synthetic data can demonstrate the pipeline, not accuracy. Any real model needs out-of-time validation, calibration checks and monitoring before anyone relies on a score.',
  },
  {
    k: 'BIAS',
    title: 'Historical data may contain institutional bias.',
    body: 'If some areas were historically slower for reasons unrelated to the case, a model can learn that pattern. Area-level features need fairness review; scores must never rank people.',
  },
  {
    k: 'PRIVACY',
    title: 'Land and legal information can be sensitive.',
    body: 'Owner identity, disputes and compensation are personal. The design keeps pseudonymous IDs, role-based access, and no Aadhaar, bank details or unmasked names in the analytics layer.',
  },
  {
    k: 'HUMAN REVIEW',
    title: 'AI does not replace legal or administrative judgment.',
    body: 'Scores prioritise attention. Every suggested check is reviewed, and every decision is taken — and recorded — by an authorised officer.',
  },
];

export const ECOSYSTEM = [
  {
    id: 'dilrmp',
    name: 'DILRMP',
    what: 'Land-record modernization',
    gives: 'Records of rights, mutation status',
  },
  {
    id: 'bhoomirashi',
    name: 'Bhoomi Rashi',
    what: 'National Highway acquisition notification workflow',
    gives: 'Notification stage and dates',
  },
  {
    id: 'naksha',
    name: 'NAKSHA',
    what: 'Geospatial urban land surveys',
    gives: 'Parcel geometry (urban areas)',
  },
  {
    id: 'courts',
    name: 'eCourts / RCCMS',
    what: 'Civil-court and revenue-court case information',
    gives: 'Case status, next hearing',
  },
  {
    id: 'pmg',
    name: 'PM Gati Shakti',
    what: 'Project monitoring (PMG portal) and master-plan layers',
    gives: 'Project milestones, issues',
  },
  {
    id: 'gis',
    name: 'State GIS',
    what: 'Cadastral and land-use layers',
    gives: 'Boundaries, land use',
  },
  {
    id: 'comp',
    name: 'PFMS / treasury',
    what: 'Award deposit and disbursement records',
    gives: 'Payment status (aggregated)',
  },
];

export const OUTPUTS = ['Risk', 'Explanation', 'Prioritization', 'Alerts', 'Intervention Queue'];

export const PLATFORM_LAYERS = [
  { k: 'AUDIT', purpose: 'Every score, view and officer decision is logged in a tamper-evident chain.' },
  { k: 'WORKFLOW', purpose: 'Turns suggested checks into assigned, tracked, human-reviewed tasks.' },
  { k: 'RISK', purpose: 'Calibrated probability that the next milestone is missed, with bands and trends.' },
  { k: 'EXPLAINABILITY', purpose: 'Shows which features contributed most to the model prediction.' },
  { k: 'ML', purpose: 'Baseline and tree models trained on validated features, versioned and monitored.' },
  { k: 'DATA', purpose: 'Validated, versioned acquisition records with data-quality flags.' },
  { k: 'GIS', purpose: 'Parcels, corridors, boundaries and work fronts as spatial layers.' },
];

export const SECURITY = [
  { k: 'Pseudonymous IDs', d: 'Owners and parcels are keyed by generated IDs, never names.' },
  { k: 'Role-Based Access', d: 'Each role sees only the fields its work needs.' },
  { k: 'Audit Logs', d: 'Hash-chained record of logins, edits and every officer decision.' },
  { k: 'Encryption (production)', d: 'TLS in transit and encrypted storage are the production path — this local prototype does not include them yet.' },
  { k: 'Dataset Versioning', d: 'Every model version records a hash of the data it was trained on.' },
  { k: 'Model Versioning', d: 'Every score points to the model version that produced it.' },
  { k: 'Input Validation', d: 'Schema, range and consistency checks before scoring.' },
  { k: 'No Aadhaar', d: 'Identity numbers never enter the analytics layer.' },
  { k: 'No Bank Details', d: 'Payment status only — never account data.' },
  { k: 'No Unmasked Owner Names', d: 'Names are masked or replaced before analysis.' },
];
