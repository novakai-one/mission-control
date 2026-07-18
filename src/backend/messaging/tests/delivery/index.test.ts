// Delivery adapter seam + honest room-status tests (messaging rework
// task 3). Run with
// `npx tsx src/backend/messaging/tests/delivery/index.test.ts`.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyDelivery } from '../../delivery/index.js';
import { MessageRouter, RoomDeliveryFailedError } from '../../router/index.js';
import { RoomStore } from '../../rooms/index.js';
import { MessageStore } from '../../store/index.js';
import type { AgentAddress, MessageEnvelope } from '../../types.js';

const roster: AgentAddress[] = [
  { agentId: 'agent_1', name: 'claude-1', provider: 'claude' },
  { agentId: 'agent_2', name: 'codex-1', provider: 'codex' },
  { agentId: 'agent_3', name: 'codex-2', provider: 'codex' },
];

const writes: Array<{ agentId: string; data: string }> = [];

/** codex-2's PTY is dead — its write reports failure like a vanished terminal. */
function fakeWrite(agentId: string, data: string): boolean {
  if (agentId === 'agent_3') return false;
  writes.push({ agentId, data });
  return true;
}

function envelope(recipient: string, from = 'claude-1'): MessageEnvelope {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    from,
    'to': recipient,
    delivery: 'normal',
    body: 'hello',
    createdAt: new Date().toISOString(),
    status: 'queued',
  };
}

function makeRouter(): { router: MessageRouter; store: MessageStore; rooms: RoomStore } {
  const root = mkdtempSync(join(tmpdir(), 'nvk-delivery-'));
  const store = new MessageStore(join(root, 'messages.jsonl'));
  const rooms = new RoomStore(join(root, 'rooms.jsonl'));
  const timings = { interruptSettleMs: 0, submitDelayMs: 0 };
  const router = new MessageRouter(store, new PtyDelivery({ write: fakeWrite }, timings), rooms, () => roster);
  return { router, store, rooms };
}

async function testRoomFailureFailsTheEnvelope(): Promise<void> {
  const { router, store, rooms } = makeRouter();
  const room = rooms.create({ name: 'ops', members: ['claude-1', 'codex-1', 'codex-2', 'chris'], createdBy: 'claude-1' });
  const posted = envelope(room.roomId);
  await assert.rejects(
    () => router.route(posted),
    (error: unknown) => error instanceof RoomDeliveryFailedError && /codex-2/.test(error.message),
  );
  assert.equal(store.history()[0]?.status, 'failed', 'any member failure marks the envelope failed');
  assert.ok(writes.some((entry) => entry.agentId === 'agent_2'), 'live members still receive the write');
  assert.ok(!writes.some((entry) => entry.agentId === 'agent_1'), 'sender is skipped');
}

async function testRoomAllLiveDelivers(): Promise<void> {
  const { router, rooms } = makeRouter();
  const room = rooms.create({ name: 'duo', members: ['claude-1', 'codex-1'], createdBy: 'claude-1' });
  const receipt = await router.route(envelope(room.roomId));
  assert.equal(receipt.mode, 'room');
}

async function testHumanDirectMessage(): Promise<void> {
  const { router, store } = makeRouter();
  writes.length = 0;
  const receipt = await router.route(envelope('chris'));
  assert.equal(receipt.mode, 'ui', 'the human adapter reports ui delivery');
  assert.equal(writes.length, 0, 'nothing is typed for the human');
  assert.equal(store.history()[0]?.status, 'delivered');
}

async function testAgentDirectAndUnknown(): Promise<void> {
  const { router, store } = makeRouter();
  writes.length = 0;
  const receipt = await router.route(envelope('codex-1'));
  assert.equal(receipt.mode, 'normal');
  assert.equal(writes[0]?.agentId, 'agent_2', 'agents still get PTY typing through the seam');
  const missing = envelope('nobody');
  await assert.rejects(() => router.route(missing), /not a live agent/);
  assert.equal(store.history({ limit: 1 })[0]?.status, 'failed', 'unknown recipient fails honestly');
}

await testRoomFailureFailsTheEnvelope();
await testRoomAllLiveDelivers();
await testHumanDirectMessage();
await testAgentDirectAndUnknown();
console.log('PASS');
