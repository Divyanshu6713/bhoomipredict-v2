/**
 * Roles, permissions and the demonstration user directory.
 *
 * A role decides two things, both enforced server-side:
 *   permissions  which write actions the user may take
 *   focus        which intervention and alert categories are theirs to act on
 *
 * Scope comes from the user's position in the administrative hierarchy
 * (server/domain/hierarchy.mjs), not from the role, so the same role can be
 * held nationally, in a zone, a state or a district, and an organisation's
 * portfolio (a sector ministry, a central organisation, a state department)
 * narrows what it sees.
 *
 * The directory holds demonstration profiles so the platform can be evaluated
 * role by role without an identity provider. They are labelled as such in the
 * UI; a production deployment would authenticate through the government SSO
 * and map directory attributes onto these same roles and positions.
 */
import { resolvePosition, projectInPosition, organisationById } from './hierarchy.mjs';

export const PERMISSIONS = [
  'project.create',
  'project.edit',
  'project.delete',
  'project.advanceStage',
  'data.upload',
  'model.retrain',
  'intervention.update',
  'intervention.assign',
  'alert.update',
  'case.update',
  'document.upload',
  'document.review',
  'audit.view',
  'admin.view',
  'learning.record',
  'notification.manage',
  'integration.manage',
];

/** Intervention / alert categories. */
export const CATEGORIES = [
  'risk',
  'schedule',
  'dependency',
  'compensation',
  'legal',
  'documentation',
  'approval',
  'rr',
  'stakeholder',
  'coordination',
  'backlog',
  'possession',
];

/**
 * `tiers` lists the administrative tiers a role is normally held at; a
 * configured demo position outside them is refused.
 */
export const ROLES = {
  NATIONAL_ADMIN: {
    label: 'National Administrator',
    tiers: ['national'],
    permissions: PERMISSIONS,
    focus: CATEGORIES,
    summary: 'Portfolio-wide oversight, data and model administration.',
  },
  SECTOR_NODAL_OFFICER: {
    label: 'Ministry / Organisation Nodal Officer',
    tiers: ['national', 'region', 'state'],
    permissions: ['intervention.update', 'intervention.assign', 'alert.update', 'document.review', 'audit.view'],
    focus: ['risk', 'schedule', 'dependency', 'approval', 'coordination'],
    summary: 'Sector or organisation portfolio: cross-state bottlenecks, clearances and escalations.',
  },
  STATE_ADMIN: {
    label: 'State Administrator',
    tiers: ['state'],
    permissions: ['project.create', 'project.edit', 'project.advanceStage', 'data.upload', 'intervention.update', 'intervention.assign', 'alert.update', 'case.update', 'document.upload', 'document.review', 'audit.view', 'admin.view', 'learning.record', 'notification.manage', 'integration.manage'],
    focus: ['risk', 'schedule', 'dependency', 'coordination', 'approval', 'legal'],
    summary: 'State portfolio, cross-district bottlenecks and state-level approvals.',
  },
  DISTRICT_ADMIN: {
    label: 'District Administrator',
    tiers: ['division', 'district'],
    permissions: ['project.edit', 'project.advanceStage', 'intervention.update', 'intervention.assign', 'alert.update', 'case.update', 'document.upload', 'document.review', 'audit.view', 'learning.record'],
    focus: ['risk', 'schedule', 'dependency', 'coordination', 'approval', 'rr', 'backlog'],
    summary: 'Cross-department bottlenecks, escalations and high-risk projects in the district.',
  },
  LAND_ACQUISITION_OFFICER: {
    label: 'Land Acquisition Officer',
    tiers: ['district'],
    permissions: ['project.advanceStage', 'intervention.update', 'alert.update', 'case.update', 'document.upload', 'learning.record'],
    focus: ['compensation', 'backlog', 'possession', 'schedule', 'legal'],
    summary: 'Notifications, awards, compensation, case resolution and possession.',
  },
  PROJECT_AUTHORITY: {
    label: 'Project Implementing Agency',
    tiers: ['national', 'region', 'state', 'district'],
    permissions: ['intervention.update', 'alert.update', 'document.upload'],
    focus: ['risk', 'schedule', 'possession', 'dependency'],
    summary: 'Project progress, milestones, land availability and overall risk.',
  },
  LEGAL_OFFICER: {
    label: 'Legal Officer',
    tiers: ['state', 'district'],
    permissions: ['intervention.update', 'alert.update', 'case.update', 'document.upload'],
    focus: ['legal'],
    summary: 'Litigation, objections and references on compensation.',
  },
  REVENUE_OFFICER: {
    label: 'Revenue / Land Records Officer',
    tiers: ['district'],
    permissions: ['intervention.update', 'alert.update', 'case.update', 'document.upload', 'document.review'],
    focus: ['documentation', 'dependency'],
    summary: 'Land records, ownership, survey and documentation.',
  },
  FIELD_OFFICER: {
    label: 'Field Verification Officer',
    tiers: ['district'],
    permissions: ['intervention.update', 'case.update', 'document.upload'],
    focus: ['stakeholder', 'possession', 'documentation'],
    summary: 'Field verification, stakeholder follow-up and possession on the ground.',
  },
  API_CLIENT: {
    label: 'System integration (API key)',
    tiers: ['national', 'region', 'state', 'division', 'district'],
    permissions: [],
    focus: CATEGORIES,
    summary: 'A connected system acting through a scoped API key; its scopes, not a role, decide what it may do.',
  },
  POLICY_VIEWER: {
    label: 'Policy Viewer (read-only)',
    tiers: ['national', 'region', 'state', 'division', 'district'],
    permissions: [],
    focus: [],
    summary: 'Read-only access to analytics and reports.',
  },
};

