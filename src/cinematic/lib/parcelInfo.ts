import { world, today } from './dataset';
import { phaseLabel, stageLabel, COMPLETE } from './stages';
import { segmentName, ADMIN_UNITS } from './world';
import type { FeatureKey } from './model';

export const CHECK_FOR: Record<FeatureKey, string> = {
  comp: 'Verify compensation / payment file',
  owner: 'Review ownership-record reconciliation',
  legal: 'Check legal-case status',
  idle: 'Confirm the next scheduled action and responsible desk',
  rr: 'Review R&R entitlement progress',
  notif: 'Check notification / approval file',
  objections: 'Check hearing and objection disposal',
  response: 'Schedule a stakeholder meeting',
  hist: 'Compare with area benchmark',
  area: 'Routine review',
  families: 'Review R&R entitlement list',
  ptype: 'Routine review',
};

export function parcelInfo(idx: number) {
  const p = world.parcels[idx];
  const snap = today[idx];
  const base = {
    id: p.id,
    area: `${p.areaHa.toFixed(2)} ha`,
    village: ADMIN_UNITS[p.village].name,
    landUse: p.landUse,
    inScope: !!p.acq,
  };
  if (!p.acq || !snap.score) {
    return { ...base, stage: 'Not in acquisition scope', phase: '—', risk: null, band: null, contributors: [], next: null, status: 'Context parcel', segment: null };
  }
  const s = snap.score;
  const done = snap.stage >= COMPLETE;
  const contributors = done ? [] : s.rows.filter((r) => r.contribution > 0.05).slice(0, 3);
  return {
    ...base,
    stage: stageLabel(snap.stage),
    phase: phaseLabel(snap.stage),
    risk: done ? null : s.p,
    band: snap.band,
    contributors,
    next: done ? null : contributors[0] ? CHECK_FOR[contributors[0].key] : 'Routine review',
    nextMilestone: s.nextMilestone,
    status: done ? 'Handed over' : s.compStatus.startsWith('Pending') ? 'Pending' : 'In progress',
    segment: segmentName(p.segment),
  };
}
