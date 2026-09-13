/**
 * Roles, permissions and the demonstration user directory.
 *
 * A role decides three things, all enforced server-side:
 *   scope        which projects the user sees (national / state / district / authority)
 *   permissions  which write actions the user may take
 *   focus        which intervention and alert categories are theirs to act on
 *
 * The directory holds demonstration profiles so the platform can be evaluated
 * role by role without an identity provider. They are labelled as such in the
 * UI; a production deployment would authenticate through the government SSO
 * and map directory attributes onto these same roles.
 */

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

export const ROLES = {
  NATIONAL_ADMIN: {
    label: 'National Administrator',
    scope: 'national',
    permissions: PERMISSIONS,
    focus: CATEGORIES,
    summary: 'Portfolio-wide oversight, data and model administration.',
  },
  STATE_ADMIN: {
    label: 'State Administrator',
    scope: 'state',
    permissions: ['project.create', 'project.edit', 'project.advanceStage', 'data.upload', 'intervention.update', 'intervention.assign', 'alert.update', 'case.update', 'document.upload', 'document.review', 'audit.view', 'admin.view'],
    focus: ['risk', 'schedule', 'dependency', 'coordination', 'approval', 'legal'],
    summary: 'State portfolio, cross-district bottlenecks and state-level approvals.',
  },
  DISTRICT_ADMIN: {
    label: 'District Administrator',
    scope: 'district',
    permissions: ['project.edit', 'project.advanceStage', 'intervention.update', 'intervention.assign', 'alert.update', 'case.update', 'document.upload', 'document.review', 'audit.view'],
    focus: ['risk', 'schedule', 'dependency', 'coordination', 'approval', 'rr', 'backlog'],
    summary: 'Cross-department bottlenecks, escalations and high-risk projects in the district.',
  },
  LAND_ACQUISITION_OFFICER: {
    label: 'Land Acquisition Officer',
    scope: 'district',
    permissions: ['project.advanceStage', 'intervention.update', 'alert.update', 'case.update', 'document.upload'],
    focus: ['compensation', 'backlog', 'possession', 'schedule', 'legal'],
    summary: 'Notifications, awards, compensation, case resolution and possession.',
  },
  PROJECT_AUTHORITY: {
    label: 'Project Implementing Agency',
    scope: 'authority',
    permissions: ['intervention.update', 'alert.update', 'document.upload'],
    focus: ['risk', 'schedule', 'possession', 'dependency'],
    summary: 'Project progress, milestones, land availability and overall risk.',
  },
  LEGAL_OFFICER: {
    label: 'Legal Officer',
    scope: 'state',
    permissions: ['intervention.update', 'alert.update', 'case.update', 'document.upload'],
    focus: ['legal'],
    summary: 'Litigation, objections and references on compensation.',
  },
  REVENUE_OFFICER: {
    label: 'Revenue / Land Records Officer',
    scope: 'district',
    permissions: ['intervention.update', 'alert.update', 'case.update', 'document.upload', 'document.review'],
    focus: ['documentation', 'dependency'],
    summary: 'Land records, ownership, survey and documentation.',
  },
  FIELD_OFFICER: {
    label: 'Field Verification Officer',
    scope: 'district',
    permissions: ['intervention.update', 'case.update', 'document.upload'],
    focus: ['stakeholder', 'possession', 'documentation'],
    summary: 'Field verification, stakeholder follow-up and possession on the ground.',
  },
  POLICY_VIEWER: {
    label: 'Policy Viewer (read-only)',
    scope: 'national',
    permissions: [],
    focus: [],
    summary: 'Read-only access to analytics and reports.',
  },
};

/**
 * Demonstration directory. Names are illustrative personas, not real
 * officials; departments and designations follow the authority registry.
 */
