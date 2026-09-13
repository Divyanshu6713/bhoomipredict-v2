/**
 * Administrative hierarchy: organisations, administrative levels and units.
 *
 * Government bodies do not share one shape. A central ministry works
 * Country → Ministry → State → District; a central organisation may add its
 * own Region / Zone; a state department works State → Department → Division
 * → District. This module keeps those shapes as data:
 *
 *   ADMIN_LEVELS          every level the platform knows, and whether it is geographic
 *   HIERARCHY_TEMPLATES   ordered level paths, one per kind of organisation
 *   SECTORS               infrastructure sectors, their sector ministry and project types
 *   organisations()       central catalogue + a generated set for every State / UT
 *   levelOptions()        progressive choices for one level given the levels above it
 *   resolvePosition()     a user's organisation + selected units → scope (states, districts, portfolio)
 *   projectInPosition()   whether a project falls inside that scope
 *
 * Adding a ministry, a central organisation or a state department is a
 * catalogue entry. Nothing here holds acquisition records; units carry an
 * `lgdCode` slot that stays empty until the Local Government Directory
 * integration is connected.
 */
import { STATES_AND_UTS, GRID_REGIONS, REVENUE_DIVISIONS, stateCode, stateGovernmentName, stateInfo } from './india.mjs';
import { PROJECT_TYPES, authorityOptions, stateProfile } from './registry.mjs';
import { districtIndex, resolveDistrict } from './geography.mjs';

/* =================================================================== levels */

export const ADMIN_LEVELS = {
  country: { id: 'country', label: 'Country', geographic: true },
  ministry: { id: 'ministry', label: 'Ministry / Department', geographic: false },
  organisation: { id: 'organisation', label: 'Organisation', geographic: false },
  region: { id: 'region', label: 'Region / Zone', geographic: true, optional: true },
  state: { id: 'state', label: 'State / UT', geographic: true },
  department: { id: 'department', label: 'State Department / Agency', geographic: false },
  division: { id: 'division', label: 'Division', geographic: true, optional: true },
  district: { id: 'district', label: 'District', geographic: true },
  project: { id: 'project', label: 'Project', geographic: false },
};

export const HIERARCHY_TEMPLATES = {
  national_authority: { id: 'national_authority', label: 'National authority', levels: ['country', 'state', 'district', 'project'] },
  central_ministry: { id: 'central_ministry', label: 'Central ministry', levels: ['country', 'ministry', 'state', 'district', 'project'] },
  central_ministry_zonal: { id: 'central_ministry_zonal', label: 'Central ministry with zones', levels: ['country', 'ministry', 'region', 'state', 'district', 'project'] },
  central_organisation: { id: 'central_organisation', label: 'Central organisation', levels: ['country', 'ministry', 'organisation', 'state', 'district', 'project'] },
  central_organisation_regional: { id: 'central_organisation_regional', label: 'Central organisation with regional offices', levels: ['country', 'ministry', 'organisation', 'region', 'state', 'district', 'project'] },
  state_government: { id: 'state_government', label: 'State government', levels: ['country', 'state', 'division', 'district', 'project'] },
  state_department: { id: 'state_department', label: 'State department', levels: ['country', 'state', 'department', 'division', 'district', 'project'] },
  state_agency: { id: 'state_agency', label: 'State agency', levels: ['country', 'state', 'department', 'district', 'project'] },
};

export const AUTHORITY_TIERS = [
  { id: 'national', label: 'National', description: 'All States and Union Territories' },
  { id: 'region', label: 'Region / Zone', description: 'A group of States, or a zone of a central organisation' },
  { id: 'state', label: 'State / UT', description: 'One State or Union Territory' },
  { id: 'division', label: 'Division', description: 'A revenue division within a State' },
  { id: 'district', label: 'District', description: 'One district' },
];

/* ================================================================== sectors */

