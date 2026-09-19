/** Acquisition lifecycle used by the timeline, the parcel data and the chain. */
export const STAGES = [
  'Identification',
  'Verification',
  'Survey',
  'Notification',
  'Objection',
  'Valuation',
  'Award',
  'Payment',
  'Litigation',
  'R&R',
  'Possession',
  'Handover',
] as const;
export type StageName = (typeof STAGES)[number];
export const COMPLETE = STAGES.length; // index 12 = handed over / complete

export const stageLabel = (i: number) => (i >= COMPLETE ? 'Handed over' : STAGES[i]);

/** Coarser phase label used in cards ("Stage: Compensation"). */
export function phaseLabel(i: number) {
  if (i >= COMPLETE) return 'Handed over';
  if (i >= 5 && i <= 7) return 'Compensation';
  if (i === 4) return 'Objections & Hearing';
  if (i === 1) return 'Ownership Verification';
  if (i === 0) return 'Parcel Identification';
  if (i === 9) return 'Rehabilitation & Resettlement';
  return STAGES[i];
}

/** Documents / records a user would expect to see at each stage (generic, not state-specific). */
export const STAGE_DOCS: Record<number, string[]> = {
  0: ['Alignment plan (draft)', 'Affected-parcel schedule'],
  1: ['Record-of-rights extracts', 'Mutation history', 'Ownership reconciliation sheet'],
  2: ['Joint measurement survey', 'Parcel sketch & GIS polygon'],
  3: ['Preliminary notification', 'Public notice log'],
  4: ['Objection register', 'Hearing schedule & minutes'],
  5: ['Valuation worksheet', 'Market-rate reference'],
  6: ['Award statement', 'Beneficiary list'],
  7: ['Payment file', 'Beneficiary verification', 'Disbursement ledger'],
  8: ['Case register entry', 'Hearing dates', 'Interim orders (status only)'],
  9: ['Family survey', 'R&R entitlement list', 'Resettlement progress'],
  10: ['Possession checklist', 'Statutory prerequisite check'],
  11: ['Handover memo', 'Work-front release note'],
};

/** Base durations (days) before per-parcel multipliers. */
export const BASE_DAYS = [34, 52, 44, 58, 50, 58, 42, 50, 0, 0, 36, 22];

/** The 10-node chain used in "Land acquisition is a chain". */
export interface ChainNode {
  id: string;
  label: string;
  short: string;
  blurb: string;
  signals: string[];
  /** direct dependents (ids) */
  feeds: string[];
}

export const CHAIN: ChainNode[] = [
  {
    id: 'ident',
    label: 'Parcel Identification',
    short: 'Identify',
    blurb: 'Alignment is fixed and affected parcels are listed. Errors here travel down every later stage.',
    signals: ['Parcel count vs alignment', 'Unmapped parcels'],
    feeds: ['owner', 'survey'],
  },
  {
    id: 'owner',
    label: 'Ownership Verification',
    short: 'Verify',
    blurb: 'Records of rights are reconciled. Unresolved ownership can block who gets paid, and when.',
    signals: ['Unresolved records', 'Shared / disputed titles'],
    feeds: ['comp', 'notify'],
  },
  {
    id: 'survey',
    label: 'Survey',
    short: 'Survey',
    blurb: 'Joint measurement fixes area and structures. Disputed measurements reopen valuation later.',
    signals: ['Area mismatch', 'Re-survey requests'],
    feeds: ['notify', 'rr'],
  },
  {
    id: 'notify',
    label: 'Notification',
    short: 'Notify',
    blurb: 'Statutory notifications start the formal clock. Late notification compresses everything after it.',
    signals: ['Approval delay', 'Publication gaps'],
    feeds: ['object'],
  },
  {
    id: 'object',
    label: 'Objections & Hearing',
    short: 'Hear',
    blurb: 'Objections are heard and disposed of. Open objections hold up the award.',
    signals: ['Objections filed', 'Hearings pending'],
    feeds: ['comp', 'legal'],
  },
  {
    id: 'comp',
    label: 'Compensation',
    short: 'Compensate',
    blurb: 'Pending compensation can become a dependency for possession.',
    signals: ['Payment not initiated', 'Beneficiary verification'],
    feeds: ['poss', 'legal'],
  },
  {
    id: 'legal',
    label: 'Litigation',
    short: 'Litigate',
    blurb: 'Court or revenue-court cases can pause possession for a parcel — and its neighbours on the work front.',
    signals: ['Active case', 'Next hearing date'],
    feeds: ['poss'],
  },
  {
    id: 'rr',
    label: 'Rehabilitation & Resettlement',
    short: 'R&R',
    blurb: 'Affected families must be resettled before possession where the law requires it.',
    signals: ['Families pending', 'Entitlements unpaid'],
    feeds: ['poss'],
  },
  {
    id: 'poss',
    label: 'Possession',
    short: 'Possess',
    blurb: 'Possession needs its statutory prerequisites met. It is where upstream delay becomes visible.',
    signals: ['Prerequisites unmet', 'Days since last action'],
    feeds: ['hand'],
  },
  {
    id: 'hand',
    label: 'Handover',
    short: 'Handover',
    blurb: 'Land is handed to the project. One missing parcel can keep a whole construction work front closed.',
    signals: ['Work-front continuity', 'Parcels still pending'],
    feeds: ['build'],
  },
];

/** Construction is shown as the terminal dependency, not a chain node. */
export const CONSTRUCTION = { id: 'build', label: 'Construction work front' };

export function downstream(id: string): Set<string> {
  const out = new Set<string>();
  const walk = (k: string) => {
    const n = CHAIN.find((c) => c.id === k);
    if (!n) return;
    for (const f of n.feeds) {
      if (!out.has(f)) {
        out.add(f);
        walk(f);
      }
    }
  };
  walk(id);
  return out;
}
