/**
 * Data Integration Layer.
 *
 * Selects one adapter per provider kind (environment override, otherwise the
 * synthetic adapter), validates it against its contract, and composes the
 * parcel- and project-level views the API serves. Callers never import an
 * adapter directly.
 */
import { PROVIDER_CONTRACTS, PROVIDER_KINDS, DATA_MODES, assertImplements } from './contracts.mjs';
import { adapterCatalogue } from './adapters.mjs';

let selected = null;
let catalogue = null;

const envKey = (kind) => `LANDPULSE_PROVIDER_${kind.toUpperCase()}`;

/**
 * @param ctx { caseRecord(caseId), project(projectId) }
 */
export function configureIntegrations(ctx) {
  catalogue = adapterCatalogue(ctx);
  selected = {};
  for (const kind of PROVIDER_KINDS) {
    const available = catalogue[kind] ?? {};
    const wanted = process.env[envKey(kind)];
    const id = wanted ?? Object.keys(available)[0];
    const adapter = available[id];
    if (!adapter) throw new Error(`${envKey(kind)}="${wanted}" does not name a registered adapter. Registered: ${Object.keys(available).join(', ') || 'none'}`);
    selected[kind] = assertImplements(kind, adapter);
  }
  return selected;
}

export function provider(kind) {
  if (!selected) throw new Error('Integrations are not configured');
  const p = selected[kind];
  if (!p) throw new Error(`No provider for "${kind}"`);
  return p;
}

/** Status of every provider slot, for the Data Sources screen. */
export function integrationStatus() {
  const providers = PROVIDER_KINDS.map((kind) => {
    const c = PROVIDER_CONTRACTS[kind];
    const a = provider(kind);
    return {
      kind,
      label: c.label,
      description: c.description,
      methods: Object.entries(c.methods).map(([name, m]) => ({ name, input: m.input, returns: m.returns })),
      adapter: { id: a.id, label: a.label, mode: a.mode, modeLabel: DATA_MODES[a.mode].label },
      registeredAdapters: Object.keys(catalogue[kind] ?? {}),
      envVariable: envKey(kind),
      connected: a.mode === 'official',
      futureSources: c.futureSources,
    };
  });
  return {
    architecture: ['Frontend', 'LandPulse AI API', 'Data Integration Layer', 'Government / external data sources'],
    connectedOfficialSources: providers.filter((p) => p.connected).length,
    providers,
    dataModes: Object.values(DATA_MODES),
    statement:
      'LandPulse AI is integration-ready, not integrated. Every provider slot has a contract and a working synthetic adapter; no government system is connected, and no record shown in this prototype is an official record.',
  };
}

const settle = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    return { data: null, error: err.message, provenance: null };
  }
};

/** Everything the integration layer can say about one parcel, each part with its own provenance. */
export async function parcelDataView(caseId) {
  const ref = { caseId };
  const [landRecords, registration, courtCases, compensation, gis] = await Promise.all([
    settle(() => provider('landRecords').getRecordOfRights(ref)),
    settle(() => provider('registration').getEncumbrances(ref)),
    settle(() => provider('courtCases').getCasesForParcel(ref)),
    settle(() => provider('compensation').getCompensation(ref)),
    settle(() => provider('gis').getParcelGeometry(ref)),
  ]);
  return { caseId, sections: { landRecords, registration, courtCases, compensation, gis } };
}

export async function projectDataView(projectId) {
  const ref = { projectId };
  const [projectStatus, notifications, clearances] = await Promise.all([
    settle(() => provider('projectStatus').getProjectStatus(ref)),
    settle(() => provider('notifications').getNotifications(ref)),
    settle(() => provider('clearances').getClearances(ref)),
  ]);
  return { projectId, sections: { projectStatus, notifications, clearances } };
}

export { DATA_MODES };
