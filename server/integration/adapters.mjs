/**
 * Adapter registry and synthetic adapters.
 *
 * The synthetic adapters implement every contract in contracts.mjs from the
 * demonstration corpus, so the integration layer can be exercised end to end
 * without any official system. They never present corpus values as official:
 * every envelope carries mode 'synthetic'.
 *
 * Adding a real source:
 *   1. write an adapter object { id, kind, mode: 'official', label, ...methods }
 *      that calls the source and maps its response onto the contract;
 *   2. add it to ADAPTERS[kind] below;
 *   3. start the API with LANDPULSE_PROVIDER_<KIND>=<adapter id>
 *      (for example LANDPULSE_PROVIDER_LANDRECORDS=karnataka-bhoomi).
 * Nothing above this layer changes.
 */
import { envelope } from './contracts.mjs';
import { stateInfo } from '../domain/india.mjs';
import { stateProfile, LIFECYCLE_STAGES } from '../domain/registry.mjs';
import { districtIndex } from '../domain/geography.mjs';

const CORPUS = 'LandPulse AI synthetic land-acquisition corpus';

/**
 * @param ctx { caseRecord(caseId) → case | null, project(projectId) → project | null }
 */
export function syntheticAdapters(ctx) {
  const needCase = (ref) => {
    const c = ref?.caseId ? ctx.caseRecord(ref.caseId) : null;
    if (!c) throw Object.assign(new Error(`Parcel ${ref?.caseId ?? '(no case id)'} is not in the synthetic corpus`), { status: 404 });
    return c;
  };
  const needProject = (ref) => {
    const p = ref?.projectId ? ctx.project(ref.projectId) : null;
    if (!p) throw Object.assign(new Error(`Project ${ref?.projectId ?? '(no id)'} not found`), { status: 404 });
    return p;
  };
  const base = (kind, label) => ({ id: `synthetic-${kind}`, kind, mode: 'synthetic', label });

  const landRecords = {
    ...base('landRecords', 'Synthetic land records'),
    async getRecordOfRights(ref) {
      const c = needCase(ref);
      const profile = stateProfile(c.state);
      return envelope('landRecords', this, {
        surveyNumber: c.surveyNumber,
        village: c.village,
        subDistrict: c.tehsil,
        subDistrictLabel: c.subDistrictLabel,
        landType: c.landType,
        areaHa: c.areaHa,
        ownership: c.ownership,
        numberOfOwners: c.owners,
        verificationStatus: c.verificationStatus,
        documentCompleteness: c.documentCompleteness,
        mutationStatus: c.stageIndex >= LIFECYCLE_STAGES.indexOf('Closure') ? 'Mutation in progress' : 'Not yet due',
        recordSystem: `${profile.landRecords.portal} (system of reference — not connected)`,
      }, CORPUS);
    },
  };

  const registration = {
    ...base('registration', 'Synthetic registration'),
    async getEncumbrances(ref) {
      needCase(ref);
      return envelope('registration', this, null, 'The synthetic corpus holds no registration or encumbrance data; this contract is ready for a registration-system adapter.');
    },
  };

  const courtCases = {
    ...base('courtCases', 'Synthetic court records'),
    async getCasesForParcel(ref) {
      const c = needCase(ref);
      const project = ctx.project(c.projectId);
      return envelope('courtCases', this, {
        legalDispute: c.legalDispute,
        caseCount: c.legalCases,
        disputeComplexity: c.disputeComplexity,
        forum: project?.network?.nodes.find((n) => n.code === 'DISPUTE_FORUM')?.name ?? null,
      }, CORPUS);
    },
  };

  const compensation = {
    ...base('compensation', 'Synthetic compensation records'),
    async getCompensation(ref) {
      const c = needCase(ref);
      const project = ctx.project(c.projectId);
      return envelope('compensation', this, {
        status: c.compensationStatus,
        band: c.compensationBand,
        completionPct: c.compensationCompletionPct,
        pendingDays: c.compensationPendingDays,
        treasury: project?.network?.nodes.find((n) => n.code === 'TREASURY')?.name ?? null,
      }, CORPUS);
    },
  };

  const notifications = {
    ...base('notifications', 'Synthetic notification register'),
    async getNotifications(ref) {
      const p = needProject(ref);
      const keep = ['Notification', 'Objection / Claims', 'Valuation', 'Compensation'];
      return envelope('notifications', this, p.stages.filter((s) => keep.includes(s.name)).map((s) => ({ stage: s.name, milestone: s.milestone, status: s.status, plannedDate: s.expectedCompletion ?? null, actualDate: s.actualCompletion ?? null })), CORPUS);
    },
  };

  const projectStatus = {
    ...base('projectStatus', 'Synthetic project status'),
    async getProjectStatus(ref) {
      const p = needProject(ref);
      return envelope('projectStatus', this, {
        currentStage: p.currentStage,
        stageStatus: p.lifecycle.currentStatus,
        progressPct: p.progressPct ?? null,
        milestoneDeadline: p.milestoneDeadline,
        stages: p.stages.map((s) => ({ name: s.name, status: s.status })),
      }, p.source === 'corpus' ? CORPUS : 'Project entered by a user of this prototype');
    },
  };

  const clearances = {
    ...base('clearances', 'Synthetic clearance register'),
    async getClearances(ref) {
      const p = needProject(ref);
      return envelope('clearances', this, p.network.nodes.filter((n) => n.category === 'clearance').map((n) => ({ code: n.code, name: n.name, required: true, pendingShare: n.pendingShareCurrentStage ?? 0, stages: n.stages })), CORPUS);
    },
  };

  const gis = {
    ...base('gis', 'Boundary layers + synthetic parcel points'),
    async getParcelGeometry(ref) {
      const c = needCase(ref);
      return envelope('gis', this, { point: [c.lon, c.lat], boundaryKey: `${c.state}|${c.district}`, geometry: 'point' }, 'Parcel point sampled inside the real district boundary (INDIAN-SHAPEFILES); not a surveyed parcel polygon.');
    },
  };

  const administrativeUnits = {
    ...base('administrativeUnits', 'Built-in administrative reference'),
    async getUnit({ level, name, parent } = {}) {
      if (level === 'state') {
        const s = stateInfo(name);
        return envelope('administrativeUnits', this, s ? { name: s.name, officialName: s.officialName, type: s.type, level, lgdCode: null } : null, 'Built-in list of States and Union Territories; LGD codes populate when the LGD adapter is connected.');
      }
      if (level === 'district') {
        const d = districtIndex().byKey.get(`${parent}|${name}`);
        return envelope('administrativeUnits', this, d ? { name: d.district, state: d.state, level, lgdCode: null } : null, 'District boundary index; LGD codes populate when the LGD adapter is connected.');
      }
      return envelope('administrativeUnits', this, null, `Level "${level}" is not held in the built-in reference.`);
    },
  };

  return { landRecords, registration, courtCases, compensation, notifications, projectStatus, clearances, gis, administrativeUnits };
}

/**
 * Registered adapters per kind. Only synthetic adapters exist in the
 * prototype; the structure is where real adapters are added.
 */
export function adapterCatalogue(ctx) {
  const synthetic = syntheticAdapters(ctx);
  return Object.fromEntries(Object.entries(synthetic).map(([kind, adapter]) => [kind, { [adapter.id]: adapter }]));
}
