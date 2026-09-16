/**
 * Model lifecycle jobs: retrain (with the champion / challenger gate) and rollback.
 *
 * Retrain runs ml/train.py on the corpus plus every newly recorded outcome
 * (data/learning/outcomes.jsonl). The script compares the challenger with the
 * serving champion on the same latest test window and publishes it only if it
 * is not worse; the job then rebuilds the query store and hot-reloads the API.
 * A rejected challenger leaves the champion serving and is recorded in the
 * registry with the reason.
 *
 * Rollback restores an archived version's artefacts (data/model/versions/<id>),
 * rebuilds the store and reloads — no retraining.
 *
 * Retraining needs Python 3.10+ with numpy, pandas, scikit-learn and shap.
 * Where they are missing the job fails with that reason; nothing is simulated.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PYTHON = process.env.BP_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

const job = {
  id: null,
  status: 'idle', // idle | running | succeeded | failed
  steps: [],
  log: [],
  startedAt: null,
  finishedAt: null,
  startedBy: null,
  error: null,
};

const pushLog = (line) => {
  job.log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
};

export function pythonAvailable() {
  try {
    const r = spawnSync(PYTHON, ['-c', 'import numpy, pandas, sklearn; print("ok")'], { encoding: 'utf8', timeout: 20000 });
    return { ok: r.status === 0 && /ok/.test(r.stdout), detail: r.status === 0 ? `${PYTHON} with numpy, pandas, scikit-learn` : (r.stderr || r.error?.message || 'python not found').trim().slice(0, 300) };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    pushLog(`$ ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { cwd: ROOT, env: process.env });
    const onData = (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach(pushLog);
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with code ${code}`))));
  });
}

export function jobStatus() {
  return { ...job, log: job.log.slice(-120) };
}

const MODEL_DIR = path.join(ROOT, 'data', 'model');
const readRegistry = () => {
  const f = path.join(MODEL_DIR, 'registry.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { champion: null, versions: [] };
};

function begin(kind, user, steps) {
  Object.assign(job, {
    id: `JOB-${Date.now()}`,
    kind,
    status: 'running',
    steps: steps.map((name) => ({ name, status: 'pending' })),
    log: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    startedBy: { id: user.id, name: user.name },
    error: null,
    result: null,
  });
}

async function step(i, fn) {
  job.steps[i].status = 'running';
  await fn();
  job.steps[i].status = 'done';
}

function finish(err) {
  if (err) {
    job.status = 'failed';
    job.error = err.message;
    const running = job.steps.find((s) => s.status === 'running');
    if (running) running.status = 'failed';
    pushLog(`FAILED: ${err.message}`);
  }
  job.finishedAt = new Date().toISOString();
}

export const jobRunning = () => job.status === 'running';

export function startRetrain(user, { onSuccess, onFinished, triggeredBy }) {
  if (job.status === 'running') return { started: false, reason: 'A model job is already running', job: jobStatus() };
  const py = pythonAvailable();
  begin('retrain', user, ['Train challenger, compare with champion (ml/train.py)', 'Rebuild query store (scripts/build-store.mjs)', 'Reload the API store']);
  if (!py.ok) {
    finish(new Error(`Python environment unavailable: ${py.detail}`));
    job.steps[0].status = 'failed';
    return { started: false, reason: job.error, job: jobStatus() };
  }
  (async () => {
    try {
      const before = readRegistry().versions.length;
      await step(0, () => run(PYTHON, [path.join('ml', 'train.py'), '--triggered-by', triggeredBy ?? user.name]));
      const reg = readRegistry();
      const entry = reg.versions.length > before ? reg.versions[reg.versions.length - 1] : null;
      job.result = entry;
      if (entry && entry.status !== 'champion') {
        job.steps[1].status = 'skipped';
        job.steps[2].status = 'skipped';
        job.status = 'rejected';
        pushLog(`Challenger ${entry.id} rejected: ${entry.gate?.reason ?? ''} The champion keeps serving.`);
      } else {
        await step(1, () => run(process.execPath, [path.join('scripts', 'build-store.mjs')]));
        await step(2, () => onSuccess());
        job.status = 'succeeded';
        pushLog(`Model ${entry?.id ?? ''} promoted and live.`);
      }
      finish(null);
    } catch (err) {
      finish(err);
    }
    onFinished?.(jobStatus());
  })();
  return { started: true, job: jobStatus() };
}

export function startRollback(user, versionId, { onSuccess, onFinished }) {
  if (job.status === 'running') return { started: false, reason: 'A model job is already running', job: jobStatus() };
  const reg = readRegistry();
  const target = reg.versions.find((v) => v.id === versionId);
  const dir = path.join(MODEL_DIR, 'versions', String(versionId));
  if (!target || !fs.existsSync(dir)) return { started: false, reason: `Version ${versionId} is not archived`, job: jobStatus() };
  if (reg.champion === versionId) return { started: false, reason: `${versionId} is already the champion`, job: jobStatus() };
  begin('rollback', user, [`Restore artefacts of ${versionId}`, 'Rebuild query store (scripts/build-store.mjs)', 'Reload the API store']);
  (async () => {
    try {
      await step(0, async () => {
        for (const f of fs.readdirSync(dir)) fs.copyFileSync(path.join(dir, f), path.join(MODEL_DIR, f));
        for (const v of reg.versions) if (v.status === 'champion') v.status = 'archived';
        target.status = 'champion';
        target.restoredAt = new Date().toISOString();
        target.restoredBy = user.name;
        reg.champion = versionId;
        fs.writeFileSync(path.join(MODEL_DIR, 'registry.json'), JSON.stringify(reg, null, 1));
        pushLog(`Restored ${fs.readdirSync(dir).length} artefacts from ${versionId}`);
      });
      await step(1, () => run(process.execPath, [path.join('scripts', 'build-store.mjs')]));
      await step(2, () => onSuccess());
      job.status = 'succeeded';
      job.result = target;
      pushLog(`Rolled back to ${versionId}.`);
      finish(null);
    } catch (err) {
      finish(err);
    }
    onFinished?.(jobStatus());
  })();
  return { started: true, job: jobStatus() };
}
