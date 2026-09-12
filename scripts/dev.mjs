/**
 * Starts the API and the Vite dev server together.
 *
 *   npm run dev
 *
 * Both processes share this terminal; Ctrl-C stops both. The API must be up for
 * any screen to have data, which is why `dev` runs the pair rather than Vite
 * alone.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const required = [
  'data/store/cases.bin',
  'data/store/cases.meta.json',
  'data/api/summary.json',
  'data/api/projects.json',
  'data/model/surrogate.json',
];
const missing = required.filter((p) => !fs.existsSync(path.join(ROOT, p)));
if (missing.length) {
  console.error('\nThe data artefacts have not been built yet. Missing:');
  for (const m of missing) console.error(`  - ${m}`);
  console.error('\nBuild them with:\n  npm run data        (generator -> model -> store -> PDF)\n');
  process.exit(1);
}

const children = [];
/**
 * `shell` is opt-in per process: npx needs it on Windows, but running the API
 * through a shell would break on the spaces in Node's own install path.
 */
const start = (label, command, args, color, { shell = false } = {}) => {
  const child = spawn(command, args, { cwd: ROOT, shell, stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (stream, chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) stream.write(`\x1b[${color}m${label}\x1b[0m ${line}\n`);
    }
  };
  child.stdout.on('data', (c) => write(process.stdout, c));
  child.stderr.on('data', (c) => write(process.stderr, c));
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n${label} exited with code ${code}; stopping.`);
      stopAll();
      process.exit(code);
    }
  });
  children.push(child);
  return child;
};

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});

start('[api] ', process.execPath, [path.join(ROOT, 'server', 'index.mjs')], '36');
start('[web] ', 'npx', ['vite'], '35', { shell: process.platform === 'win32' });