/**
 * Demonstration directory. Names are illustrative personas, not real
 * officials. Each profile holds a position — an organisation from the
 * hierarchy catalogue plus the administrative units under it — and the
 * position alone decides jurisdiction.
 */
const at = (orgId, units = {}) => ({ orgId, units });

export const USERS = [
  { id: 'u-national', name: 'R. Menon', designation: 'Director, Central Land Acquisition Coordination Cell', role: 'NATIONAL_ADMIN', position: at('in:lacc') },
  { id: 'u-policy', name: 'T. Das', designation: 'Policy Analyst, Central Land Acquisition Coordination Cell', role: 'POLICY_VIEWER', position: at('in:lacc') },
  { id: 'u-morth', name: 'S. Bhattacharya', designation: 'Nodal Officer (Land Acquisition), MoRTH', role: 'SECTOR_NODAL_OFFICER', position: at('in:morth') },
  { id: 'u-dolr', name: 'L. Pillai', designation: 'Deputy Secretary (Land Acquisition Policy), DoLR', role: 'POLICY_VIEWER', position: at('in:dolr') },
  { id: 'u-moefcc', name: 'H. Negi', designation: 'Nodal Officer (Forest Diversion), MoEFCC', role: 'SECTOR_NODAL_OFFICER', position: at('in:moefcc') },
  { id: 'u-nhai-piu', name: 'D. Kulkarni', designation: 'Project Director, Project Implementation Unit', role: 'PROJECT_AUTHORITY', position: at('in:nhai') },
  { id: 'u-mor-sr', name: 'V. Raghavan', designation: 'Chief Administrative Officer (Construction), Southern Railway', role: 'SECTOR_NODAL_OFFICER', position: at('in:mor', { region: 'Southern Railway' }) },
  { id: 'u-mor-tiruppur', name: 'K. Selvam', designation: 'Railway Land Acquisition Liaison Officer, Tiruppur', role: 'PROJECT_AUTHORITY', position: at('in:mor', { region: 'Southern Railway', state: 'Tamil Nadu', district: 'Tiruppur' }) },
  { id: 'u-powergrid-wr', name: 'A. Joshi', designation: 'General Manager (Land & Right of Way), Western Region', role: 'PROJECT_AUTHORITY', position: at('in:powergrid', { region: 'Western Region' }) },
  { id: 'u-ka-state', name: 'K. Nagaraj', designation: 'State Nodal Officer (Land Acquisition)', role: 'STATE_ADMIN', position: at('st:KA:revenue', { state: 'Karnataka' }) },
  { id: 'u-ka-mandya-dc', name: 'S. Priya', designation: 'Deputy Commissioner, Mandya', role: 'DISTRICT_ADMIN', position: at('st:KA:revenue', { state: 'Karnataka', division: 'Mysuru Division', district: 'Mandya' }) },
  { id: 'u-ka-mandya-slao', name: 'M. Gowda', designation: 'Special Land Acquisition Officer, Mandya', role: 'LAND_ACQUISITION_OFFICER', position: at('st:KA:revenue', { state: 'Karnataka', division: 'Mysuru Division', district: 'Mandya' }) },
  { id: 'u-ka-mandya-sslr', name: 'A. Rao', designation: 'Deputy Director of Land Records, Mandya', role: 'REVENUE_OFFICER', position: at('st:KA:land-records', { state: 'Karnataka', division: 'Mysuru Division', district: 'Mandya' }) },
  { id: 'u-ka-legal', name: 'F. Khan', designation: 'Law Officer (Land Acquisition)', role: 'LEGAL_OFFICER', position: at('st:KA:law', { state: 'Karnataka' }) },
  { id: 'u-mh-state', name: 'P. Deshmukh', designation: 'State Nodal Officer (Land Acquisition)', role: 'STATE_ADMIN', position: at('st:MH:revenue', { state: 'Maharashtra' }) },
  { id: 'u-mh-nagpur-collector', name: 'R. Wankhede', designation: 'District Collector, Nagpur', role: 'DISTRICT_ADMIN', position: at('st:MH:revenue', { state: 'Maharashtra', division: 'Nagpur Division', district: 'Nagpur' }) },
  { id: 'u-up-state', name: 'V. Srivastava', designation: 'State Nodal Officer (Land Acquisition)', role: 'STATE_ADMIN', position: at('st:UP:revenue', { state: 'Uttar Pradesh' }) },
  { id: 'u-up-kanpur-dm', name: 'N. Tripathi', designation: 'District Magistrate, Kanpur Nagar', role: 'DISTRICT_ADMIN', position: at('st:UP:revenue', { state: 'Uttar Pradesh', district: 'Kanpur Nagar' }) },
  { id: 'u-up-kanpur-adm', name: 'P. Yadav', designation: 'Additional District Magistrate (Land Acquisition), Kanpur Nagar', role: 'LAND_ACQUISITION_OFFICER', position: at('st:UP:revenue', { state: 'Uttar Pradesh', district: 'Kanpur Nagar' }) },
  { id: 'u-up-kanpur-field', name: 'R. Verma', designation: 'Field Verification Officer (Revenue Inspector), Kanpur Nagar', role: 'FIELD_OFFICER', position: at('st:UP:revenue', { state: 'Uttar Pradesh', district: 'Kanpur Nagar' }) },
  { id: 'u-tn-highways', name: 'G. Murugan', designation: 'Chief Engineer (National Highways)', role: 'SECTOR_NODAL_OFFICER', position: at('st:TN:roads', { state: 'Tamil Nadu' }) },
  { id: 'u-br-state', name: 'A. Kumar', designation: 'State Nodal Officer (Land Acquisition)', role: 'STATE_ADMIN', position: at('st:BR:revenue', { state: 'Bihar' }) },
  { id: 'u-br-patna-dm', name: 'S. Sinha', designation: 'District Magistrate, Patna', role: 'DISTRICT_ADMIN', position: at('st:BR:revenue', { state: 'Bihar', district: 'Patna' }) },
];

