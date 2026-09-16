/**
 * Authentication, sessions and transport security for the API.
 *
 *   passwords   scrypt (N=16384, r=8, p=1) with a per-user salt. Directory
 *               profiles start on the deployment's demo password
 *               (LANDPULSE_DEMO_PASSWORD) and can set their own; a production
 *               deployment replaces this with government SSO + MFA and keeps
 *               the session and role layer below unchanged.
 *   lockout     5 failed attempts for one profile within 10 minutes locks it
 *               for 5 minutes; every failure is audited.
 *   sessions    random 256-bit bearer tokens, stored only as SHA-256 hashes;
 *               60-minute idle timeout and 8-hour absolute lifetime. Tokens are
 *               accepted in the Authorization header only.
 *   downloads   a separate download token (hash-stored, same lifetime) is the
 *               only credential accepted in a URL, and only on read-only
 *               export / document-download endpoints, because a plain link
 *               cannot send headers.
 *   API keys    see apiClients.mjs.
 *   transport   CORS allowlist (LANDPULSE_CORS_ORIGINS) and defensive headers.
 */
import crypto from 'node:crypto';
import { getState, saveState } from './persistence.mjs';

export const DEMO_PASSWORD = process.env.LANDPULSE_DEMO_PASSWORD ?? 'LandPulse@2026';
export const SESSION_POLICY = {
  idleMinutes: Number(process.env.LANDPULSE_SESSION_IDLE_MINUTES ?? 60),
  absoluteHours: Number(process.env.LANDPULSE_SESSION_HOURS ?? 8),
  maxFailures: 5,
  failureWindowMinutes: 10,
  lockMinutes: 5,
  passwordMinLength: 10,
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* --------------------------------------------------------------- passwords */

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash, algorithm: 'scrypt-N16384-r8-p1' };
}

const demoHash = hashPassword(DEMO_PASSWORD, 'landpulse-demo-directory');

function timingSafeEqualHex(a, b) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Directory profiles use their own credential once set, otherwise the demo password. */
export function verifyPassword(principalId, password) {
  if (typeof password !== 'string' || !password) return false;
  const own = getState().credentials?.[principalId];
  const record = own ?? demoHash;
  return timingSafeEqualHex(hashPassword(password, record.salt).hash, record.hash);
}

export function passwordPolicyErrors(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < SESSION_POLICY.passwordMinLength) errors.push(`at least ${SESSION_POLICY.passwordMinLength} characters`);
  if (!/[A-Za-z]/.test(password ?? '') || !/\d/.test(password ?? '')) errors.push('both letters and digits');
  if (password === DEMO_PASSWORD) errors.push('different from the shared demo password');
  return errors;
}

export function setPassword(principalId, password) {
  const state = getState();
  state.credentials ??= {};
  state.credentials[principalId] = { ...hashPassword(password), changedAt: new Date().toISOString() };
  saveState();
}

/* ----------------------------------------------------------------- lockout */

const failures = new Map();

export function lockStatus(principalId) {
  const f = failures.get(principalId);
  if (f?.lockedUntil && f.lockedUntil > Date.now()) return { locked: true, retryAfterSeconds: Math.ceil((f.lockedUntil - Date.now()) / 1000) };
  return { locked: false };
}

export function recordFailure(principalId) {
  const now = Date.now();
  const windowMs = SESSION_POLICY.failureWindowMinutes * 60000;
  const f = failures.get(principalId) ?? { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - f.firstAt > windowMs) Object.assign(f, { count: 0, firstAt: now });
  f.count++;
  if (f.count >= SESSION_POLICY.maxFailures) {
    f.lockedUntil = now + SESSION_POLICY.lockMinutes * 60000;
    f.count = 0;
    f.firstAt = now;
  }
  failures.set(principalId, f);
  return { attemptsLeft: Math.max(0, SESSION_POLICY.maxFailures - f.count), ...lockStatus(principalId) };
}

export const clearFailures = (principalId) => failures.delete(principalId);

/* ---------------------------------------------------------------- sessions */

export function createSession(payload) {
  const state = getState();
  const token = crypto.randomBytes(32).toString('hex');
  const downloadToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const session = {
    ...payload,
    downloadHash: sha256(downloadToken),
    createdAt: new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_POLICY.absoluteHours * 3600000).toISOString(),
  };
  purgeExpiredSessions();
  state.sessions[sha256(token)] = session;
  saveState();
  return { token, downloadToken, expiresAt: session.expiresAt, idleMinutes: SESSION_POLICY.idleMinutes };
}

function alive(session, now = Date.now()) {
  if (!session || !session.expiresAt) return false; // legacy plain-token sessions are not honoured
  if (new Date(session.expiresAt).getTime() <= now) return false;
  return now - new Date(session.lastSeenAt).getTime() <= SESSION_POLICY.idleMinutes * 60000;
}

/** The live session for a bearer token, refreshing its idle timer. */
export function sessionForToken(token) {
  if (!token) return null;
  const state = getState();
  const key = sha256(token);
  const session = state.sessions[key];
  if (!alive(session)) {
    if (session) {
      delete state.sessions[key];
      saveState();
    }
    return null;
  }
  const now = Date.now();
  if (now - new Date(session.lastSeenAt).getTime() > 30000) {
    session.lastSeenAt = new Date(now).toISOString();
    saveState();
  }
  return session;
}

export function sessionForDownloadToken(downloadToken) {
  if (!downloadToken) return null;
  const hash = sha256(downloadToken);
  return Object.values(getState().sessions).find((s) => s.downloadHash === hash && alive(s)) ?? null;
}

export function endSession(token) {
  const state = getState();
  const key = sha256(token ?? '');
  if (!state.sessions[key]) return false;
  delete state.sessions[key];
  saveState();
  return true;
}

export function purgeExpiredSessions() {
  const state = getState();
  let removed = 0;
  for (const [k, s] of Object.entries(state.sessions)) {
    if (!alive(s)) {
      delete state.sessions[k];
      removed++;
    }
  }
  if (removed) saveState();
  return removed;
}

/* --------------------------------------------------------------- transport */

const ORIGINS = new Set(
  (process.env.LANDPULSE_CORS_ORIGINS ?? 'http://localhost:5178,http://127.0.0.1:5178,http://localhost:5179,http://127.0.0.1:5179')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export function applyTransportHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  return { origin, allowed: !origin || ORIGINS.has(origin) };
}

export const securityPosture = () => ({
  authentication: 'Password (scrypt) with lockout; production: government SSO with MFA',
  sessions: `Hashed bearer tokens · ${SESSION_POLICY.idleMinutes}-minute idle timeout · ${SESSION_POLICY.absoluteHours}-hour lifetime · header only`,
  downloads: 'Separate download-only token for export links',
  apiKeys: 'Hashed API keys with scopes, jurisdiction and per-key rate limits for system integrations',
  transport: `CORS allowlist (${ORIGINS.size} origins) · nosniff · frame denial · same-origin referrer`,
  audit: 'Append-only, SHA-256 hash-chained audit log; exports, downloads, failed sign-ins and API writes recorded',
  demoPasswordConfigured: Boolean(process.env.LANDPULSE_DEMO_PASSWORD),
});
