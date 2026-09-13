/**
 * Reference enumerations for the synthetic corpus.
 *
 * Geography (states, districts, sub-districts, coordinates) lives in
 * server/domain/geography.mjs, built from real administrative boundaries.
 * Project types, frameworks and authorities live in server/domain/registry.mjs.
 * This file keeps only the lifecycle timing profile and the case-level
 * vocabularies. Nothing here is derived from an official acquisition record —
 * see the prototype data notice in README.md.
 */
export { LIFECYCLE_STAGES } from '../../server/domain/registry.mjs';

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

/** Framework-neutral milestone wording; framework-specific wording comes from the registry. */
export const STAGE_MILESTONE = {
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

export const TEHSIL_FALLBACK = ['Sadar', 'North', 'South', 'East', 'West', 'Rural'];

export const VILLAGE_PREFIX = [
  'Rampur', 'Nandgaon', 'Kesarpura', 'Bhojpur', 'Chandanpur', 'Devgarh', 'Sultanpur',
  'Hirapur', 'Basantpur', 'Mahadevpura', 'Kothari', 'Gopalpura', 'Narsingpur', 'Anandpur',
  'Shivpura', 'Kalyanpur', 'Jamalpur', 'Sonpur', 'Tilakpur', 'Madhavpur', 'Barkheda',
  'Lakhanpur', 'Sitapur', 'Gangapur', 'Amarpur', 'Veerapura', 'Doddanahalli', 'Halepura',
  'Ratanpur', 'Mohanpura', 'Jalalpur', 'Karanpur', 'Bhagwanpura', 'Nayagaon', 'Salempur',
  'Chikkanahalli', 'Thimmapura', 'Pimpalgaon', 'Wadgaon', 'Shirsgaon', 'Kolhapura', 'Bhagatpur',
];

export const VILLAGE_SUFFIX = ['Khurd', 'Kalan', 'Buzurg', '', '', '', 'Tanda', 'Bazar', 'Pahadi', ''];

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
