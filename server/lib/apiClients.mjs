/**
 * API clients — how existing land-acquisition management systems and
 * government databases talk to LandPulse AI.
 *
 *   key        lp_<prefix>_<secret>, shown once at creation; only a SHA-256 hash
 *              is stored. Sent as the X-API-Key header.
 *   scopes     what the system may do (read:projects, read:risk, read:alerts,
 *              score, write:projects, write:outcomes)
 *   position   the jurisdiction it acts for — the same position model as a user,
 *              so a Karnataka revenue system can never read Bihar projects
 *   rate limit requests per minute per key (default 120)
 *   webhook    optional URL that receives alert / escalation payloads for its
 *              jurisdiction after every scan (see notifications.mjs)
 *   audit      every write, and every refused request, is recorded against the client
 */
import crypto from 'node:crypto';
import { getState, saveState, recordAudit } from './persistence.mjs';
import { ServiceError } from './projects.mjs';
import { resolvePosition, projectInPosition } from '../domain/hierarchy.mjs';
import { inScope } from '../domain/roles.mjs';

export const API_SCOPES = {
  'read:projects': 'List projects in the client’s jurisdiction with risk, stage and status',
  'read:risk': 'Project risk, delay drivers, stage-wise forecast and recommendations',
  'read:alerts': 'Alerts and interventions in the jurisdiction',
  score: 'Score a case-level record with the deployed model (no data stored)',
  'write:projects': 'Create projects and push status updates (compensation, possession, R&R, legal, approvals)',
  'write:outcomes': 'Record completed-milestone outcomes that feed continuous learning',
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const buckets = new Map();

export function createApiClient(user, { name, scopes, position, rateLimitPerMinute = 120, webhookUrl = null }) {
  if (!name || String(name).trim().length < 3) throw new ServiceError('A client name of at least 3 characters is required', 422);
  const bad = (scopes ?? []).filter((s) => !API_SCOPES[s]);
  if (!scopes?.length || bad.length) throw new ServiceError(`Scopes must be a non-empty subset of: ${Object.keys(API_SCOPES).join(', ')}`, 422);
  if (webhookUrl && !/^https?:\/\/[^\s]+$/i.test(webhookUrl)) throw new ServiceError('webhookUrl must be an http(s) URL', 422);
  const pos = position ?? user.position;
  let resolved;
  try {
    resolved = resolvePosition(pos);
  } catch (err) {
    throw new ServiceError(err.message, 422);
  }
  // A client can never be granted a wider jurisdiction than the administrator creating it.
  const creator = resolvePosition(user.position);
  const wider = { national: 0, region: 1, state: 2, division: 3, district: 4 };
  if ((wider[resolved.tier] ?? 0) < (wider[creator.tier] ?? 0)) throw new ServiceError('An API client cannot have a wider jurisdiction than its creator', 403);
  if (creator.units.state && resolved.units.state && creator.units.state !== resolved.units.state) throw new ServiceError('An API client must sit inside its creator’s jurisdiction', 403);

  const state = getState();
  const id = `APC-${crypto.randomBytes(4).toString('hex')}`;
  const prefix = crypto.randomBytes(3).toString('hex');
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `lp_${prefix}_${secret}`;
  state.apiClients[id] = {
    id,
    name: String(name).trim().slice(0, 80),
    prefix,
    keyHash: sha256(key),
    scopes,
    position: pos,
    rateLimitPerMinute: Math.min(1000, Math.max(10, Number(rateLimitPerMinute) || 120)),
    webhookUrl,
    createdAt: new Date().toISOString(),
    createdBy: { id: user.id, name: user.name },
    lastUsedAt: null,
    requests: 0,
    revokedAt: null,
  };
  saveState();
  recordAudit({ user, action: 'integration.client_created', entity: 'api_client', entityId: id, newValue: { name, scopes, jurisdiction: resolved.label, webhook: Boolean(webhookUrl) } });
  return { client: describeClient(state.apiClients[id]), key };
}

export function revokeApiClient(user, id) {
  const c = getState().apiClients[id];
  if (!c) throw new ServiceError('API client not found', 404);
  if (c.revokedAt) throw new ServiceError('API client already revoked', 409);
  c.revokedAt = new Date().toISOString();
  saveState();
  recordAudit({ user, action: 'integration.client_revoked', entity: 'api_client', entityId: id, oldValue: { name: c.name } });
  return describeClient(c);
}

export function describeClient(c) {
  let jurisdiction = null;
  try {
    jurisdiction = resolvePosition(c.position).label;
  } catch {
    jurisdiction = 'invalid position';
  }
  const { keyHash, ...rest } = c;
  void keyHash;
  return { ...rest, keyPreview: `lp_${c.prefix}_••••`, jurisdiction, active: !c.revokedAt };
}

export const listApiClients = (user) =>
  Object.values(getState().apiClients)
    .filter((c) => user.role === 'NATIONAL_ADMIN' || c.createdBy.id === user.id || (resolvePosition(c.position).units.state && resolvePosition(c.position).units.state === resolvePosition(user.position).units.state))
    .map(describeClient)
    .reverse();

/** Resolve X-API-Key to a principal usable wherever a user is (scope via position). */
export function authenticateApiKey(key) {
  if (!key || !/^lp_[0-9a-f]{6}_[A-Za-z0-9_-]+$/.test(key)) throw new ServiceError('A valid X-API-Key header is required', 401);
  const hash = sha256(key);
  const c = Object.values(getState().apiClients).find((x) => x.keyHash === hash);
  if (!c || c.revokedAt) throw new ServiceError('API key not recognised or revoked', 401);
  const now = Date.now();
  const b = buckets.get(c.id) ?? { windowStart: now, count: 0 };
  if (now - b.windowStart >= 60000) Object.assign(b, { windowStart: now, count: 0 });
  b.count++;
  buckets.set(c.id, b);
  if (b.count > c.rateLimitPerMinute) {
    throw Object.assign(new ServiceError(`Rate limit of ${c.rateLimitPerMinute} requests per minute exceeded`, 429), { retryAfter: Math.ceil((60000 - (now - b.windowStart)) / 1000) });
  }
  c.lastUsedAt = new Date(now).toISOString();
  c.requests = (c.requests ?? 0) + 1;
  if (c.requests % 20 === 1) saveState();
  return {
    id: c.id,
    name: `API client: ${c.name}`,
    designation: 'System integration',
    role: 'API_CLIENT',
    position: c.position,
    department: 'External system',
    kind: 'api_client',
    scopes: c.scopes,
    client: c,
  };
}

export function requireScope(principal, scope) {
  if (!principal.scopes.includes(scope)) throw new ServiceError(`This API key lacks the "${scope}" scope`, 403);
}

/** Webhook subscribers for the notification scanner. */
export const apiClientWebhooks = () =>
  Object.values(getState().apiClients)
    .filter((c) => c.webhookUrl && !c.revokedAt)
    .map((c) => {
      const pos = resolvePosition(c.position);
      return { id: c.id, name: c.name, webhookUrl: c.webhookUrl, inScope: (p) => projectInPosition(pos, p) };
    });

export { inScope };
