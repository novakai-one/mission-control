// Object-model schema law (plan v2 §1.0–1.1): the cardinality/authority table
// is TESTED, not just documented (ruling M10). Run directly:
//   npx tsx src/backend/stores/objectmodel.test.mjs
import assert from 'node:assert/strict';
import { parseSnapshot, validateBlock, buildIndex, validateCandidate } from './validate.mjs';

const TS = '2026-07-22T10:00:00+10:00';
const line = (block) => JSON.stringify(block);
const ref = (kind, value) => ({ kind, value });

function snapshotOf(files) {
  return parseSnapshot(Object.fromEntries(
    Object.entries(files).map(([name, blocks]) => [name, blocks.map(line).join('\n') + (blocks.length ? '\n' : '')]),
  ));
}

const world = snapshotOf({
  'missions.jsonl': [
    { id: 'mission_alpha', kind: 'mission', ts: TS, title: 'Alpha', owner: 'chief' },
    { id: 'mission_beta', kind: 'mission', ts: TS, title: 'Beta', owner: 'chief' },
  ],
  'teams.jsonl': [
    { id: 'team_alpha', kind: 'team', ts: TS, name: 'Team Alpha', refs: [ref('mission', 'mission_alpha')] },
  ],
  'tasks.jsonl': [
    { id: 'task_seed', kind: 'task', ts: TS, title: 'Seed', status: 'todo', updated: TS },
  ],
});
const index = buildIndex(world);
const codes = (violations) => violations.map((violation) => violation.code);

// --- team: exactly one mission ref ------------------------------------------

{
  const good = { id: 'team_new', kind: 'team', ts: TS, name: 'New', refs: [ref('mission', 'mission_alpha')] };
  assert.equal(validateBlock(good, { storeFile: 'teams.jsonl', index }).length, 0);

  const none = { id: 'team_none', kind: 'team', ts: TS, name: 'None' };
  assert.ok(codes(validateBlock(none, { storeFile: 'teams.jsonl', index })).includes('REF-CARDINALITY'), 'team without mission ref violates');

  const two = { id: 'team_two', kind: 'team', ts: TS, name: 'Two', refs: [ref('mission', 'mission_alpha'), ref('mission', 'mission_beta')] };
  assert.ok(codes(validateBlock(two, { storeFile: 'teams.jsonl', index })).includes('REF-CARDINALITY'), 'two mission refs violate max 1');
  console.log('team cardinality tests passed');
}

// --- agent: team + mission refs, consistency, status set, sessions array -----

{
  const good = {
    id: 'agent_w1', kind: 'agent', ts: TS, name: 'Worker One', provider: 'claude', status: 'spawning',
    refs: [ref('team', 'team_alpha'), ref('mission', 'mission_alpha')],
  };
  assert.equal(validateBlock(good, { storeFile: 'agents.jsonl', index }).length, 0);

  const bare = { id: 'agent_bare', kind: 'agent', ts: TS, name: 'Bare', provider: 'claude' };
  const bareCodes = codes(validateBlock(bare, { storeFile: 'agents.jsonl', index }));
  assert.equal(bareCodes.filter((code) => code === 'REF-CARDINALITY').length, 2, 'missing team AND mission refs both violate');

  const disagreeing = {
    ...good, id: 'agent_w2',
    refs: [ref('team', 'team_alpha'), ref('mission', 'mission_beta')],
  };
  assert.ok(
    codes(validateBlock(disagreeing, { storeFile: 'agents.jsonl', index })).includes('RELATION-INCONSISTENT'),
    'agent mission must agree with its team mission',
  );

  const badStatus = { ...good, id: 'agent_w3', status: 'zombie' };
  assert.ok(codes(validateBlock(badStatus, { storeFile: 'agents.jsonl', index })).includes('STATUS-UNKNOWN'));
  console.log('agent tests passed');
}

// --- task: blockedReason iff blocked; doing/blocked now legal ----------------