const positionCache = new Map();

/** The resolved position (chain, scope, portfolio) for a user. */
export function positionOf(user) {
  const key = JSON.stringify(user.position);
  if (!positionCache.has(key)) positionCache.set(key, resolvePosition(user.position));
  return positionCache.get(key);
}

/** The department label (used by menus and audit entries) is the organisation's name. */
const withDepartment = (u) => ({ ...u, department: organisationById(u.position.orgId)?.name ?? '—' });

export const userById = (id) => {
  const u = USERS.find((x) => x.id === id);
  return u ? withDepartment(u) : null;
};

/** Roles that can be held at a tier when configuring a demo position. */
export const rolesForTier = (tier) =>
  Object.entries(ROLES)
    .filter(([id, r]) => id !== 'NATIONAL_ADMIN' && id !== 'API_CLIENT' && r.tiers.includes(tier))
    // Administrators of the tier first, then roles specific to few tiers before broad ones.
    .sort(([a, ra], [b, rb]) => Number(b.endsWith('_ADMIN')) - Number(a.endsWith('_ADMIN')) || ra.tiers.length - rb.tiers.length)
    .map(([id, r]) => ({ id, label: r.label, summary: r.summary, permissions: r.permissions.length }));

/**
 * A session-scoped demo officer for any position in the hierarchy. The role
 * must be one normally held at that tier; the id is derived from the position
 * and role so the audit trail groups repeated sign-ins.
 */
