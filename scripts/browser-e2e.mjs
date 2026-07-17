// Real end-to-end isolation proof. Spawns TWO headless Chromes in parallel via
// the actual CLI (exactly as an agent would), navigates each to a distinct local
// page, screenshots both, and asserts they got separate instances. Read the two
// PNGs afterwards to confirm each shows the right page (no cross-talk, real
// render, and — being headless — no window ever appears).
//
//   node scripts/browser-e2e.mjs
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const run = promisify(execFile);
const work = mkdtempSync(join(tmpdir(), 'nvk-e2e-'));
const registry = join(work, 'sessions'); // directory: one file per session
const cli = ['tsx', 'src/backend/browser/cli.ts'];

function readSessions() {
  return readdirSync(registry)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(registry, f), 'utf8')));
}

function page(label) {
  const file = join(work, `${label}.html`);
  writeFileSync(file, `<!doctype html><meta charset=utf8><body style="font:120px sans-serif">${label}</body>`);
  return `file://${file}`;
}

async function cliRun(session, args) {
  const env = { ...process.env, NVK_SESSION: session, NVK_BROWSER_REGISTRY: registry };
  const { stdout, stderr } = await run('npx', [...cli, ...args], { env });
  return { stdout, stderr };
}

async function drive(session, label, shotPath) {
  await cliRun(session, ['goto', page(label)]);
  const { stderr } = await cliRun(session, ['shot', shotPath]);
  process.stdout.write(`[${session}] ${stderr.trim()}\n`);
}

async function main() {
  const alphaShot = join(work, 'alpha.png');
  const bravoShot = join(work, 'bravo.png');

  // Both chains run concurrently — the whole point is that they don't fight.
  await Promise.all([
    drive('alpha', 'SESSION-ALPHA', alphaShot),
    drive('bravo', 'SESSION-BRAVO', bravoShot),
  ]);

  const sessions = readSessions();
  assert.equal(sessions.length, 2, 'two isolated sessions registered');
  const ports = new Set(sessions.map((s) => s.instance.port));
  const pids = new Set(sessions.map((s) => s.instance.pid));
  assert.equal(ports.size, 2, 'distinct debug ports');
  assert.equal(pids.size, 2, 'distinct Chrome processes');
  for (const shot of [alphaShot, bravoShot]) {
    assert.ok(statSync(shot).size > 2000, `${shot} is a real screenshot`);
  }

  process.stdout.write('\nISOLATION OK — two separate Chromes, both rendered.\n');
  process.stdout.write(`ALPHA screenshot: ${alphaShot}\n`);
  process.stdout.write(`BRAVO screenshot: ${bravoShot}\n`);
  process.stdout.write(`ports=${[...ports].join(',')} pids=${[...pids].join(',')}\n`);

  // Clean up the two Chrome processes we spawned.
  await Promise.all([cliRun('alpha', ['release']), cliRun('bravo', ['release'])]);
  process.stdout.write('released both sessions.\n');
}

main().catch((err) => { process.stderr.write(`E2E FAIL: ${err.stack ?? err}\n`); process.exit(1); });
