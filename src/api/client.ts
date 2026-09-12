/**
 * API boundary.
 *
 * Every screen reads through this module. The 350,000-case corpus lives behind
 * the API (server/index.mjs): filtering, sorting, paging and aggregation all
 * happen there, so the browser only ever holds the page or the aggregate it
 * asked for. Nothing here caches the corpus client-side.
 *
 * In development Vite proxies /api to the API process (see vite.config.ts). Set
 * VITE_API_BASE_URL to point at a different deployment.
 */
import type {
  BreakdownRow,
  CaseDetailResponse,
  CaseQueryResult,
  ExportManifest,
  Facets,
  MapPoint,
  PortfolioSummary,
  PredictResponse,
  PredictionSpec,
  ProjectDetailResponse,
  ProjectQueryResult,
  QueueResult,
  DistrictSummary,
  StateSummary,
} from '@/data/types';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** Shown wherever figures are displayed. */
export const DATA_MODE = 'Synthetic prototype data';

export const PROTOTYPE_NOTICE =
  'This prototype uses synthetic data for demonstration and model-development purposes. It does not represent ' +
  'actual government acquisition records. Real-world deployment and validation would require authorised ' +
  'historical acquisition data.';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

const qs = (params: Query = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'all') continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

async function get<T>(path: string, params?: Query, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}/api${path}${qs(params)}`, { signal });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ reads */

export const fetchHealth = (signal?: AbortSignal) =>
  get<{ ok: boolean; rows: number; projects: number; today: string; shap: boolean }>('/health', undefined, signal);

export const fetchSummary = (signal?: AbortSignal) => get<PortfolioSummary>('/summary', undefined, signal);

export const fetchFacets = (signal?: AbortSignal) => get<Facets>('/facets', undefined, signal);

export const fetchProjects = (params: Query, signal?: AbortSignal) =>
  get<ProjectQueryResult>('/projects', params, signal);

export const fetchProject = (id: string, signal?: AbortSignal) =>
  get<ProjectDetailResponse>(`/projects/${encodeURIComponent(id)}`, undefined, signal);

export const fetchProjectCases = (id: string, params: Query, signal?: AbortSignal) =>
  get<CaseQueryResult>(`/projects/${encodeURIComponent(id)}/cases`, params, signal);

export const fetchCases = (params: Query, signal?: AbortSignal) => get<CaseQueryResult>('/cases', params, signal);

export const fetchCase = (id: string, signal?: AbortSignal) =>
  get<CaseDetailResponse>(`/cases/${encodeURIComponent(id)}`, undefined, signal);

export const fetchQueue = (params: Query, signal?: AbortSignal) => get<QueueResult>('/queue', params, signal);

export const fetchMapPoints = (params: Query, signal?: AbortSignal) =>
  get<{ total: number; returned: number; points: MapPoint[] }>('/map/points', params, signal);

export const fetchGeo = (signal?: AbortSignal) =>
  get<{ districts: DistrictSummary[]; states: StateSummary[]; today: string }>('/geo', undefined, signal);

export const fetchBreakdown = (params: Query, signal?: AbortSignal) =>
  get<{ dimension: string; rows: BreakdownRow[] }>('/breakdown', params, signal);

export const fetchContributors = (params: Query, signal?: AbortSignal) =>
  get<{
    cases: number;
    groups: Array<{ name: string; value: number; share: number }>;
    features: Array<{ name: string; value: number; share: number }>;
  }>('/contributors', params, signal);

export const fetchModel = (signal?: AbortSignal) =>
  get<{
    metrics: Record<string, unknown>;
    importance: {
      permutation: Array<{ feature: string; group: string; label: string; aucDrop: number }>;
      shap: Array<{ feature: string; group: string; label: string; meanAbsShap: number }>;
      shapByGroup: Array<{ group: string; value: number }>;
    };
    dataset: Record<string, any>;
    featureSpec: Array<{ name: string; group: string; label: string; op: string; source: string }>;
  }>('/model', undefined, signal);

export const fetchPredictionSpec = (signal?: AbortSignal) =>
  get<PredictionSpec>('/predict/spec', undefined, signal);

export const fetchCaseScenario = (caseId: string, signal?: AbortSignal) =>
  get<{
    record: Record<string, string | number>;
    ensemble: { probability: number; riskScore: number; contributors: Array<{ group: string; value: number }> };
    surrogate: PredictResponse['result'];
  }>('/predict/case', { caseId }, signal);

export const fetchExportManifest = (signal?: AbortSignal) =>
  get<ExportManifest>('/export/manifest', undefined, signal);

/* ----------------------------------------------------------------- writes */

/** Score an ad-hoc scenario, optionally against a baseline for a what-if delta. */
export const requestPrediction = (
  record: Record<string, string | number>,
  baseline?: Record<string, string | number>,
  signal?: AbortSignal,
) => post<PredictResponse>('/predict', { record, baseline }, signal);

/* ---------------------------------------------------------------- exports */

export const exportUrl = (path: string, params?: Query) => `${BASE}/api${path}${qs(params)}`;

export const casesCsvUrl = (params: Query) => exportUrl('/export/cases.csv', params);
export const datasetCsvUrl = () => exportUrl('/export/dataset.csv');
export const datasetPdfUrl = () => exportUrl('/export/dataset.pdf');