{
  const doing = { id: 'task_d', kind: 'task', ts: TS, title: 'D', status: 'doing', updated: TS };
  assert.equal(validateBlock(doing, { storeFile: 'tasks.jsonl', index }).length, 0, '"doing" is in the documented set');

  const blockedBare = { id: 'task_b', kind: 'task', ts: TS, title: 'B', status: 'blocked', updated: TS };
  assert.ok(codes(validateBlock(blockedBare, { storeFile: 'tasks.jsonl', index })).includes('FIELD-MISSING'), 'blocked needs a reason');

  const blockedGood = { ...blockedBare, blockedReason: 'waiting on gate ruling' };
  assert.equal(validateBlock(blockedGood, { storeFile: 'tasks.jsonl', index }).length, 0);

  const reasonWithoutBlocked = { id: 'task_r', kind: 'task', ts: TS, title: 'R', status: 'todo', blockedReason: 'stale', updated: TS };
  assert.ok(codes(validateBlock(reasonWithoutBlocked, { storeFile: 'tasks.jsonl', index })).includes('FIELD-INVALID'), 'reason without blocked violates');

  // Legacy shape stays valid: no refs, no status beyond todo/done.
  const legacy = { id: 'task_legacy', kind: 'task', ts: TS, title: 'Old', status: 'done', updated: TS };
  assert.equal(validateBlock(legacy, { storeFile: 'tasks.jsonl', index }).length, 0, 'legacy tasks gain no new findings');
  console.log('task tests passed');
}

// --- artifact: exactly one of path|url, anchored to mission/task -------------

{
  const good = { id: 'artifact_a', kind: 'artifact', ts: TS, title: 'Report', path: 'docs/report.md', refs: [ref('mission', 'mission_alpha')] };
  assert.equal(validateBlock(good, { storeFile: 'artifacts.jsonl', index }).length, 0);

  const both = { ...good, id: 'artifact_b', url: 'https://example.com' };
  assert.ok(codes(validateBlock(both, { storeFile: 'artifacts.jsonl', index })).includes('FIELD-INVALID'), 'path AND url violates');

  const neither = { id: 'artifact_c', kind: 'artifact', ts: TS, title: 'Lost', refs: [ref('task', 'task_seed')] };
  assert.ok(codes(validateBlock(neither, { storeFile: 'artifacts.jsonl', index })).includes('FIELD-INVALID'), 'neither path nor url violates');

  const unanchored = { id: 'artifact_d', kind: 'artifact', ts: TS, title: 'Float', path: 'x.md', refs: [ref('log', 'log_x')] };
  assert.ok(codes(validateBlock(unanchored, { storeFile: 'artifacts.jsonl', index })).includes('RELATION-MISSING'), 'artifact must anchor to mission/task');
  console.log('artifact tests passed');
}

// --- thread: roomId required, exactly one resolvable mission ref -------------

{
  const good = { id: 'thread_alpha', kind: 'thread', ts: TS, roomId: 'room_0e74e755', refs: [ref('mission', 'mission_alpha')] };
  assert.equal(validateBlock(good, { storeFile: 'threads.jsonl', index }).length, 0);

  const noRoom = { id: 'thread_b', kind: 'thread', ts: TS, refs: [ref('mission', 'mission_alpha')] };
  assert.ok(codes(validateBlock(noRoom, { storeFile: 'threads.jsonl', index })).includes('FIELD-MISSING'));

  const dangling = { id: 'thread_c', kind: 'thread', ts: TS, roomId: 'room_x', refs: [ref('mission', 'mission_ghost')] };
  assert.ok(codes(validateBlock(dangling, { storeFile: 'threads.jsonl', index })).includes('REF-DANGLING'), 'thread mission ref must resolve');
  console.log('thread tests passed');
}

// --- candidate path: the new stores are recognized append targets ------------

