/** What each demo role sees. Used by the demo sign-in and the command center (need-to-know views). */
import type { RoleId } from './store';
import { openCases, highCases, alerts, segmentsToday, today, world } from './dataset';
import { TODAY } from './world';
import { useStore } from './store';

export interface RoleMeta {
  code: string;
  tier: string;
  scope: string;
  emphasis: string[];
  sees: string[];
  hidden: string[];
  showContributors: boolean;
}

export const ROLE_META: Record<RoleId, RoleMeta> = {
  admin: {
    code: 'ADM',
    tier: 'State cell',
    scope: 'All projects · synthetic state',
    emphasis: ['Alert center', 'Risk layer', 'Portfolio roll-up'],
    sees: ['Risk & bands', 'Contributors', 'Work fronts', 'Audit log'],
    hidden: ['Owner identities (pseudonymised)'],
    showContributors: true,
  },
  lao: {
    code: 'LAO',
    tier: 'District',
    scope: 'District D-07 · NH Corridor Demo',
    emphasis: ['Intervention queue', 'Compensation layer', 'Officer decisions'],
    sees: ['Risk & contributors', 'Suggested checks', 'Compensation status', 'Pseudonymous owner IDs'],
    hidden: ['Bank details', 'Identity numbers'],
    showContributors: true,
  },
  project: {
    code: 'PA',
    tier: 'Project',
    scope: 'NH Corridor Demo',
    emphasis: ['Work-front status', 'Construction dependency layer'],
    sees: ['Risk band', 'Stage', 'Work-front readiness'],
    hidden: ['Ownership details', 'Legal-case details', 'Case contributors'],
    showContributors: false,
  },
  gis: {
    code: 'GIS',
    tier: 'District',
    scope: 'District D-07 · survey',
    emphasis: ['Boundaries & land use', 'Parcel geometry'],
    sees: ['Parcel geometry', 'Land use', 'Administrative units', 'Stage'],
    hidden: ['Compensation details', 'Legal-case details'],
    showContributors: false,
  },
  legal: {
    code: 'LEG',
    tier: 'District',
    scope: 'District D-07 · legal cell',
    emphasis: ['Active legal matters', 'Litigation layer'],
    sees: ['Case status (active / closed)', 'Risk & contributors', 'Work-front impact'],
    hidden: ['Case documents', 'Compensation amounts'],
    showContributors: true,
  },
};

const activeLegal = openCases.filter((p) => p.acq!.legal && TODAY >= p.acq!.entries[3] && TODAY < p.acq!.entries[9]);
const compPending = openCases.filter((p) => today[p.idx].score!.compStatus.startsWith('Pending'));
const blockedFronts = segmentsToday.filter((s) => s.share < 0.8 && s.high >= 3);

/** Role-specific KPI strip for the command center. */
export function roleKpis(role: RoleId): { v: string; l: string; tone?: 'high' | 'med' | 'ok' }[] {
  const decisions = useStore.getState().audit.filter((a) => a.action.includes('checks reviewed')).length;
  switch (role) {
    case 'admin':
      return [
        { v: String(openCases.length), l: 'open cases' },
        { v: String(highCases.length), l: 'high risk', tone: 'high' },
        { v: String(alerts.length), l: 'alerts unassigned', tone: 'med' },
        { v: `Day ${TODAY}`, l: 'data snapshot' },
      ];
    case 'lao':
      return [
        { v: String(compPending.length), l: 'compensation pending', tone: 'med' },
        { v: String(openCases.filter((p) => today[p.idx].score!.rows[0].key === 'owner').length), l: 'ownership checks due' },
        { v: String(highCases.length), l: 'high-risk cases', tone: 'high' },
        { v: String(decisions), l: 'decisions recorded', tone: 'ok' },
      ];
    case 'project':
      return [
        { v: String(segmentsToday.filter((s) => s.share >= 0.8).length), l: 'work fronts ready', tone: 'ok' },
        { v: String(blockedFronts.length), l: 'fronts waiting on land', tone: 'high' },
        { v: String(world.row.length - openCases.length), l: 'parcels handed over' },
        { v: String(openCases.length), l: 'parcels pending' },
      ];
    case 'gis':
      return [
        { v: String(world.parcels.length), l: 'parcels mapped' },
        { v: String(world.row.length), l: 'in right-of-way' },
        { v: '6', l: 'admin units' },
        { v: 'Synthetic', l: 'geometry source', tone: 'med' },
      ];
    case 'legal':
      return [
        { v: String(activeLegal.length), l: 'active legal matters', tone: 'high' },
        { v: String(activeLegal.filter((p) => today[p.idx].band === 'high').length), l: 'in high-risk band' },
        { v: String(activeLegal.filter((p) => p.segment === 2).length), l: 'on work front C3', tone: 'med' },
        { v: 'Status only', l: 'case content', tone: 'ok' },
      ];
    default:
      return [];
  }
}

export function makeDemoId(role: RoleId) {
  const hex = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
  return `DEMO-${ROLE_META[role].code}-${hex}`;
}
