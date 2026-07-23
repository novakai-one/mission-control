// Team-join tests (mission_mission-control-ux ruling S2) — composed cases
// over the four separate derivations. Run with:
//   npx tsx src/backend/missionView/snapshot/team/index.test.ts
import assert from 'node:assert/strict';
import { deriveSnapshot } from '../index.js';
import type { MissionFacts } from '../index.js';
import { resolveLinkage } from '../../linkage/index.js';
import type { MissionLinkage } from '../../linkage/index.js';
import type { RawRecord, RegistryEntry, StoreName } from '../../sources/index.js';
import { agentEntry, agentLine, assignedTaskLine, missionLine, taskLine } from '../../tests/fixtures.js';

function record(store: StoreName, line: number, json: string): RawRecord {
  return { store, path: `/fake/${store}.jsonl`, line, block: JSON.parse(json) as Record<string, unknown> };
}

function storesOf(partials: Partial<Record<StoreName, RawRecord[]>>): Record<StoreName, RawRecord[]> {
  return {
    'missions': [], 'tasks': [], 'okrs': [], 'requests': [], 'issues': [], 'captains-log': [],
    'projects': [], 'teams': [], 'agents': [], 'artifacts': [], 'threads': [], ...partials,
  };
}

function linked(missionId: string, stores: Record<StoreName, RawRecord[]>): MissionLinkage {
  const result = resolveLinkage(missionId, stores);
  assert.equal(result.status, 'resolved');
  return (result as { linkage: MissionLinkage }).linkage;
}

function makeFacts(linkage: MissionLinkage, overrides: Partial<MissionFacts> = {}): MissionFacts {
  return {
    missionId: String(linkage.mission.block.id),
    linkage,
    stores: storesOf({}),
    journal: [],
    journalPath: '/fake/messages.jsonl',
    registry: [],
    registryPath: '/fake/agents.json',
    registryObservedAt: null,
    rooms: [],
    roomsPath: '/fake/rooms.jsonl',
    packet: [],
    readProblems: [],
    asOf: '2026-07-21T13:00:00.000Z',
    ...overrides,
  };
}

/* ---------- The team join (ruling S2) — composed cases ---------------------- */

function teamStores(): Record<StoreName, RawRecord[]> {
  return storesOf({
    'missions': [record('missions', 11, missionLine('mission_a', ',"notes":"nine findings to zero"'))],
    'agents': [
      record('agents', 1, agentLine('agent_chief', 'chief-kimi-4', 'mission_a', 'live', 'session_ext-1')),
      record('agents', 2, agentLine('agent_worker', 'Worker Fable UX', 'mission_a', 'live', 'sess-worker')),
      record('agents', 3, agentLine('agent_idle', 'Idle Member', 'mission_a', 'live')),
      record('agents', 4, agentLine('agent_retired', 'Worker Old', 'mission_a', 'retired', 'sess-old')),
      record('agents', 5, agentLine('agent_other', 'Other Mission', 'mission_b', 'live', 'sess-other')),
    ],
    'tasks': [
      record('tasks', 1, assignedTaskLine('task_doing', 'mission_a', 'agent_worker', 'doing')),
      record('tasks', 2, assignedTaskLine('task_todo', 'mission_a', 'agent_worker', 'todo')),
      record('tasks', 3, assignedTaskLine('task_blocked', 'mission_a', 'agent_idle', 'blocked', 'waiting on ruling')),
      record('tasks', 4, taskLine('task_unassigned', 'mission_a')),
    ],
  });
}

/** Durable-only external Chief + runtime-backed worker + member with no task
 * + assigned todo/doing/blocked + retired member — every fact separate.
 * Membership half of the composed case (same fixture). */
function testTeamJoinMembership(): void {
  const registryWorker = { ...agentEntry('agent_worker'), title: 'Worker Fable UX' } as unknown as RegistryEntry;
  const snapshot = deriveSnapshot(makeFacts(linked('mission_a', teamStores()), {
    stores: teamStores(),
    registry: [registryWorker],
    registryObservedAt: '2026-07-21T12:30:00.000Z',
  }));

  assert.equal(snapshot.mission.notes.value, 'nine findings to zero', 'mission notes render (#9 G1)');

  // Membership: all four mission-ref'd agents, live first, other-mission excluded.
  assert.deepEqual(snapshot.members.map((member) => member.agentId),
    ['agent_chief', 'agent_idle', 'agent_worker', 'agent_retired'],
    'membership from typed refs — live first then name, retired still a member');
}

/** Presence half of the composed case: external chief honest, runtime-backed
 * worker carries the registry's word, no-session members stay out. */
function testTeamJoinPresence(): void {
  const registryWorker = { ...agentEntry('agent_worker'), title: 'Worker Fable UX' } as unknown as RegistryEntry;
  const snapshot = deriveSnapshot(makeFacts(linked('mission_a', teamStores()), {
    stores: teamStores(),
    registry: [registryWorker],
    registryObservedAt: '2026-07-21T12:30:00.000Z',
  }));
  // Presence: external chief (no registry entry) is an HONEST external row.
  const chief = snapshot.presences.find((presence) => presence.agentId === 'agent_chief');
  assert.equal(chief?.status, 'external', 'no PTY claim — external session');
  assert.equal(chief?.sessionId, 'session_ext-1');
  assert.deepEqual(chief?.sourceRefs.map((sourceRef) => sourceRef.store), ['agents'], 'durable provenance only');
  // Runtime-backed worker carries the registry's word + both provenances.
  const worker = snapshot.presences.find((presence) => presence.agentId === 'agent_worker');
  assert.equal(worker?.status, 'running');
  assert.equal(worker?.observedAt, '2026-07-21T12:30:00.000Z', 'registry mtime is the observation (L2)');
  assert.deepEqual(worker?.sourceRefs.map((sourceRef) => sourceRef.store), ['agents', 'registry']);
  // Idle member has no session pointer → member, not presence; retired → never.
  assert.ok(!snapshot.presences.some((presence) => presence.agentId === 'agent_idle'));
  assert.ok(!snapshot.presences.some((presence) => presence.agentId === 'agent_retired'));
}