export function configuredUser({ role, position }) {
  if (!ROLES[role]) throw new Error(`Unknown role "${role}"`);
  if (role === 'NATIONAL_ADMIN') throw new Error('National Administrator is only available as a directory profile');
  const units = Object.fromEntries(Object.entries(position?.units ?? {}).filter(([, v]) => v));
  const clean = { orgId: position?.orgId, units };
  const resolved = resolvePosition(clean);
  if (!ROLES[role].tiers.includes(resolved.tier)) {
    const allowed = rolesForTier(resolved.tier).map((r) => r.label).join(', ');
    throw new Error(`${ROLES[role].label} is not held at ${resolved.tierLabel} level. Roles for this level: ${allowed}.`);
  }
  const idKey = [clean.orgId, units.region, units.state, units.division, units.district, role].filter(Boolean).join('|');
  const hash = Array.from(idKey).reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;
  return withDepartment({
    id: `u-demo-${hash.toString(36)}`,
    name: 'Demo Officer',
    designation: `${ROLES[role].label}, ${resolved.place}`,
    role,
    position: clean,
    configured: true,
  });
}

export const can = (user, permission) => Boolean(user && ROLES[user.role]?.permissions.includes(permission));

/** Whether a project falls inside the user's scope: geography from the position, portfolio from the organisation. */
export function inScope(user, project) {
  if (!user || !project) return false;
  return projectInPosition(positionOf(user), project);
}

/** True when the user sees every project (national tier with an unrestricted portfolio). */
export function isUnrestricted(user) {
  const pos = positionOf(user);
  return pos.tier === 'national' && !pos.portfolio.restricted;
}

/** Public view of a user, with role metadata and the resolved position, for the client. */
export function describeUser(user) {
  const role = ROLES[user.role];
  const pos = positionOf(user);
  return {
    id: user.id,
    name: user.name,
    designation: user.designation,
    department: user.department,
    role: user.role,
    roleLabel: role.label,
    state: pos.units.state,
    district: pos.units.district,
    scope: pos.tier,
    scopeLabel: pos.label,
    position: pos,
    permissions: role.permissions,
    focus: role.focus,
    roleSummary: role.summary,
    configured: Boolean(user.configured),
    demo: true,
  };
}

/** Which role acts on a dependency, by the dependency's category. */
export function roleForDependency(node) {
  switch (node?.category) {
    case 'land_records':
      return 'REVENUE_OFFICER';
    case 'acquisition_officer':
      return 'LAND_ACQUISITION_OFFICER';
    case 'dispute_forum':
      return 'LEGAL_OFFICER';
    case 'acquiring_body':
      return 'PROJECT_AUTHORITY';
    case 'clearance':
      return node.level === 'central' || node.level === 'state' ? 'STATE_ADMIN' : 'DISTRICT_ADMIN';
    default:
      return 'DISTRICT_ADMIN';
  }
}
