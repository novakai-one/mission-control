import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'nvk-store.mjs');
const KNOWN_VALID = path.join(HERE, 'fixtures', 'known-valid');
const KNOWN_DRIFT = path.join(HERE, 'fixtures', 'known-drift');
const TS = '2026-07-21T14:00:00+10:00';

function freshDir(source = KNOWN_VALID) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nvk-cli-test-'));
  cpSync(source, dir, { recursive: true });
  return dir;
}

function run(args, stdin) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8', input: stdin });
}

// --- audit verb --------------------------------------------------------------

{
  const dir = freshDir();
  const clean = run(['audit', '--dir', dir]);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /0 findings/);
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = freshDir(KNOWN_DRIFT);
  const drifted = run(['audit', '--dir', dir]);
  assert.equal(drifted.status, 1);
  assert.match(drifted.stdout, /CORE-MISSING/);
  assert.match(drifted.stdout, /DUP-ID/);
  // findings are grouped per store with record ids and line numbers
  assert.match(drifted.stdout, /captains-log\.jsonl/);
  assert.match(drifted.stdout, /log_2026-07-20-035/);
  rmSync(dir, { recursive: true, force: true });
}
{
  const missing = run(['audit', '--dir', '/nonexistent/store/dir']);
  assert.equal(missing.status, 2);
}
{
  // --jsonl: typed blocks on stdout — one audit-run block + one block per finding,
  // ids follow the law they enforce (audit-run_<slug> / audit-finding_<slug>)
  const dir = freshDir(KNOWN_DRIFT);
  const jsonl = run(['audit', '--dir', dir, '--jsonl']);
  assert.equal(jsonl.status, 1);
  const blocks = jsonl.stdout.trim().split('\n').map((line) => JSON.parse(line));
  const runBlock = blocks[0];
  assert.equal(runBlock.kind, 'audit-run');
  assert.match(runBlock.id, /^audit-run_[A-Za-z0-9-]+$/);
  assert.ok(runBlock.ts && runBlock.storeDir && runBlock.countsByCode);
  const findings = blocks.slice(1);
  assert.ok(findings.length > 0);
  for (const finding of findings) {
    assert.equal(finding.kind, 'audit-finding');
    assert.match(finding.id, /^audit-finding_[A-Za-z0-9-]+$/);
    assert.equal(finding.run, runBlock.id);
    assert.ok(finding.store && finding.code && finding.message);
  }
  rmSync(dir, { recursive: true, force: true });
}

// --- append verb -------------------------------------------------------------

{
  // valid append via --line: byte-identical including deliberate whitespace
  const dir = freshDir();
  const raw = '{"id": "task_cli-ws",  "kind": "task", "ts": "2026-07-21T14:00:00+10:00", "title": "W"}';
  const before = readFileSync(path.join(dir, 'tasks.jsonl'));
  const ok = run(['append', '--dir', dir, '--store', 'tasks.jsonl', '--line', raw]);
  assert.equal(ok.status, 0, ok.stderr);
  const after = readFileSync(path.join(dir, 'tasks.jsonl'));
  assert.ok(after.equals(Buffer.concat([before, Buffer.from(raw + '\n')])), 'CLI append must preserve bytes');
  rmSync(dir, { recursive: true, force: true });
}
{
  // stdin mode: one trailing newline stripped, bytes otherwise preserved
  const dir = freshDir();
  const raw = '{"id": "task_cli-stdin", "kind": "task", "ts": "2026-07-21T14:00:00+10:00", "title": "S"}';
  const before = readFileSync(path.join(dir, 'tasks.jsonl'));
  const ok = run(['append', '--dir', dir, '--store', 'tasks.jsonl'], raw + '\n');
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(readFileSync(path.join(dir, 'tasks.jsonl')).equals(Buffer.concat([before, Buffer.from(raw + '\n')])));
  rmSync(dir, { recursive: true, force: true });
}
{
  // rejection: exit 1, violations on stderr, file untouched
  const dir = freshDir();
  const before = readFileSync(path.join(dir, 'tasks.jsonl'));
  const rejected = run(['append', '--dir', dir, '--store', 'tasks.jsonl', '--line',
    JSON.stringify({ id: 'task_cli-bad', kind: 'task', title: 'no ts' })]);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /CORE-MISSING/);
  assert.ok(readFileSync(path.join(dir, 'tasks.jsonl')).equals(before));
  // refusal: exit 2
  const refused = run(['append', '--dir', dir, '--store', '../tasks.jsonl', '--line',
    JSON.stringify({ id: 'task_cli-r', kind: 'task', ts: TS, title: 'T' })]);
  assert.equal(refused.status, 2);
  rmSync(dir, { recursive: true, force: true });
}

// --- S5 race: two concurrent same-id appends → exactly one success, one DUP-ID --

{
  const dir = freshDir();
  const raw = JSON.stringify({ id: 'task_race-winner', kind: 'task', ts: TS, title: 'race' });
  const launch = () => new Promise((resolve) => {
    const child = spawn('node', [CLI, 'append', '--dir', dir, '--store', 'tasks.jsonl', '--line', raw]);
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stderr }));
  });
  const results = await Promise.all([launch(), launch()]);
  const exitCodes = results.map((result) => result.code).sort();
  assert.deepEqual(exitCodes, [0, 1], `expected one success and one rejection, got ${JSON.stringify(results)}`);
  const loser = results.find((result) => result.code === 1);
  assert.match(loser.stderr, /DUP-ID/, 'loser must be a clear duplicate rejection');
  const occurrences = readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8')
    .split('\n').filter((line) => line.includes('task_race-winner'));
  assert.equal(occurrences.length, 1, 'exactly one line appended');
  rmSync(dir, { recursive: true, force: true });
}

// --- F1 regression: enrollment containment ----------------------------------

{
  // an append into a foreign/temp dir must NEVER touch the repo baseline —
  // the exact leak class this validator exists to stop (found by Manager verify)
  const repoBaseline = path.join(HERE, '..', '..', 'stores-baseline.json');
  const baselineBefore = readFileSync(repoBaseline);
  const dir = freshDir();
  const ok = run(['append', '--dir', dir, '--store', 'tasks.jsonl', '--line',
    JSON.stringify({ id: 'task_foreign-no-enroll', kind: 'task', ts: TS, title: 'F' })]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(readFileSync(repoBaseline).equals(baselineBefore),
    'foreign-dir append polluted the repo baseline');
  rmSync(dir, { recursive: true, force: true });
}
{
  // an explicit --baseline enrolls into exactly that file
  const dir = freshDir();
  const explicitBaseline = path.join(dir, 'explicit-baseline.json');
  writeFileSync(explicitBaseline, JSON.stringify({ version: 1, fingerprints: [], ids: [] }) + '\n');
  const ok = run(['append', '--dir', dir, '--store', 'tasks.jsonl',
    '--baseline', explicitBaseline, '--line',
    JSON.stringify({ id: 'task_explicit-enroll', kind: 'task', ts: TS, title: 'E' })]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(JSON.parse(readFileSync(explicitBaseline, 'utf8')).ids.includes('task_explicit-enroll'));
  rmSync(dir, { recursive: true, force: true });
}

console.log('cli tests passed');