{
  const candidate = line({ id: 'agent_new', kind: 'agent', ts: TS, name: 'New', provider: 'codex', status: 'spawning', refs: [ref('team', 'team_alpha'), ref('mission', 'mission_alpha')] });
  const { violations } = validateCandidate(candidate, { storeFile: 'agents.jsonl', snapshot: world });
  assert.equal(violations.length, 0, 'agent candidate appends cleanly into agents.jsonl');
  console.log('candidate recognition test passed');
}

console.log('object-model schema tests passed');

// --- M1/M10: conditional task authority + mission→project edge (write-strict) --

{
  const missionTaskNoAgent = line({ id: 'task_m1-a', kind: 'task', ts: TS, title: 'A', status: 'todo', updated: TS, refs: [ref('mission', 'mission_alpha')] });
  const strict = validateCandidate(missionTaskNoAgent, { storeFile: 'tasks.jsonl', snapshot: world });
  assert.ok(codes(strict.violations).includes('REF-CARDINALITY'), 'NEW mission task without an agent is rejected at write time');

  const legacyAudit = validateBlock(JSON.parse(missionTaskNoAgent), { storeFile: 'tasks.jsonl', index });
  assert.equal(codes(legacyAudit).includes('REF-CARDINALITY'), false, 'the same shape stays valid on AUDIT — legacy unassigned tasks gain no findings');

  console.log('task write-strict authority tests passed');
}

{
  // Agent on mission_alpha; a new task naming that agent but mission_beta must disagree.
  const seededWorld = snapshotOf({
    'missions.jsonl': [
      { id: 'mission_alpha', kind: 'mission', ts: TS, title: 'Alpha', owner: 'chief' },
      { id: 'mission_beta', kind: 'mission', ts: TS, title: 'Beta', owner: 'chief' },
    ],
    'teams.jsonl': [{ id: 'team_alpha', kind: 'team', ts: TS, name: 'A', refs: [ref('mission', 'mission_alpha')] }],
    'agents.jsonl': [{ id: 'agent_w', kind: 'agent', ts: TS, name: 'w', provider: 'claude', status: 'live', refs: [ref('team', 'team_alpha'), ref('mission', 'mission_alpha')] }],
  });
  const crossTask = line({ id: 'task_m1-b', kind: 'task', ts: TS, title: 'B', status: 'todo', updated: TS, refs: [ref('mission', 'mission_beta'), ref('agent', 'agent_w')] });
  const { violations } = validateCandidate(crossTask, { storeFile: 'tasks.jsonl', snapshot: seededWorld });
  assert.ok(codes(violations).includes('RELATION-INCONSISTENT'), 'task mission must agree with its agent mission');

  const goodTask = line({ id: 'task_m1-c', kind: 'task', ts: TS, title: 'C', status: 'todo', updated: TS, refs: [ref('mission', 'mission_alpha'), ref('agent', 'agent_w')] });
  assert.equal(validateCandidate(goodTask, { storeFile: 'tasks.jsonl', snapshot: seededWorld }).violations.length, 0);
  console.log('task/agent mission-agreement tests passed');
}

{
  const twoProjects = line({
    id: 'mission_m10', kind: 'mission', ts: TS, title: 'M', owner: 'chief',
    refs: [ref('project', 'proj_a'), ref('project', 'proj_b')],
  });
  const seeded = snapshotOf({
    'projects.jsonl': [
      { id: 'proj_a', kind: 'project', ts: TS, title: 'A', status: 'active', path: '/a' },
      { id: 'proj_b', kind: 'project', ts: TS, title: 'B', status: 'active', path: '/b' },
    ],
  });
  const { violations } = validateCandidate(twoProjects, { storeFile: 'missions.jsonl', snapshot: seeded });
  assert.ok(codes(violations).includes('REF-CARDINALITY'), 'a new mission names at most one project (M10 edge)');
  console.log('mission→project cardinality test passed');
}

console.log('M1/M10 authority tests passed');
