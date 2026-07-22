// Mission tree derivation tests (plan v2 §1.6): the full chain from stores,
// gap states as explicit absences. Run with
// `npx tsx src/backend/missionView/tree/index.test.ts`.
import assert from 'node:assert/strict';
import { buildTree } from './index.js';
import type { RawRecord, StoreName } from '../sources/index.js';

function record(store: StoreName, line: number, block: Record<string, unknown>): RawRecord {
  return { store, path: `/fake/${store}.jsonl`, line, block };
}

function storesOf(partials: Partial<Record<StoreName, RawRecord[]>>): Record<StoreName, RawRecord[]> {
  return {
    'missions': [], 'tasks': [], 'okrs': [], 'requests': [], 'issues': [], 'captains-log': [],
    'projects': [], 'teams': [], 'agents': [], 'artifacts': [], 'threads': [], ...partials,
  };
}

const makeRef = (kind: string, value: string) => ({ kind, value });
const mission = record('missions', 1, {
  id: 'mission_m', kind: 'mission', 'ts': 't', title: 'M', owner: 'chief',
  refs: [makeRef('project', 'proj_p')],
});

// --- full chain --------------------------------------------------------------

{
  const stores = storesOf({
    missions: [mission],
    projects: [record('projects', 1, { id: 'proj_p', kind: 'project', title: 'Command', refs: [makeRef('objective', 'okr_o')] })],
    okrs: [
      record('okrs', 1, { id: 'okr_o', kind: 'objective', title: 'Number one agent app' }),
      record('okrs', 2, { id: 'kr_1', kind: 'kr', objective: 'okr_o', body: 'Ship the tree' }),
      record('okrs', 3, { id: 'kr_other', kind: 'kr', objective: 'okr_zzz', body: 'Unrelated' }),
    ],
    teams: [record('teams', 1, { id: 'team_t', kind: 'team', name: 'Crew', refs: [makeRef('mission', 'mission_m')] })],
    agents: [
      record('agents', 1, { id: 'agent_b', kind: 'agent', name: 'beta', provider: 'kimi', status: 'live', sessionId: 's2', refs: [makeRef('team', 'team_t'), makeRef('mission', 'mission_m')] }),
      record('agents', 2, { id: 'agent_a', kind: 'agent', name: 'alpha', provider: 'claude', status: 'live', sessionId: 's1', refs: [makeRef('team', 'team_t'), makeRef('mission', 'mission_m')] }),
    ],
    tasks: [
      record('tasks', 1, { id: 'task_1', kind: 'task', title: 'One', status: 'done', updated: '2026-07-22T01:00:00Z', refs: [makeRef('mission', 'mission_m'), makeRef('agent', 'agent_a')] }),
      record('tasks', 2, { id: 'task_2', kind: 'task', title: 'Two', status: 'blocked', blockedReason: 'gate pending', updated: '2026-07-22T02:00:00Z', refs: [makeRef('mission', 'mission_m'), makeRef('agent', 'agent_a')] }),
      record('tasks', 3, { id: 'task_3', kind: 'task', title: 'Free', status: 'todo', updated: '2026-07-22T03:00:00Z', refs: [makeRef('mission', 'mission_m')] }),
      record('tasks', 4, { id: 'task_other', kind: 'task', title: 'Elsewhere', status: 'todo', refs: [makeRef('mission', 'mission_zzz'), makeRef('agent', 'agent_a')] }),
    ],
    artifacts: [
      record('artifacts', 1, { id: 'artifact_1', kind: 'artifact', title: 'Shot', path: 'e/shot.png', refs: [makeRef('task', 'task_2')] }),
      record('artifacts', 2, { id: 'artifact_2', kind: 'artifact', title: 'Doc', 'url': 'https://x', refs: [makeRef('mission', 'mission_m')] }),
      record('artifacts', 3, { id: 'artifact_far', kind: 'artifact', title: 'Far', path: 'y', refs: [makeRef('mission', 'mission_zzz')] }),
    ],
    threads: [record('threads', 1, { id: 'thread_1', kind: 'thread', roomId: 'room_r', refs: [makeRef('mission', 'mission_m')] })],
  });

  const tree = buildTree('mission_m', mission, stores);

  assert.deepEqual(tree.ancestry.map((entry) => [entry.kind, entry.label]), [
    ['project', 'Command'], ['objective', 'Number one agent app'], ['kr', 'Ship the tree'],
  ], 'ancestry path is project → objective → its KRs only');

  assert.equal(tree.team?.name, 'Crew');
  assert.deepEqual(tree.agents.map((agent) => agent.name), ['alpha', 'beta'], 'agents sorted by name');

  const alpha = tree.agents[0];
  assert.equal(alpha.totalCount, 2);
  assert.equal(alpha.doneCount, 1);
  assert.equal(alpha.tasks.find((task) => task.id === 'task_2')?.blockedReason, 'gate pending');
  assert.equal(alpha.tasks.some((task) => task.id === 'task_other'), false, 'other-mission tasks never leak in');
  assert.equal(tree.agents[1].totalCount, 0, 'beta has an honest empty checklist');

  assert.deepEqual(tree.unassignedTasks.map((task) => task.id), ['task_3'], 'mission tasks without an agent are the gap group');

  assert.deepEqual(tree.artifacts.map((artifact) => artifact.id), ['artifact_2'], 'mission level holds mission-anchored artifacts only (C3)');
  const blockedTask = alpha.tasks.find((task) => task.id === 'task_2');
  assert.deepEqual(blockedTask?.artifacts.map((artifact) => artifact.id), ['artifact_1'], 'task-anchored artifact nests under its task (C3)');
  assert.deepEqual(tree.threads.map((thread) => thread.roomId), ['room_r']);
  console.log('full-chain tree test passed');
}

// --- gap states: absences stay absent ----------------------------------------

{
  const bare = record('missions', 1, { id: 'mission_bare', kind: 'mission', 'ts': 't', title: 'Bare', owner: 'chief' });
  const tree = buildTree('mission_bare', bare, storesOf({ missions: [bare] }));
  assert.equal(tree.team, null, 'no team → null, not invented');
  assert.deepEqual(tree.ancestry, [], 'no project/objective link → empty ancestry');
  assert.deepEqual(tree.agents, []);
  assert.deepEqual(tree.unassignedTasks, []);
  assert.deepEqual(tree.artifacts, []);
  assert.deepEqual(tree.threads, []);
  console.log('gap-state tree test passed');
}

// --- legacy: mission-level objective ref stands in when no project link ------

{
  const legacy = record('missions', 1, {
    id: 'mission_l', kind: 'mission', 'ts': 't', title: 'L', owner: 'chief', refs: [makeRef('objective', 'okr_o')],
  });
  const stores = storesOf({
    missions: [legacy],
    okrs: [record('okrs', 1, { id: 'okr_o', kind: 'objective', title: 'Direct' })],
  });
  const tree = buildTree('mission_l', legacy, stores);
  assert.deepEqual(tree.ancestry.map((entry) => entry.kind), ['objective'], 'objective ancestry without a project step');
  console.log('legacy-ancestry tree test passed');
}

console.log('mission tree tests passed');