export const USERS = [
  { id: 'u-national', name: 'R. Menon', designation: 'Director, National Land Acquisition Monitoring Cell', department: 'National Monitoring Cell', role: 'NATIONAL_ADMIN', state: null, district: null },
  { id: 'u-ka-state', name: 'K. Nagaraj', designation: 'State Nodal Officer (Land Acquisition)', department: 'Revenue Department, Government of Karnataka', role: 'STATE_ADMIN', state: 'Karnataka', district: null },
  { id: 'u-ka-mandya-dc', name: 'S. Priya', designation: 'Deputy Commissioner, Mandya', department: 'District Administration, Mandya', role: 'DISTRICT_ADMIN', state: 'Karnataka', district: 'Mandya' },
  { id: 'u-ka-mandya-slao', name: 'M. Gowda', designation: 'Special Land Acquisition Officer, Mandya', department: 'Revenue Department, Government of Karnataka', role: 'LAND_ACQUISITION_OFFICER', state: 'Karnataka', district: 'Mandya' },
  { id: 'u-ka-mandya-sslr', name: 'A. Rao', designation: 'Deputy Director of Land Records, Mandya', department: 'Survey, Settlement and Land Records (SSLR) Department', role: 'REVENUE_OFFICER', state: 'Karnataka', district: 'Mandya' },
  { id: 'u-ka-legal', name: 'F. Khan', designation: 'Law Officer (Land Acquisition)', department: 'Law Department, Government of Karnataka', role: 'LEGAL_OFFICER', state: 'Karnataka', district: null },
  { id: 'u-up-state', name: 'V. Srivastava', designation: 'State Nodal Officer (Land Acquisition)', department: 'Revenue Department, Government of Uttar Pradesh', role: 'STATE_ADMIN', state: 'Uttar Pradesh', district: null },
  { id: 'u-up-kanpur-dm', name: 'N. Tripathi', designation: 'District Magistrate, Kanpur Nagar', department: 'District Administration, Kanpur Nagar', role: 'DISTRICT_ADMIN', state: 'Uttar Pradesh', district: 'Kanpur Nagar' },
  { id: 'u-up-kanpur-adm', name: 'P. Yadav', designation: 'Additional District Magistrate (Land Acquisition), Kanpur Nagar', department: 'Revenue Department, Government of Uttar Pradesh', role: 'LAND_ACQUISITION_OFFICER', state: 'Uttar Pradesh', district: 'Kanpur Nagar' },
  { id: 'u-up-kanpur-field', name: 'R. Verma', designation: 'Field Verification Officer (Revenue Inspector), Kanpur Nagar', department: 'Revenue Department, Government of Uttar Pradesh', role: 'FIELD_OFFICER', state: 'Uttar Pradesh', district: 'Kanpur Nagar' },
  { id: 'u-nhai-piu', name: 'D. Kulkarni', designation: 'Project Director, Project Implementation Unit', department: 'National Highways Authority of India (NHAI)', role: 'PROJECT_AUTHORITY', state: null, district: null, authority: 'National Highways Authority of India (NHAI)' },
  { id: 'u-policy', name: 'T. Das', designation: 'Policy Analyst', department: 'Policy & Planning Unit', role: 'POLICY_VIEWER', state: null, district: null },
];

export const userById = (id) => USERS.find((u) => u.id === id) ?? null;

export const can = (user, permission) => Boolean(user && ROLES[user.role]?.permissions.includes(permission));

/** Whether a project falls inside the user's scope. */
export function inScope(user, project) {
  if (!user) return false;
  const role = ROLES[user.role];
  switch (role?.scope) {
    case 'national':
      return true;
    case 'state':
      return project.state === user.state;
    case 'district':
      return project.state === user.state && (project.districts ?? [project.district]).includes(user.district);
    case 'authority':
      return project.authority === user.authority || (project.network?.nodes ?? []).some((n) => n.name === user.authority);
    default:
      return false;
  }
}

/** Public view of a user, with role metadata, for the client. */
export function describeUser(user) {
  const role = ROLES[user.role];
  return {
    ...user,
    roleLabel: role.label,
    scope: role.scope,
    scopeLabel:
      role.scope === 'national'
        ? 'All India'
        : role.scope === 'state'
          ? user.state
          : role.scope === 'district'
            ? `${user.district}, ${user.state}`
            : user.authority,
    permissions: role.permissions,
    focus: role.focus,
    roleSummary: role.summary,
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