export const SECTORS = [
  { id: 'roads', label: 'Roads & Highways', ministryId: 'in:morth', projectTypes: ['National Highway', 'Expressway'] },
  { id: 'railways', label: 'Railways', ministryId: 'in:mor', projectTypes: ['Railway'] },
  { id: 'urban', label: 'Urban Infrastructure & Metro', ministryId: 'in:mohua', projectTypes: ['Metro Rail', 'Urban Infrastructure'] },
  { id: 'water', label: 'Irrigation & Water Resources', ministryId: 'in:mojs', projectTypes: ['Irrigation'] },
  { id: 'power', label: 'Power Transmission', ministryId: 'in:mop', projectTypes: ['Power Transmission'] },
  { id: 'renewables', label: 'Renewable Energy', ministryId: 'in:mnre', projectTypes: ['Renewable Energy'] },
  { id: 'industry', label: 'Industrial Corridors & Parks', ministryId: 'in:moci', projectTypes: ['Industrial'] },
  { id: 'petroleum', label: 'Oil & Gas Pipelines', ministryId: 'in:mopng', projectTypes: ['Pipeline'] },
  { id: 'aviation', label: 'Civil Aviation', ministryId: 'in:moca', projectTypes: ['Airport'] },
  { id: 'ports', label: 'Ports & Waterways', ministryId: 'in:mopsw', projectTypes: [] },
  { id: 'coal', label: 'Coal', ministryId: 'in:mocoal', projectTypes: [] },
  { id: 'defence', label: 'Defence Infrastructure', ministryId: 'in:mod', projectTypes: [] },
];

export const sectorById = (id) => SECTORS.find((s) => s.id === id) ?? null;
export const sectorForType = (projectType) => SECTORS.find((s) => s.id === PROJECT_TYPES[projectType]?.sector) ?? null;

// Every project type must belong to exactly one sector; fail loudly at load rather than mis-group a portfolio.
for (const [name, t] of Object.entries(PROJECT_TYPES)) {
  const owners = SECTORS.filter((s) => s.projectTypes.includes(name));
  if (owners.length !== 1 || owners[0].id !== t.sector) throw new Error(`Project type "${name}" must belong to exactly one sector (declared: ${t.sector})`);
}

/* ============================================================ organisations */

/**
 * Portfolio: which projects an organisation is concerned with. Any listed
 * matcher may admit a project:
 *   all            every project
 *   projectTypes   project type in the list
 *   frameworks     acquisition framework id in the list
 *   authorities    acquiring body, or a body in its dependency network, named exactly
 *   nodePattern    a body in the dependency network whose name contains the text
 *   dependencies   the dependency network contains the code
 * Geography is applied separately, from the position's selected units.
 */
const sectorTypes = (...ids) => ids.flatMap((id) => sectorById(id).projectTypes);

