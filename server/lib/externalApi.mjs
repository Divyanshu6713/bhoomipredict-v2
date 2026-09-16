/**
 * External integration API, version 1 — for existing land-acquisition
 * management systems, state portals and government databases.
 *
 *   /api/v1/openapi.json   public, machine-readable contract (OpenAPI 3.0)
 *   everything else        X-API-Key + scope + jurisdiction of the key
 *
 * The same services the web application uses sit behind every route, so a
 * status update pushed by a state system re-scores the project with the
 * deployed model and re-evaluates its rules exactly as an officer's edit would.
 */
import { ServiceError, getProject, projectSummary, createProject, updateProject, deleteProject } from './projects.mjs';
import { authenticateApiKey, requireScope, API_SCOPES } from './apiClients.mjs';
import { scoreModel, defaultRecord } from './scorer.mjs';
import { ingestOutcomes } from './learning.mjs';
import { listAlerts, listInterventions } from './workflow.mjs';
import { scopedProjects } from './dashboard.mjs';
import { recordAudit } from './persistence.mjs';
import { inScope, positionOf } from '../domain/roles.mjs';

const PROJECT_WRITABLE = ['name', 'subtype', 'authority', 'priority', 'stakeholderResponsiveness', 'startDate', 'targetCompletionDate', 'compensationCompletionPct', 'possessionCompletionPct', 'rrProgressPct', 'avgDocumentCompleteness', 'legalCases', 'affectedFamilies', 'approvalDelayDays', 'dominantOwnership', 'forestLand', 'crossesRailway', 'crossesHighway', 'lat', 'lon', 'district', 'subDistrict'];

export function openApiSpec(store) {
  const risk = {
    type: 'object',
    properties: {
      id: { type: 'string' }, name: { type: 'string' }, state: { type: 'string' }, district: { type: 'string' }, type: { type: 'string' },
      currentStage: { type: 'string' }, stageStatus: { type: 'string', enum: ['IN_PROGRESS', 'DELAYED', 'BLOCKED', 'COMPLETED', 'PENDING'] },
      riskScore: { type: 'integer', minimum: 1, maximum: 99 }, delayProbability: { type: 'number' }, riskBand: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
      predictedDelayDays: { type: 'integer' }, modelVersion: { type: 'string' },
    },
  };
  const secured = [{ ApiKey: [] }];
  const err = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
  const scopeNote = (s) => `Requires scope \`${s}\`. Results are limited to the API key's jurisdiction.`;
  return {
    openapi: '3.0.3',
    info: {
      title: 'LandPulse AI Integration API',
      version: '1.0.0',
      description:
        'Predictive delay-risk services for land-acquisition management systems and government databases. ' +
        'All data served by this prototype is synthetic demonstration data; no government system is connected.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: `Issued by an administrator (Administration → Integrations). Scopes: ${Object.keys(API_SCOPES).join(', ')}.` } },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string' }, details: {} } },
        ProjectRisk: risk,
        CaseRecord: { type: 'object', description: 'Case-level model inputs keyed by corpus column name (see /api/predict/spec in the app). Missing fields fall back to training medians.', additionalProperties: true },
        Outcome: {
          type: 'object',
          required: ['caseId'],
          properties: {
            caseId: { type: 'string', example: 'LAC-812345' },
            completedOn: { type: 'string', format: 'date', description: 'Date the milestone was achieved' },
            stillPendingOn: { type: 'string', format: 'date', description: 'Date on which the milestone was confirmed still pending (> 30 days past due)' },
            delayed: { type: 'boolean' },
            actualDelayDays: { type: 'integer' },
          },
        },
      },
    },
    paths: {
      '/projects': {
        get: { summary: 'List projects with risk', description: scopeNote('read:projects'), security: secured, parameters: [{ name: 'riskBand', in: 'query', schema: { type: 'string' } }, { name: 'state', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 500 } }], responses: { 200: { description: 'Projects', content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, projects: { type: 'array', items: risk } } } } } }, 401: err, 403: err, 429: err } },
        post: { summary: 'Create a project', description: scopeNote('write:projects'), security: secured, requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 201: { description: 'Created and scored' }, 422: err } },
      },
      '/projects/{id}': {
        patch: { summary: 'Push a status update for a project', description: `${scopeNote('write:projects')} Writable fields: ${PROJECT_WRITABLE.join(', ')}. The project is re-scored immediately.`, security: secured, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated, with old and new risk' }, 404: err, 422: err } },
      },
      '/projects/{id}/risk': {
        get: { summary: 'Risk, drivers, stage forecast and recommendations', description: scopeNote('read:risk'), security: secured, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Risk detail' }, 403: err, 404: err } },
      },
      '/score': {
        post: { summary: 'Score a case-level record with the deployed model', description: `${scopeNote('score')} Nothing is stored.`, security: secured, requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CaseRecord' } } } }, responses: { 200: { description: 'Probability, band, expected slip and TreeSHAP drivers' } } },
      },
      '/outcomes': {
        post: { summary: 'Record milestone outcomes (continuous learning)', description: `${scopeNote('write:outcomes')} Validated as a batch and committed only when every row is valid; pass dryRun=true to validate without committing.`, security: secured, parameters: [{ name: 'dryRun', in: 'query', schema: { type: 'boolean', default: false } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { outcomes: { type: 'array', items: { $ref: '#/components/schemas/Outcome' } } } } } } }, responses: { 200: { description: 'Validation summary and commit status' } } },
      },
      '/alerts': {
        get: { summary: 'Open alerts in the jurisdiction', description: scopeNote('read:alerts'), security: secured, responses: { 200: { description: 'Alerts' } } },
      },
      '/interventions': {
        get: { summary: 'Open interventions in the jurisdiction', description: scopeNote('read:alerts'), security: secured, responses: { 200: { description: 'Interventions' } } },
      },
    },
    'x-model': { version: store.modelVersion, delayDefinition: 'milestone slips by more than 30 days', dataMode: 'synthetic' },
  };
}

