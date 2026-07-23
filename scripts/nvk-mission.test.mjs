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

// T2 — full filing: mission + team + 2 tasks; ordered output; refs + updated correct.
// M1 scaffolding: a task append demands an agent whose mission agrees, and no
// agent can pre-exist for a brand-new mission in the wild — so the fixture seeds
// one reffing the to-be-filed mission+team (dangling until the filing resolves it;
// candidate-only validation permits this, and the post-filing audit proves clean).
{
  const dir = freshDir();
  writeFileSync(path.join(dir, 'agents.jsonl'), JSON.stringify({
    id: 'agent_t2-worker', kind: 'agent', ts: '2026-07-21T12:00:00+10:00', name: 'T2 Worker',
    provider: 'claude', status: 'live',
    refs: [{ kind: 'team', value: 'team_t2' }, { kind: 'mission', value: 'mission_t2' }],
  }) + '\n');
  const result = run(['create', '--dir', dir, '--id', 'mission_t2', '--title', 'T2', '--owner', 'chief-test',
    '--team-name', 'Team T2', '--task', 'First task', '--task', 'Second task', '--agent', 'agent_t2-worker',
    '--ref', 'doc=docs/fixture.md|design doc', '--priority', 'important', '--notes', 'note body']);
  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(out.map((row) => row.appended), ['mission_t2', 'team_t2', 'task_t2-1', 'task_t2-2']);
  assert.deepEqual(out.map((row) => row.store), ['missions.jsonl', 'teams.jsonl', 'tasks.jsonl', 'tasks.jsonl']);
  const team = JSON.parse(readFileSync(path.join(dir, 'teams.jsonl'), 'utf8').trim().split('\n').at(-1));
  assert.deepEqual(team.refs, [{ kind: 'mission', value: 'mission_t2' }]);
  assert.equal(team.name, 'Team T2');
  const tasks = readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8').trim().split('\n').slice(-2).map((line) => JSON.parse(line));
  for (const task of tasks) {
    assert.equal(task.status, 'todo');
    assert.equal(task.updated, task.ts, 'creation mints updated = ts');
    assert.deepEqual(task.refs, [{ kind: 'mission', value: 'mission_t2' }, { kind: 'agent', value: 'agent_t2-worker' }]);
  }
  const mission = JSON.parse(readFileSync(path.join(dir, 'missions.jsonl'), 'utf8').trim().split('\n').at(-1));
  assert.deepEqual(mission.refs, [{ kind: 'doc', value: 'docs/fixture.md', label: 'design doc' }]);
  assert.equal(mission.priority, 'important');
  assert.equal(audit(dir).status, 0);
  rmSync(dir, { recursive: true, force: true });
}

console.log('nvk-mission tests passed');
