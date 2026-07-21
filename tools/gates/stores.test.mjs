import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'stores.mjs');
const FIXTURES = path.join(HERE, '..', '..', 'scripts', 'store', 'fixtures');
const TS = '2026-07-21T15:00:00+10:00';

function freshSetup(fixture) {
  const root = mkdtempSync(path.join(tmpdir(), 'nvk-gate-test-'));
  const storeDir = path.join(root, 'stores');
  cpSync(path.join(FIXTURES, fixture), storeDir, { recursive: true });
  return { root, storeDir, baseline: path.join(root, 'stores-baseline.json') };
}

function gate(storeDir, baseline, extra = []) {
  return spawnSync('node', [GATE, '--dir', storeDir, '--baseline', baseline, ...extra], { encoding: 'utf8' });
}

// --- baseline lifecycle ------------------------------------------------------

{
  // no baseline → explicit exit 2, never a silent pass
  const { root, storeDir, baseline } = freshSetup('known-drift');
  const missing = gate(storeDir, baseline);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr + missing.stdout, /--update/);
  // --update writes fingerprints + id inventory; immediate re-run passes
  const update = gate(storeDir, baseline, ['--update']);
  assert.equal(update.status, 0, update.stderr);
  const written = JSON.parse(readFileSync(baseline, 'utf8'));
  assert.equal(written.version, 1);
  assert.ok(written.fingerprints.length > 0);
  assert.ok(written.ids.includes('mission_m1-orchestration-tooling'));
  const pass = gate(storeDir, baseline);
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /PASS/);
  rmSync(root, { recursive: true, force: true });
}

// --- new drift fails even when counts stay equal (S6: no migration blindspot) --

{
  const { root, storeDir, baseline } = freshSetup('known-drift');
  gate(storeDir, baseline, ['--update']);
  // remove one drifted record (a CORE-MISSING task) AND add a different drifted
  // record with the same violation code — total count unchanged, fingerprints migrate
  const tasksPath = path.join(storeDir, 'tasks.jsonl');
  writeFileSync(tasksPath, JSON.stringify({ id: 'task_migrated-drift', kind: 'task', title: 'still no ts' }) + '\n');
  const fail = gate(storeDir, baseline);
  assert.equal(fail.status, 1);
  assert.match(fail.stdout + fail.stderr, /task_migrated-drift/, 'the NEW fingerprint must be named');
  rmSync(root, { recursive: true, force: true });
}

// --- id permanence -----------------------------------------------------------

{
  const { root, storeDir, baseline } = freshSetup('known-valid');
  gate(storeDir, baseline, ['--update']);
  // deleting an inventoried, unreferenced record fails the inventory check
  const issuesPath = path.join(storeDir, 'issues.jsonl');
  writeFileSync(issuesPath, '');
  const fail = gate(storeDir, baseline);
  assert.equal(fail.status, 1);
  assert.match(fail.stdout + fail.stderr, /issue_fixture-one/);
  assert.match(fail.stdout + fail.stderr, /tombstone/i, 'failure message must point at the tombstone law');
  // a tombstone keeps the id present — gate passes again
  writeFileSync(issuesPath, JSON.stringify({
    id: 'issue_fixture-one', kind: 'issue', ts: TS, status: 'refiled', refiledTo: 'mission_fixture-prime', updated: TS,
  }) + '\n');
  const pass = gate(storeDir, baseline);
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  rmSync(root, { recursive: true, force: true });
}

// --- shrink is reported, not failed ------------------------------------------

{
  const { root, storeDir, baseline } = freshSetup('known-drift');
  gate(storeDir, baseline, ['--update']);
  // repair-by-hand of one drifted record (test-fixture edit, not a store op):
  // add ts to the missing-ts task → its fingerprint vanishes, nothing new appears
  const tasksPath = path.join(storeDir, 'tasks.jsonl');
  const record = JSON.parse(readFileSync(tasksPath, 'utf8').trim());
  writeFileSync(tasksPath, JSON.stringify({ ...record, ts: TS }) + '\n');
  const shrink = gate(storeDir, baseline);
  assert.equal(shrink.status, 0, shrink.stdout + shrink.stderr);
  assert.match(shrink.stdout, /shrunk|vanished|--update/i);
  rmSync(root, { recursive: true, force: true });
}

// --- missing dir -------------------------------------------------------------

{
  const result = spawnSync('node', [GATE, '--dir', '/nonexistent/stores', '--baseline', '/tmp/nope.json'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
}

console.log('gate tests passed');