const riskView = (store, p) => ({ ...projectSummary(p), modelVersion: store.modelVersion });

/**
 * Handle /api/v1/* . Returns true when handled.
 * @param deps { json, readBody, route }
 */
export async function handleV1(req, res, url, store, { json, readBody }) {
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.startsWith('/api/v1')) return false;
  const sub = pathname.slice('/api/v1'.length) || '/';
  const p = Object.fromEntries(url.searchParams.entries());
  if (req.method === 'GET' && sub === '/openapi.json') {
    json(res, openApiSpec(store));
    return true;
  }
  const principal = authenticateApiKey(req.headers['x-api-key']);
  let m;

  if (req.method === 'GET' && sub === '/projects') {
    requireScope(principal, 'read:projects');
    let rows = scopedProjects(principal, p.state ? { state: p.state } : {});
    if (p.riskBand) rows = rows.filter((x) => p.riskBand.split(',').includes(x.riskBand));
    const limit = Math.min(500, Math.max(1, Number(p.limit ?? 100)));
    json(res, { total: rows.length, dataMode: 'synthetic', projects: rows.slice(0, limit).map((x) => riskView(store, x)) });
    return true;
  }
  if (req.method === 'POST' && sub === '/projects') {
    requireScope(principal, 'write:projects');
    const body = await readBody(req);
    const { states, districtKeys } = positionOf(principal).scope;
    if ((states && !states.includes(body.state)) || (districtKeys && !districtKeys.includes(`${body.state}|${body.district}`))) {
      throw new ServiceError('The project falls outside this API key’s jurisdiction', 403);
    }
    const created = createProject(principal, body, { source: 'api' });
    if (!inScope(principal, created)) {
      // Geography matched but the organisation's portfolio does not cover this project type.
      deleteProject(principal, created.id, { reason: 'Refused: outside the API client portfolio' });
      throw new ServiceError('The project falls outside this API key’s portfolio', 403);
    }
    json(res, { project: riskView(store, created) }, 201);
    return true;
  }
  if ((m = /^\/projects\/([^/]+)\/risk$/.exec(sub)) && req.method === 'GET') {
    requireScope(principal, 'read:risk');
    const pr = getProject(decodeURIComponent(m[1]));
    if (!pr) throw new ServiceError('Project not found', 404);
    if (!inScope(principal, pr)) throw new ServiceError('This project is outside the API key’s jurisdiction', 403);
    json(res, {
      project: riskView(store, pr),
      riskDefinition: 'Expected share of open current-stage parcels whose milestone slips by more than 30 days',
      drivers: pr.contributors,
      forecast: pr.forecast,
      recommendations: pr.recommendations.map((r) => ({ code: r.code, severity: r.severity, title: r.title, reason: r.reason, responsibleAuthority: r.responsibleAuthority.name, recommendedAction: r.recommendedAction, dueInDays: r.dueInDays, impact: r.impact ?? null })),
    });
    return true;
  }
  if ((m = /^\/projects\/([^/]+)$/.exec(sub)) && req.method === 'PATCH') {
    requireScope(principal, 'write:projects');
    const pr = getProject(decodeURIComponent(m[1]));
    if (!pr) throw new ServiceError('Project not found', 404);
    if (!inScope(principal, pr)) throw new ServiceError('This project is outside the API key’s jurisdiction', 403);
    const body = await readBody(req);
    const before = pr.riskScore;
    const updated = updateProject(principal, pr.id, body);
    json(res, { project: riskView(store, updated), riskBefore: before, riskAfter: updated.riskScore });
    return true;
  }
  if (req.method === 'POST' && sub === '/score') {
    requireScope(principal, 'score');
    const body = await readBody(req);
    const record = { ...defaultRecord(store), ...(body.record ?? body) };
    json(res, { result: scoreModel(store, record), note: 'Scored with the deployed model; nothing was stored.' });
    return true;
  }
  if (req.method === 'POST' && sub === '/outcomes') {
    requireScope(principal, 'write:outcomes');
    const body = await readBody(req);
    const rows = Array.isArray(body) ? body : body.outcomes ?? [];
    // Outcomes may only be recorded for cases in the key's jurisdiction.
    const outside = rows.filter((r) => {
      const mm = /^LAC-(\d+)$/i.exec(String(r.caseId ?? r.case_id ?? ''));
      const row = mm ? Number(mm[1]) - 500000 : -1;
      if (row < 0 || row >= store.rows) return false;
      const pr = getProject(store.projects[store.col.projectIdx[row]].id);
      return !pr || !inScope(principal, pr);
    });
    if (outside.length) throw new ServiceError(`${outside.length} outcome(s) refer to cases outside the API key’s jurisdiction`, 403);
    const result = ingestOutcomes(store, principal, rows, { commit: p.dryRun !== 'true', source: 'api' });
    json(res, result, result.summary.invalid ? 422 : 200);
    return true;
  }
  if (req.method === 'GET' && sub === '/alerts') {
    requireScope(principal, 'read:alerts');
    json(res, listAlerts(principal, { ...p, status: p.status ?? 'UNREAD,ACKNOWLEDGED', pageSize: p.pageSize ?? 100 }));
    return true;
  }
  if (req.method === 'GET' && sub === '/interventions') {
    requireScope(principal, 'read:alerts');
    json(res, listInterventions(principal, { ...p, pageSize: p.pageSize ?? 100 }));
    return true;
  }
  recordAudit({ user: principal, action: 'integration.unknown_endpoint', entity: 'api_client', entityId: principal.id, note: `${req.method} ${sub}` });
  throw new ServiceError(`No such v1 endpoint: ${req.method} ${sub}`, 404);
}
