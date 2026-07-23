import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, 'nvk-mission.mjs');
const STORE_CLI = path.join(HERE, 'nvk-store.mjs');
const KNOWN_VALID = path.join(HERE, '..', 'src', 'backend', 'stores', 'fixtures', 'known-valid');

function freshDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'nvk-mission-test-'));
  cpSync(KNOWN_VALID, dir, { recursive: true });
  // fixture scaffolding: known-valid predates the object-model stores
  writeFileSync(path.join(dir, 'teams.jsonl'), '');
  writeFileSync(path.join(dir, 'agents.jsonl'), '');
  return dir;
}

const run = (args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
const audit = (dir) => spawnSync('node', [STORE_CLI, 'audit', '--dir', dir], { encoding: 'utf8' });

// T1 — mission-only filing: exit 0, exactly one row appended, store audit-clean after
{
  const dir = freshDir();
  const before = readFileSync(path.join(dir, 'missions.jsonl'));
  const result = run(['create', '--dir', dir, '--id', 'mission_t1', '--title', 'T1 mission', '--owner', 'chief-test', '--project', 'proj_fixture']);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].appended, 'mission_t1');
  assert.equal(lines[0].store, 'missions.jsonl');
  const after = readFileSync(path.join(dir, 'missions.jsonl'), 'utf8');
  const appended = after.slice(before.length);
  const block = JSON.parse(appended);
  assert.equal(block.kind, 'mission');
  assert.equal(block.status, 'todo'); // default
  assert.equal(block.owner, 'chief-test');
  assert.deepEqual(block.refs, [{ kind: 'project', value: 'proj_fixture' }]);
  assert.ok(!('priority' in block) && !('notes' in block), 'absent flags must not produce keys');
  assert.equal(audit(dir).status, 0, 'store must be audit-clean after filing');
  rmSync(dir, { recursive: true, force: true });
}

// T8 — missing required flag: exit 2, nothing written
{
  const dir = freshDir();
  const before = readFileSync(path.join(dir, 'missions.jsonl'));
  const result = run(['create', '--dir', dir, '--id', 'mission_t8', '--title', 'no owner']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--owner/);
  assert.ok(readFileSync(path.join(dir, 'missions.jsonl')).equals(before));
  rmSync(dir, { recursive: true, force: true });
}

console.log('nvk-mission tests passed');