const CENTRAL_ORGANISATIONS = [
  {
    id: 'in:goi',
    name: 'Government of India',
    short: 'GoI',
    kind: 'government',
    parentId: null,
    template: 'national_authority',
    portfolio: { all: true },
    description: 'Union Government. Top of the national hierarchy; ministries and central organisations sit beneath it.',
  },
  {
    id: 'in:lacc',
    name: 'Central Land Acquisition Coordination Cell',
    short: 'Coordination Cell',
    kind: 'coordinating_authority',
    parentId: 'in:goi',
    template: 'national_authority',
    portfolio: { all: true },
    illustrative: true,
    description:
      'Illustrative national coordinating authority used by this prototype for cross-sector monitoring. In deployment it maps to whichever body the Government of India designates.',
  },
  { id: 'in:morth', name: 'Ministry of Road Transport & Highways', short: 'MoRTH', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'roads', portfolio: { projectTypes: sectorTypes('roads') } },
  { id: 'in:mor', name: 'Ministry of Railways', short: 'MoR', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry_zonal', regions: 'railway_zones', sector: 'railways', portfolio: { projectTypes: sectorTypes('railways') } },
  { id: 'in:mop', name: 'Ministry of Power', short: 'MoP', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'power', portfolio: { projectTypes: sectorTypes('power') } },
  { id: 'in:mnre', name: 'Ministry of New & Renewable Energy', short: 'MNRE', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'renewables', portfolio: { projectTypes: sectorTypes('renewables') } },
  { id: 'in:mohua', name: 'Ministry of Housing & Urban Affairs', short: 'MoHUA', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'urban', portfolio: { projectTypes: sectorTypes('urban') } },
  { id: 'in:mojs', name: 'Ministry of Jal Shakti', short: 'MoJS', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'water', portfolio: { projectTypes: sectorTypes('water') } },
  { id: 'in:moci', name: 'Ministry of Commerce & Industry', short: 'MoC&I', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'industry', portfolio: { projectTypes: sectorTypes('industry') } },
  { id: 'in:mopng', name: 'Ministry of Petroleum & Natural Gas', short: 'MoPNG', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'petroleum', portfolio: { projectTypes: sectorTypes('petroleum') } },
  { id: 'in:moca', name: 'Ministry of Civil Aviation', short: 'MoCA', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'aviation', portfolio: { projectTypes: sectorTypes('aviation') } },
  { id: 'in:mopsw', name: 'Ministry of Ports, Shipping & Waterways', short: 'MoPSW', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'ports', portfolio: { projectTypes: [] } },
  { id: 'in:mocoal', name: 'Ministry of Coal', short: 'MoCoal', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'coal', portfolio: { projectTypes: [] } },
  { id: 'in:mod', name: 'Ministry of Defence', short: 'MoD', kind: 'ministry', parentId: 'in:goi', template: 'central_ministry', sector: 'defence', portfolio: { projectTypes: [] } },
  {
    id: 'in:dolr',
    name: 'Department of Land Resources, Ministry of Rural Development',
    short: 'DoLR (MoRD)',
    kind: 'ministry',
    parentId: 'in:goi',
    template: 'central_ministry',
    lens: 'oversight',
    portfolio: { frameworks: ['RFCTLARR'] },
    description: 'Administers the RFCTLARR Act, 2013; its lens is every acquisition proceeding under that Act, across sectors.',
  },
  {
    id: 'in:moefcc',
    name: 'Ministry of Environment, Forest & Climate Change',
    short: 'MoEFCC',
    kind: 'ministry',
    parentId: 'in:goi',
    template: 'central_ministry',
    lens: 'oversight',
    portfolio: { dependencies: ['FOREST'] },
    description: 'Forest diversion and environmental clearances; its lens is every project whose network carries a forest clearance.',
  },
  { id: 'in:nhai', name: 'National Highways Authority of India', short: 'NHAI', kind: 'central_organisation', parentId: 'in:morth', template: 'central_organisation', portfolio: { authorities: ['National Highways Authority of India (NHAI)'] } },
  { id: 'in:dfccil', name: 'Dedicated Freight Corridor Corporation of India Ltd', short: 'DFCCIL', kind: 'central_organisation', parentId: 'in:mor', template: 'central_organisation', portfolio: { authorities: ['Dedicated Freight Corridor Corporation of India Ltd (DFCCIL)'] } },
  { id: 'in:nhsrcl', name: 'National High Speed Rail Corporation Ltd', short: 'NHSRCL', kind: 'central_organisation', parentId: 'in:mor', template: 'central_organisation', portfolio: { authorities: ['National High Speed Rail Corporation Ltd (NHSRCL)'] } },
  { id: 'in:powergrid', name: 'Power Grid Corporation of India Ltd', short: 'POWERGRID', kind: 'central_organisation', parentId: 'in:mop', template: 'central_organisation_regional', regions: 'grid_regions', portfolio: { authorities: ['Power Grid Corporation of India Ltd (POWERGRID)'] } },
  { id: 'in:seci', name: 'Solar Energy Corporation of India Ltd', short: 'SECI', kind: 'central_organisation', parentId: 'in:mnre', template: 'central_organisation', portfolio: { authorities: ['Solar Energy Corporation of India Ltd (SECI)'] } },
  { id: 'in:aai', name: 'Airports Authority of India', short: 'AAI', kind: 'central_organisation', parentId: 'in:moca', template: 'central_organisation', portfolio: { authorities: ['Airports Authority of India (AAI)'] } },
  { id: 'in:cwc', name: 'Central Water Commission', short: 'CWC', kind: 'central_organisation', parentId: 'in:mojs', template: 'central_organisation', portfolio: { nodePattern: 'Central Water Commission' } },
  { id: 'in:nicdc', name: 'National Industrial Corridor Development Corporation', short: 'NICDC', kind: 'central_organisation', parentId: 'in:moci', template: 'central_organisation', portfolio: { nodePattern: 'National Industrial Corridor Development Corporation' } },
  { id: 'in:gail', name: 'GAIL (India) Ltd', short: 'GAIL', kind: 'central_organisation', parentId: 'in:mopng', template: 'central_organisation', portfolio: { authorities: ['GAIL (India) Ltd'] } },
  { id: 'in:iocl', name: 'Indian Oil Corporation Ltd', short: 'IOCL', kind: 'central_organisation', parentId: 'in:mopng', template: 'central_organisation', portfolio: { authorities: ['Indian Oil Corporation Ltd (IOCL)'] } },
];

/** Departments every State / UT government is given. Names come from the state profile where it has one. */
const STATE_DEPARTMENTS = [
  { key: 'revenue', short: 'Revenue', name: (p) => p.revenueDepartment, portfolio: { all: true }, description: 'Nodal department for land acquisition: district collectors, acquisition officers and revenue field staff.' },
  { key: 'land-records', short: 'Land Records', name: (p) => p.landRecords.name, portfolio: { all: true }, description: 'Survey, record-of-rights and mutation — a dependency on every acquisition, never the acquiring authority.' },
  { key: 'law', short: 'Law', name: (p, state) => `Law Department, ${stateGovernmentName(state)}`, portfolio: { all: true }, description: 'Litigation, objections and references on compensation.' },
  { key: 'roads', short: 'Roads', name: (p) => p.pwd, portfolio: { projectTypes: sectorTypes('roads') }, description: 'State roads agency; executes NH works and state expressways.' },
  { key: 'urban', short: 'Urban Development', name: (p, state) => `Urban Development Department, ${state}`, portfolio: { projectTypes: sectorTypes('urban') } },
  { key: 'water', short: 'Water Resources', name: (p, state) => `Water Resources / Irrigation Department, ${state}`, portfolio: { projectTypes: sectorTypes('water') } },
  { key: 'industries', short: 'Industries', name: (p, state) => `Industries Department, ${state}`, portfolio: { projectTypes: sectorTypes('industry') } },
  { key: 'energy', short: 'Energy', name: (p, state) => `Energy Department, ${state}`, portfolio: { projectTypes: [...sectorTypes('power'), ...sectorTypes('renewables')] } },
  { key: 'forest', short: 'Forest', name: (p) => p.forest, portfolio: { dependencies: ['FOREST'] }, description: 'Forest clearance dependency for projects on recorded forest land.' },
];

const slug = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

/** Bodies the registry offers as acquiring authorities in a state, excluding central bodies and zonal railways. */
function stateAgencyNames(state) {
  const districts = districtIndex().byState.get(state) ?? [];
  const central = new Set(CENTRAL_ORGANISATIONS.flatMap((o) => o.portfolio.authorities ?? []));
  const names = new Set();
  for (const [projectType, t] of Object.entries(PROJECT_TYPES)) {
    if (projectType === 'Pipeline') continue;
    for (const subtype of t.subtypes) {
      for (const d of districts) {
        for (const name of authorityOptions({ projectType, subtype, state, district: d.district })) {
          // District-templated names ("<district> Development Authority") are left to the project record.
          if (central.has(name) || /Department|Vibhag|\(NH wing\)/.test(name) || /^Ministry of Railways/.test(name) || /as notified/.test(name) || districts.some((x) => name.startsWith(`${x.district} `)) || /^MoRTH/.test(name)) continue;
          names.add(name);
        }
      }
    }
  }
  return Array.from(names).sort();
}

let orgCache = null;

function buildOrganisations() {
  const list = CENTRAL_ORGANISATIONS.map((o) => ({ ...o, level: 'national', state: null }));
  for (const s of STATES_AND_UTS) {
    const code = s.code;
    const profile = stateProfile(s.name);
    const govId = `st:${code}`;
    list.push({
      id: govId,
      name: stateGovernmentName(s.name),
      short: code,
      kind: 'state_government',
      parentId: 'in:goi',
      template: 'state_government',
      level: 'state',
      state: s.name,
      portfolio: { all: true },
      profileBasis: profile.generic ? 'generic' : 'configured',
    });
    for (const dep of STATE_DEPARTMENTS) {
      list.push({
        id: `${govId}:${dep.key}`,
        name: dep.name(profile, s.name),
        short: dep.short,
        kind: 'state_department',
        parentId: govId,
        template: 'state_department',
        level: 'state',
        state: s.name,
        portfolio: dep.portfolio,
        description: dep.description ?? null,
      });
    }
    const used = new Set();
    for (const name of stateAgencyNames(s.name)) {
      let id = `${govId}:agency:${slug(name)}`;
      for (let n = 2; used.has(id); n++) id = `${govId}:agency:${slug(name)}-${n}`;
      used.add(id);
      list.push({
        id,
        name,
        short: (/\(([^)]+)\)\s*$/.exec(name) ?? [])[1] ?? name,
        kind: 'state_agency',
        parentId: govId,
        template: 'state_agency',
        level: 'state',
        state: s.name,
        portfolio: { authorities: [name] },
      });
    }
  }
  return list;
}