/** Assignments/activity half of the composed case (same fixture). */
function testTeamJoinAssignments(): void {
  const registryWorker = { ...agentEntry('agent_worker'), title: 'Worker Fable UX' } as unknown as RegistryEntry;
  const snapshot = deriveSnapshot(makeFacts(linked('mission_a', teamStores()), {
    stores: teamStores(),
    registry: [registryWorker],
    registryObservedAt: '2026-07-21T12:30:00.000Z',
  }));
  // Assignments: task→agent+mission only; doing→blocked→todo order; no invented role.
  assert.deepEqual(snapshot.assignments.map((assignment) => assignment.taskId),
    ['task_doing', 'task_blocked', 'task_todo'], 'assigned tasks under honest statuses');
  const blocked = snapshot.assignments.find((assignment) => assignment.taskId === 'task_blocked');
  assert.equal(blocked?.blockedReason, 'waiting on ruling');
  assert.equal(blocked?.personName, 'Idle Member', 'person resolved by durable agentId');

  // Current activity: doing ONLY (S2.3).
  assert.deepEqual(snapshot.currentActivity.map((activity) => activity.summary), ['Task task_doing']);
  assert.equal(snapshot.currentActivity[0].personId, 'agent_worker');

  // Attention: all three Team gaps clear — the facts are proven.
  const attentionIds = new Set(snapshot.attention.map((entry) => entry.id));
  assert.ok(!attentionIds.has('attention:no-assignments'), 'assignments proven → gap clears');
  assert.ok(!attentionIds.has('attention:no-presences'), 'presence proven → gap clears');
  assert.ok(!attentionIds.has('attention:no-current-activity'), 'doing task proven → gap clears');
}

/** Attention clears ONLY for the fact proven — membership alone clears nothing. */
function testAttentionClearsPerFact(): void {
  const stores = storesOf({
    'missions': [record('missions', 11, missionLine('mission_a'))],
    'agents': [record('agents', 1, agentLine('agent_idle', 'Idle Member', 'mission_a', 'live'))],
  });
  const snapshot = deriveSnapshot(makeFacts(linked('mission_a', stores), { stores }));
  assert.equal(snapshot.members.length, 1, 'membership proven');
  const attentionIds = new Set(snapshot.attention.map((entry) => entry.id));
  assert.ok(attentionIds.has('attention:no-assignments'), 'no task assignment → gap stays');
  assert.ok(attentionIds.has('attention:no-presences'), 'no session pointer → gap stays');
  assert.ok(attentionIds.has('attention:no-current-activity'), 'no doing task → gap stays');
}

/** Malformed + duplicate agent records are visible problems, never silent (S2.5). */
function testTeamJoinProblems(): void {
  const stores = storesOf({
    'missions': [record('missions', 11, missionLine('mission_a'))],
    'agents': [
      record('agents', 1, '{"id":"agent_dup","kind":"agent","ts":"2026-07-21T10:00:00+10:00","name":"Dup","provider":"kimi","status":"spawning","refs":[{"kind":"mission","value":"mission_a"}]}'),
      record('agents', 2, agentLine('agent_dup', 'Dup', 'mission_a', 'live', 'sess-dup')),
      record('agents', 3, '{"id":"agent_broken","kind":"agent","ts":"2026-07-21T10:00:00+10:00","provider":"kimi","refs":[]}'),
    ],
  });
  const snapshot = deriveSnapshot(makeFacts(linked('mission_a', stores), { stores }));
  assert.equal(snapshot.members.length, 1, 'duplicate folds last-wins; malformed skipped');
  assert.equal(snapshot.members[0].durableStatus, 'live', 'last record wins');
  assert.ok(snapshot.issues.some((issue) => issue.message.includes("duplicate id 'agent_dup' in agents.jsonl")));
  assert.ok(snapshot.issues.some((issue) => issue.message.includes('malformed agent record skipped: agents.jsonl:3')));
  assert.equal(snapshot.pulse.health.value, 'attention', 'problems fold into health');
}

/** Multi-agent × multi-task fixture — the indexed join stays correct at width. */
function testTeamJoinWidth(): void {
  const agents = Array.from({ length: 4 }, (_unused, index) =>
    record('agents', index + 1, agentLine(`agent_w${index}`, `Agent W${index}`, 'mission_a', 'live', `sess-${index}`)));
  const tasks = Array.from({ length: 12 }, (_unused, index) =>
    record('tasks', index + 1, assignedTaskLine(`task_w${index}`, 'mission_a', `agent_w${index % 4}`, index % 3 === 0 ? 'doing' : 'done')));
  const stores = storesOf({ 'missions': [record('missions', 11, missionLine('mission_a'))], 'agents': agents, 'tasks': tasks });
  const snapshot = deriveSnapshot(makeFacts(linked('mission_a', stores), { stores }));
  assert.equal(snapshot.members.length, 4);
  assert.equal(snapshot.assignments.length, 12);
  assert.equal(snapshot.currentActivity.length, 4, 'exactly the doing tasks');
  assert.ok(snapshot.assignments.every((assignment) => assignment.personName.startsWith('Agent W'), 'every task resolved its person by id'));
}


testTeamJoinMembership();
testTeamJoinPresence();
testTeamJoinAssignments();
testAttentionClearsPerFact();
testTeamJoinProblems();
testTeamJoinWidth();
console.log('team join: all assertions passed');
