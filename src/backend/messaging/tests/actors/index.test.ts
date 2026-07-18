// Actor resolver + reserved-name guard tests (messaging rework task 2). Run
// with `npx tsx src/backend/messaging/tests/actors/index.test.ts`.
import assert from 'node:assert/strict';
import { resolveActor } from '../../actors/index.js';
import { isNameTaken, isReservedName } from '../../address/index.js';
import type { AgentAddress, Room } from '../../types.js';

const roster: AgentAddress[] = [
  { agentId: 'agent_1', name: 'claude-1', provider: 'claude' },
  { agentId: 'agent_2', name: 'codex-1', provider: 'codex' },
];

const rooms: Room[] = [{
  roomId: 'room_ops',
  name: 'ops',
  members: ['claude-1', 'chris'],
  createdBy: 'chris',
  createdAt: new Date().toISOString(),
  archived: false,
}];

function testResolvesTheHuman(): void {
  const actor = resolveActor('chris', roster, rooms);
  assert.deepEqual(actor, { kind: 'human', name: 'chris' }, 'chris is a first-class human actor');
}

function testResolvesAgentsRoomsChannels(): void {
  const agent = resolveActor('codex-1', roster, rooms);
  assert.equal(agent?.kind, 'agent');
  assert.equal(agent.kind === 'agent' ? agent.address.agentId : null, 'agent_2');
  const room = resolveActor('room_ops', roster, rooms);
  assert.equal(room?.kind, 'room');
  assert.equal(room.kind === 'room' ? room.room.name : null, 'ops');
  assert.deepEqual(resolveActor('#team', roster, rooms), { kind: 'channel', name: '#team' });
  assert.equal(resolveActor('room_missing', roster, rooms), null, 'unknown room id resolves to null');
  assert.equal(resolveActor('nobody', roster, rooms), null, 'unknown name resolves to null');
}

function testReservedNames(): void {
  for (const reserved of ['chris', '#team', '#anything', 'room_x']) {
    assert.equal(isReservedName(reserved), true, `${reserved} is reserved`);
    assert.equal(isNameTaken(reserved, []), true, `${reserved} is taken even with an empty roster`);
  }
  assert.equal(isReservedName('claude-1'), false);
  assert.equal(isReservedName('chriss'), false, 'only the exact human name is reserved');
  assert.equal(isNameTaken('claude-2', []), false, 'ordinary free names pass');
}

testResolvesTheHuman();
testResolvesAgentsRoomsChannels();
testReservedNames();
console.log('PASS');
