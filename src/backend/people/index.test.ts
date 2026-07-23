// PeopleHub (mission_mission-control-ux, ruling S3): durable-first join keyed
// by agentId, no name folding, external presence honest. Real ObjectModel over
// temp stores for the fold case; runtime list faked. Run with:
//   npx tsx src/backend/people/index.test.ts
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentInfo } from '../terminal/manager.js';
import { ObjectModel, type AgentBlock } from '../objectModel/index.js';
import { PeopleHub } from './index.js';

const STAMP = '2026-07-23T09:00:00+10:00';

function agentBlock(overrides: Partial<AgentBlock> & { id: string; name: string }): AgentBlock {
  return {
    kind: 'agent', 'ts': STAMP, provider: 'kimi', status: 'live',
    refs: [{ kind: 'team', value: 'team_x' }, { kind: 'mission', value: 'mission_x' }],
    ...overrides,
  } as AgentBlock;
}

function runtimeInfo(overrides: Partial<AgentInfo> & { agentId: string; title: string }): AgentInfo {
  return {
    provider: 'claude', sessionId: 'sess-r', projectDir: '/tmp', cwd: '/tmp',
    status: 'running', createdAt: STAMP,
    ...overrides,
  } as AgentInfo;
}

function hubOver(durable: AgentBlock[], runtime: AgentInfo[]): PeopleHub {
  return new PeopleHub({ listAgents: () => durable }, () => runtime);
}

// --- external chief: durable live + sessionId + NO runtime entry -----------
{
  const chief = agentBlock({
    id: 'agent_chief', name: 'chief-kimi-4', status: 'live', sessionId: 'session_ext-1', updated: STAMP,
  });
  const { people } = hubOver([chief], []).listPeople();
  assert.equal(people.length, 1);
  const person = people[0];
  assert.equal(person.agentId, 'agent_chief');
  assert.equal(person.durableStatus, 'live');
  assert.equal(person.runtime, null, 'no PTY entry must stay null — honest external presence');
  assert.equal(person.sessionId, 'session_ext-1');
  assert.equal(person.missionId, 'mission_x');
  assert.equal(person.teamId, 'team_x');
}

// --- retired durable agent ---------------------------------------------------
{
  const retired = agentBlock({ id: 'agent_old', name: 'Worker Old', status: 'retired' });
  const { people } = hubOver([retired], []).listPeople();
  assert.equal(people[0].durableStatus, 'retired');
  assert.equal(people[0].runtime, null);
}

// --- duplicate display names stay DISTINCT; runtime attaches by agentId ------
{
  const first = agentBlock({ id: 'agent_dup-1', name: 'Manager Kimi Visibility', status: 'retired' });
  const second = agentBlock({ id: 'agent_dup-2', name: 'Manager Kimi Visibility', status: 'live', sessionId: 'session_dup-2' });
  const runtime = [runtimeInfo({ agentId: 'agent_dup-2', title: 'Manager Kimi Visibility', status: 'running' })];
  const { people } = hubOver([first, second], runtime).listPeople();
  assert.equal(people.length, 2, 'no name folding — two durable ids are two people');
  const one = people.find((person) => person.agentId === 'agent_dup-1');
  const two = people.find((person) => person.agentId === 'agent_dup-2');
  assert.equal(one?.runtime, null, 'presence must not leak onto the same-named other person');
  assert.deepEqual(two?.runtime, { status: 'running' });
}

// --- runtime-only row (pre-model PTY spawn) ----------------------------------
{
  const runtime = [runtimeInfo({ agentId: 'rt-77', title: 'perf-verify', provider: 'codex', status: 'exited', sessionId: 'sess-77' })];
  const { people } = hubOver([], runtime).listPeople();
  assert.equal(people.length, 1);
  assert.equal(people[0].agentId, 'rt-77');
  assert.equal(people[0].durableStatus, null, 'unknown to the object model — never invented');
  assert.deepEqual(people[0].runtime, { status: 'exited' });
  assert.equal(people[0].sessionId, 'sess-77');
}

// --- response carries asOf ----------------------------------------------------
{
  const response = hubOver([], []).listPeople();
  assert.equal(typeof response.asOf, 'string');
  assert.ok(response.asOf.length > 0);
}

// --- ObjectModel.listAgents folds amended records by id (last line wins) -----
{
  const scratch = mkdtempSync(path.join(tmpdir(), 'nvk-people-'));
  try {
    const early = agentBlock({ id: 'agent_fold', name: 'Folder', status: 'spawning' });
    const late = agentBlock({ id: 'agent_fold', name: 'Folder', status: 'live', sessionId: 'session_late', updated: STAMP });
    writeFileSync(path.join(scratch, 'agents.jsonl'), `${JSON.stringify(early)}\n${JSON.stringify(late)}\n`);
    const model = new ObjectModel({ storesDir: scratch });
    const agents = model.listAgents();
    assert.equal(agents.length, 1, 'duplicate id folds to one record');
    assert.equal(agents[0].status, 'live', 'last line wins');
    const { people } = new PeopleHub(model, () => []).listPeople();
    assert.equal(people.length, 1);
    assert.equal(people[0].sessionId, 'session_late');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

console.log('people hub: all assertions passed');
