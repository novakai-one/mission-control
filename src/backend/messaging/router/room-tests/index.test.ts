import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyDelivery } from '../../delivery/index.js';
import { RoomStore } from '../../rooms/index.js';
import { MessageStore } from '../../store/index.js';
import type { AgentAddress, MessageEnvelope } from '../../types.js';
import {
  ChannelInterruptError,
  MessageRouter,
  NotARoomMemberError,
  RoomNotFoundError,
} from '../index.js';

const FAST = { interruptSettleMs: 0, submitDelayMs: 0 };
const ROSTER: AgentAddress[] = [
  { agentId: 'agent_claude', name: 'claude-1', provider: 'claude' },
  { agentId: 'agent_codex_1', name: 'codex-1', provider: 'codex' },
  { agentId: 'agent_codex_2', name: 'codex-2', provider: 'codex' },
];

let counter = 0;
function envelope(recipient: string, overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  counter += 1;
  return {
    id: `msg_room_${counter}`,
    from: 'claude-1',
    'to': recipient,
    delivery: 'normal',
    body: 'room hello',
    createdAt: new Date().toISOString(),
    status: 'queued',
    ...overrides,
  };
}

function fixture(failingAgentId?: string) {
  const root = mkdtempSync(join(tmpdir(), 'nvk-room-router-'));
  const store = new MessageStore(join(root, 'messages.jsonl'));
  const rooms = new RoomStore(join(root, 'rooms.jsonl'));
  const writes: Array<{ agentId: string; data: string }> = [];
  const delivery = new PtyDelivery({
    write(agentId, data) {
      writes.push({ agentId, data });
      return agentId !== failingAgentId;
    },
  }, FAST);
  const router = new MessageRouter(store, delivery, rooms, () => ROSTER);
  const room = rooms.create({
    name: 'Tunnel Builders',
    members: ['claude-1', 'codex-1', 'codex-2', 'offline-1', 'chris'],
    createdBy: 'claude-1',
  });
  return { router, room, store, writes };
}

async function testFanOutSkipsSenderChrisAndOffline(): Promise<void> {
  const { router, room, store, writes } = fixture();
  const message = envelope(room.roomId);
  const receipt = await router.route(message);

  assert.equal(receipt.mode, 'room');
  assert.deepEqual(
    writes.filter((write) => write.data !== '\r').map((write) => write.agentId),
    ['agent_codex_1', 'agent_codex_2'],
  );
  assert.match(writes[0]?.data ?? '', /^\[nvk-room Tunnel Builders from claude-1 id msg_room_/);
  assert.equal(store.history().at(-1)?.status, 'delivered');
}

async function testSenderMustBeMember(): Promise<void> {
  const { router, room, store } = fixture();
  await assert.rejects(
    () => router.route(envelope(room.roomId, { from: 'outsider' })),
    NotARoomMemberError,
  );
  assert.equal(store.history().at(-1)?.status, 'failed');
}

async function testInterruptAndUnknownRoomFail(): Promise<void> {
  const { router, room, store } = fixture();
  await assert.rejects(
    () => router.route(envelope(room.roomId, { delivery: 'interrupt' })),
    ChannelInterruptError,
  );
  assert.equal(store.history().at(-1)?.status, 'failed');
  await assert.rejects(() => router.route(envelope('room_unknown')), RoomNotFoundError);
  assert.equal(store.history().at(-1)?.status, 'failed');
}

async function testDeliveryFailureIsBestEffort(): Promise<void> {
  const { router, room, store, writes } = fixture('agent_codex_1');
  const receipt = await router.route(envelope(room.roomId));
  assert.equal(receipt.mode, 'room');
  assert.ok(writes.some((write) => write.agentId === 'agent_codex_2'), 'live members still receive the write');
  assert.deepEqual(receipt.failed, ['codex-1'], 'failed members land on the receipt');
  assert.equal(store.history().at(-1)?.status, 'partial', 'partial failure settles honestly, not failed');
}

await testFanOutSkipsSenderChrisAndOffline();
await testSenderMustBeMember();
await testInterruptAndUnknownRoomFail();
await testDeliveryFailureIsBestEffort();
console.log('PASS');
