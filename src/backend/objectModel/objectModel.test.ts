// Object-model write interface (plan v2 §1.2/§1.4): domain verbs over the
// store engine — creation, session attach idempotency + Presence-history
// rotation, explicit failure records, task transitions, the thread link.
// Run with `npx tsx src/backend/objectModel/objectModel.test.ts`.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ObjectModel, ObjectModelError } from './index.js';
import { readStoreDir } from '../stores/store.mjs';

const TS = '2026-07-22T10:00:00+10:00';
const STORE_FILES = [
  'decisions.jsonl', 'requests.jsonl', 'missions.jsonl', 'tasks.jsonl', 'captains-log.jsonl',
  'learnings.jsonl', 'okrs.jsonl', 'projects.jsonl', 'issues.jsonl',
  'teams.jsonl', 'agents.jsonl', 'artifacts.jsonl', 'threads.jsonl',
];

function scratchStores(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'nvk-objectmodel-'));
  for (const name of STORE_FILES) writeFileSync(path.join(dir, name), '');
  writeFileSync(path.join(dir, 'missions.jsonl'), [
    JSON.stringify({ id: 'mission_alpha', kind: 'mission', ts: TS, title: 'Alpha', owner: 'chief' }),
    JSON.stringify({ id: 'mission_beta', kind: 'mission', ts: TS, title: 'Beta', owner: 'chief' }),
  ].join('\n') + '\n');
  return dir;
}

function blockById(dir: string, storeFile: string, id: string): Record<string, unknown> {
  const record = readStoreDir(dir).files[storeFile].records.find((entry) => entry.block.id === id);
  assert.ok(record, `${id} exists in ${storeFile}`);
  return record.block;
}

const dir = scratchStores();
const model = new ObjectModel({ storesDir: dir });

// --- team + agent creation, mission agreement --------------------------------

const teamId = model.createTeam({ name: 'Object Model Crew', missionId: 'mission_alpha' });
assert.match(teamId, /^team_/);
assert.equal(blockById(dir, 'teams.jsonl', teamId).name, 'Object Model Crew');

const agentId = model.createAgent({ name: 'Worker One', provider: 'claude', teamId, missionId: 'mission_alpha' });
assert.equal(blockById(dir, 'agents.jsonl', agentId).status, 'spawning');

assert.throws(
  () => model.createAgent({ name: 'Lost', provider: 'claude', teamId, missionId: 'mission_beta' }),
  ObjectModelError,
  'agent whose team refs a different mission is rejected',
);
assert.throws(
  () => model.createAgent({ name: 'Ghost', provider: 'claude', teamId: 'team_ghost', missionId: 'mission_alpha' }),
  ObjectModelError,
  'dangling team ref is rejected',
);
console.log('team/agent creation tests passed');

// --- session attach: idempotent, replayable, history-preserving --------------

assert.equal(model.attachAgentSession('agent_not-in-model', 'session-1'), 'unknown', 'non-model agents are not an error');

assert.equal(model.attachAgentSession(agentId, 'session-1'), 'attached');
let agentBlock = blockById(dir, 'agents.jsonl', agentId);
assert.equal(agentBlock.sessionId, 'session-1');
assert.equal(agentBlock.status, 'live');

assert.equal(model.attachAgentSession(agentId, 'session-1'), 'noop', 'replayed callback is a no-op');

assert.equal(model.attachAgentSession(agentId, 'session-2'), 'attached');
agentBlock = blockById(dir, 'agents.jsonl', agentId);
assert.equal(agentBlock.sessionId, 'session-2');
assert.deepEqual(agentBlock.sessions, ['session-1'], 'previous Presence rotated into history, never erased (M13)');
console.log('session attach tests passed');

// --- explicit failure record -------------------------------------------------

const doomedId = model.createAgent({ name: 'Doomed', provider: 'codex', teamId, missionId: 'mission_alpha' });
model.markAgentFailed(doomedId, 'PTY launch refused');
const doomed = blockById(dir, 'agents.jsonl', doomedId);
assert.equal(doomed.status, 'failed');
assert.equal(doomed.failureReason, 'PTY launch refused');
console.log('failure record test passed');

// --- tasks as data: create + transitions -------------------------------------

const taskId = model.createTask({ title: 'Wire the tree', missionId: 'mission_alpha', agentId });
assert.equal(blockById(dir, 'tasks.jsonl', taskId).status, 'todo');

model.transitionTask(taskId, 'doing');
assert.equal(blockById(dir, 'tasks.jsonl', taskId).status, 'doing');

model.transitionTask(taskId, 'blocked', 'waiting on snapshot schema');
let taskBlock = blockById(dir, 'tasks.jsonl', taskId);
assert.equal(taskBlock.status, 'blocked');
assert.equal(taskBlock.blockedReason, 'waiting on snapshot schema');

model.transitionTask(taskId, 'done');
taskBlock = blockById(dir, 'tasks.jsonl', taskId);
assert.equal(taskBlock.status, 'done');
assert.equal(taskBlock.blockedReason, undefined, 'reason leaves with the blocked status');

assert.throws(() => model.transitionTask(taskId, 'blocked'), ObjectModelError, 'blocked without a reason is rejected');
console.log('task transition tests passed');

// --- thread link + artifact + mission reads ----------------------------------

const threadId = model.createThread({ roomId: 'room_0e74e755', missionId: 'mission_alpha' });
assert.match(threadId, /^thread_/);
assert.equal(model.missionForRoom('room_0e74e755'), 'mission_alpha');
assert.equal(model.missionForRoom('room_unlinked'), null);

const artifactId = model.recordArtifact({ title: 'Tree screenshot', path: 'evidence/tree.png', missionId: 'mission_alpha', taskId });
assert.equal(blockById(dir, 'artifacts.jsonl', artifactId).path, 'evidence/tree.png');
assert.throws(
  () => model.recordArtifact({ title: 'Nowhere', path: 'x.md' }),
  ObjectModelError,
  'artifact without a mission/task anchor is rejected',
);

assert.equal(model.missionForAgent(agentId), 'mission_alpha');
const roster = model.missionAgents('mission_alpha');
assert.deepEqual(roster.map((block) => block.id).sort(), [agentId, doomedId].sort(), 'membership derives from Agent refs');
console.log('thread/artifact/read tests passed');

rmSync(dir, { recursive: true, force: true });
console.log('object-model module tests passed');