export function organisations() {
  if (!orgCache) {
    orgCache = buildOrganisations();
    orgCache.byId = new Map(orgCache.map((o) => [o.id, o]));
  }
  return orgCache;
}

export const organisationById = (id) => organisations().byId.get(id) ?? null;

/** The organisation and every ancestor, top first. */
export function lineage(orgId) {
  const out = [];
  let o = organisationById(orgId);
  while (o) {
    out.unshift(o);
    o = o.parentId ? organisationById(o.parentId) : null;
  }
  return out;
}

export const ORGANISATION_KIND_LABEL = {
  government: 'Union Government',
  coordinating_authority: 'National coordinating authority',
  ministry: 'Ministry / Department of GoI',
  central_organisation: 'Central organisation',
  state_government: 'State / UT Government',
  state_department: 'State department',
  state_agency: 'State agency',
};

/* ==================================================================== units */

const REGION_PROVIDERS = {
  grid_regions: {
    label: 'Regional grid',
    basis: 'The five regional grids of the national power grid.',
    units: () => Object.entries(GRID_REGIONS).map(([name, states]) => ({ id: name, label: name, states })),
  },
  railway_zones: {
    label: 'Zonal railway',
    basis: 'Zone configured for each district in the authority registry.',
    units: () => {
      const zones = new Map();
      for (const s of STATES_AND_UTS) {
        const profile = stateProfile(s.name);
        if (profile.generic) continue;
        for (const d of districtIndex().byState.get(s.name) ?? []) {
          const zone = profile.railwayZone({ district: d.district });
          if (!zone || /as notified/.test(zone)) continue;
          const z = zones.get(zone) ?? { id: zone, label: zone, states: new Set(), districtKeys: new Set() };
          z.states.add(s.name);
          z.districtKeys.add(`${s.name}|${d.district}`);
          zones.set(zone, z);
        }
      }
      return Array.from(zones.values())
        .map((z) => ({ id: z.id, label: z.label, states: Array.from(z.states).sort(), districtKeys: Array.from(z.districtKeys) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  },
};

const unitCache = new Map();
function regionUnits(providerId) {
  if (!providerId) return [];
  if (!unitCache.has(providerId)) unitCache.set(providerId, REGION_PROVIDERS[providerId].units());
  return unitCache.get(providerId);
}

export function divisionUnits(state) {
  const cfg = REVENUE_DIVISIONS[state];
  if (!cfg) return [];
  return Object.entries(cfg).map(([name, districts]) => ({
    id: name,
    label: name,
    districts: districts.map((d) => resolveDistrict(state, d)?.district).filter(Boolean),
  }));
}

const stateUnit = (s) => ({ id: s.name, label: s.name, code: s.code, type: s.type, zonalCouncil: s.zonalCouncil, lgdCode: s.lgdCode });

/** Levels of an organisation's template that apply, dropping optional levels with nothing configured. */
export function templateLevels(org, selection = {}) {
  const template = HIERARCHY_TEMPLATES[org.template];
  return template.levels.filter((lv) => {
    if (lv === 'region') return Boolean(org.regions);
    if (lv === 'division') return Boolean(selection.state && REVENUE_DIVISIONS[selection.state]);
    return true;
  });
}

/**
 * Choices for one geographic level, given the organisation and the units
 * chosen above it. Returns [] when the level does not apply.
 */
export function levelOptions(orgId, level, selection = {}) {
  const org = organisationById(orgId);
  if (!org) return [];
  switch (level) {
    case 'region':
      return regionUnits(org.regions).map((u) => ({ id: u.id, label: u.label, detail: u.states.length === 1 ? u.states[0] : `${u.states.length} States / UTs` }));
    case 'state': {
      if (org.state) return [stateUnit(stateInfo(org.state))];
      const region = selection.region ? regionUnits(org.regions).find((u) => u.id === selection.region) : null;
      return STATES_AND_UTS.filter((s) => !region || region.states.includes(s.name)).map(stateUnit);
    }
    case 'division':
      return selection.state ? divisionUnits(selection.state).map((u) => ({ id: u.id, label: u.label, detail: `${u.districts.length} districts` })) : [];
    case 'district': {
      const state = org.state ?? selection.state;
      if (!state) return [];
      let list = districtIndex().byState.get(state) ?? [];
      if (selection.division) {
        const div = divisionUnits(state).find((u) => u.id === selection.division);
        if (div) list = list.filter((d) => div.districts.includes(d.district));
      }
      if (selection.region) {
        const region = regionUnits(org.regions).find((u) => u.id === selection.region);
        if (region?.districtKeys) list = list.filter((d) => region.districtKeys.includes(d.key));
      }
      return list.map((d) => ({ id: d.district, label: d.district, lgdCode: null })).sort((a, b) => a.label.localeCompare(b.label));
    }
    default:
      return [];
  }
}

/* ================================================================ positions */

/**
 * A position is an organisation plus the geographic units chosen under it.
 * Resolving it yields the administrative chain for display and the concrete
 * scope used to filter projects.
 */
export function resolvePosition({ orgId, units = {} }) {
  const org = organisationById(orgId);
  if (!org) throw new Error(`Unknown organisation "${orgId}"`);
  const sel = { ...units, state: org.state ?? units.state ?? null };
  const levels = templateLevels(org, sel);
  const chain = lineage(orgId);

  const region = sel.region ? regionUnits(org.regions).find((u) => u.id === sel.region) ?? null : null;
  const division = sel.division && sel.state ? divisionUnits(sel.state).find((u) => u.id === sel.division) ?? null : null;
  if (sel.region && !region) throw new Error(`"${sel.region}" is not a region of ${org.name}`);
  if (sel.division && !division) throw new Error(`"${sel.division}" is not a division of ${sel.state}`);
  if (sel.district && sel.state && !resolveDistrict(sel.state, sel.district)) throw new Error(`"${sel.district}" is not a district of ${sel.state}`);

  const tier = sel.district ? 'district' : division ? 'division' : sel.state ? 'state' : region ? 'region' : 'national';

  // Concrete scope.
  let states = null;
  let districtKeys = null;
  if (region) {
    states = region.states;
    if (region.districtKeys) districtKeys = region.districtKeys;
  }
  if (sel.state) {
    states = [sel.state];
    if (districtKeys) districtKeys = districtKeys.filter((k) => k.startsWith(`${sel.state}|`));
  }
  if (division) districtKeys = division.districts.map((d) => `${sel.state}|${d}`);
  if (sel.district) districtKeys = [`${sel.state}|${sel.district}`];

  const ministry = chain.find((o) => o.kind === 'ministry') ?? null;
  const stateGov = chain.find((o) => o.kind === 'state_government') ?? null;
  const orgUnit = chain.find((o) => o.kind === 'central_organisation') ?? null;
  const department = chain.find((o) => o.kind === 'state_department' || o.kind === 'state_agency') ?? null;
  const allLabel = { region: 'All regions', state: region ? `All States in ${region.label}` : 'All States & UTs', division: 'All divisions', district: 'All districts' };

  const rows = levels
    .filter((lv) => lv !== 'project')
    .map((lv) => {
      switch (lv) {
        case 'country':
          return { level: lv, label: ADMIN_LEVELS[lv].label, value: 'India', fixed: true };
        case 'ministry':
          return { level: lv, label: ADMIN_LEVELS[lv].label, value: ministry?.name ?? '—', orgId: ministry?.id, fixed: true };
        case 'organisation':
          return { level: lv, label: ADMIN_LEVELS[lv].label, value: orgUnit?.name ?? org.name, orgId: orgUnit?.id ?? org.id, fixed: true };
        case 'department':
          return { level: lv, label: ADMIN_LEVELS[lv].label, value: department?.name ?? org.name, orgId: department?.id ?? org.id, fixed: true };
        case 'region':
          return { level: lv, label: REGION_PROVIDERS[org.regions]?.label ?? ADMIN_LEVELS[lv].label, value: region?.label ?? allLabel.region, all: !region };
        case 'state':
          return { level: lv, label: ADMIN_LEVELS[lv].label, value: sel.state ?? allLabel.state, all: !sel.state, code: sel.state ? stateCode(sel.state) : null, fixed: Boolean(org.state) };
        case 'division':
          return { level: lv, label: ADMIN_LEVELS[lv].label, value: division?.label ?? allLabel.division, all: !division };
        case 'district':
          return { level: lv, label: ADMIN_LEVELS[lv].label, value: sel.district ?? allLabel.district, all: !sel.district };
        default:
          return null;
      }
    })
    .filter(Boolean);

  const portfolioLabel = portfolioDescription(org);
  const place = sel.district ? `${sel.district}, ${sel.state}` : division ? `${division.label}, ${sel.state}` : sel.state ?? region?.label ?? 'All India';

  return {
    organisation: { id: org.id, name: org.name, short: org.short, kind: org.kind, kindLabel: ORGANISATION_KIND_LABEL[org.kind], illustrative: Boolean(org.illustrative), description: org.description ?? null, lens: org.lens ?? 'sector' },
    lineage: chain.map((o) => ({ id: o.id, name: o.name, short: o.short, kind: o.kind })),
    template: { id: org.template, label: HIERARCHY_TEMPLATES[org.template].label, levels },
    governmentLevel: stateGov ? 'state' : 'central',
    tier,
    tierLabel: AUTHORITY_TIERS.find((t) => t.id === tier).label,
    units: { region: region?.id ?? null, state: sel.state, division: division?.id ?? null, district: sel.district ?? null },
    chain: rows,
    scope: { states, districtKeys },
    portfolio: { restricted: !org.portfolio.all, label: portfolioLabel },
    place,
    label: org.portfolio.all ? place : `${place} · ${org.short}`,
  };
}

function portfolioDescription(org) {
  const p = org.portfolio;
  if (p.all) return 'All acquisition projects';
  if (p.projectTypes) return p.projectTypes.length ? p.projectTypes.join(', ') : 'No project types onboarded yet';
  if (p.frameworks) return `Proceedings under ${p.frameworks.join(', ')}`;
  if (p.dependencies) return `Projects requiring ${p.dependencies.join(', ').toLowerCase().replace(/_/g, ' ')} clearance`;
  if (p.authorities) return `Projects of ${org.short}`;
  if (p.nodePattern) return `Projects involving ${org.short}`;
  return org.name;
}

const frameworkIdOf = (project) => (typeof project.framework === 'string' ? project.framework : project.framework?.id) ?? null;

/** Whether an organisation's portfolio admits a project, independent of geography. */
export function organisationMatchesProject(org, project) {
  const p = org.portfolio;
  if (p.all) return true;
  const nodes = project.network?.nodes ?? [];
  if (p.projectTypes?.includes(project.type)) return true;
  if (p.frameworks && p.frameworks.includes(frameworkIdOf(project))) return true;
  if (p.authorities?.some((a) => project.authority === a || nodes.some((n) => n.name === a))) return true;
  if (p.nodePattern && nodes.some((n) => n.name.includes(p.nodePattern))) return true;
  if (p.dependencies?.some((code) => nodes.some((n) => n.code === code))) return true;
  return false;
}

/** Whether a project falls inside a resolved position (geography and portfolio). */
export function projectInPosition(position, project) {
  const { states, districtKeys } = position.scope;
  if (states && !states.includes(project.state)) return false;
  if (districtKeys) {
    const keys = (project.districts ?? [project.district]).map((d) => `${project.state}|${d}`);
    if (!keys.some((k) => districtKeys.includes(k))) return false;
  }
  return organisationMatchesProject(organisationById(position.organisation.id), project);
}

/* ============================================================== public view */

/** Configuration for the client: levels, templates, sectors, States / UTs and the organisation catalogue. */
export function hierarchyConfig() {
  const orgs = organisations();
  return {
    levels: Object.values(ADMIN_LEVELS),
    templates: Object.values(HIERARCHY_TEMPLATES),
    tiers: AUTHORITY_TIERS,
    sectors: SECTORS.map((s) => ({ ...s, ministry: organisationById(s.ministryId)?.name ?? null })),
    states: STATES_AND_UTS.map((s) => ({ ...stateUnit(s), officialName: s.officialName, government: stateGovernmentName(s.name), profile: stateProfile(s.name).generic ? 'generic' : 'configured', divisions: divisionUnits(s.name).length })),
    organisations: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      short: o.short,
      kind: o.kind,
      kindLabel: ORGANISATION_KIND_LABEL[o.kind],
      parentId: o.parentId,
      template: o.template,
      state: o.state,
      sector: o.sector ?? null,
      lens: o.lens ?? 'sector',
      regions: o.regions ? { provider: o.regions, label: REGION_PROVIDERS[o.regions].label, basis: REGION_PROVIDERS[o.regions].basis } : null,
      portfolio: portfolioDescription(o),
      illustrative: Boolean(o.illustrative),
      description: o.description ?? null,
    })),
    note: 'Organisation catalogue and administrative levels are configuration. Central bodies are listed explicitly; every State / UT government, its departments and its agencies are generated from the authority registry. LGD codes are filled when the Local Government Directory integration is connected.',
  };
}
