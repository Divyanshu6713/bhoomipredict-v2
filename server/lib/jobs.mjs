/**
 * Retraining job runner.
 *
 * Runs the existing offline pipeline — ml/train.py on the current corpus, then
 * scripts/build-store.mjs — as child processes, streams their output into a
 * bounded log, and on success asks the API to reload the store so new scores,
 * SHAP explanations and model metrics are served without a restart.
 *
 * Retraining needs Python 3.10+ with numpy, pandas, scikit-learn and shap on
 * the host. Where they are missing the job fails with that reason; nothing is
 * simulated. Projects added through the form or CSV upload carry no case
 * records, so they do not enter the training corpus.
 */
import { spawn, spawnSync } from 'node:child_process';
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

export function startRetrain(user, { onSuccess }) {
  if (job.status === 'running') return { started: false, reason: 'A retraining job is already running', job: jobStatus() };
  const py = pythonAvailable();
  Object.assign(job, {
    id: `JOB-${Date.now()}`,
    status: 'running',
    steps: [
      { name: 'Train, evaluate and explain (ml/train.py)', status: 'pending' },
      { name: 'Rebuild query store (scripts/build-store.mjs)', status: 'pending' },
      { name: 'Reload the API store', status: 'pending' },
    ],
    log: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    startedBy: { id: user.id, name: user.name },
    error: null,
  });
  if (!py.ok) {
    job.status = 'failed';
    job.error = `Python environment unavailable: ${py.detail}`;
    job.steps[0].status = 'failed';
    job.finishedAt = new Date().toISOString();
    pushLog(job.error);
    return { started: false, reason: job.error, job: jobStatus() };
  }

  (async () => {
    try {
      job.steps[0].status = 'running';
      await run(PYTHON, [path.join('ml', 'train.py')]);
      job.steps[0].status = 'done';
      job.steps[1].status = 'running';
      await run(process.execPath, [path.join('scripts', 'build-store.mjs')]);
      job.steps[1].status = 'done';
      job.steps[2].status = 'running';
      await onSuccess();
      job.steps[2].status = 'done';
      job.status = 'succeeded';
      pushLog('Store reloaded — new model artefacts are live.');
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      const running = job.steps.find((s) => s.status === 'running');
      if (running) running.status = 'failed';
      pushLog(`FAILED: ${err.message}`);
    } finally {
      job.finishedAt = new Date().toISOString();
    }
  })();

  return { started: true, job: jobStatus() };
}
