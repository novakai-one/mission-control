// Message router unit tests (agent-messaging phases 2–4). Run with
// `npx tsx src/backend/messaging/router/router.test.ts`.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyDelivery } from '../delivery/index.js';
import {
  MessageRouter,
  InterruptRateLimiter,
  RecipientNotFoundError,
  InterruptRateLimitError,
  ChannelInterruptError,
} from './index.js';
import { MessageStore } from '../store/index.js';
import { TEAM_CHANNEL } from '../types.js';
import type { AgentAddress, MessageEnvelope } from '../types.js';

const FAST = { interruptSettleMs: 0, submitDelayMs: 0 };
const ROSTER: AgentAddress[] = [
  { agentId: 'agent_1', name: 'claude-1', provider: 'claude' },
  { agentId: 'agent_2', name: 'codex-1', provider: 'codex' },
];

let counter = 0;
function envelope(overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  counter += 1;
  return {
    id: `msg_${counter}`, from: 'claude-1', 'to': 'codex-1', delivery: 'normal',
    body: 'hello', createdAt: new Date().toISOString(), status: 'queued',
    ...overrides,
  };
}

interface Fixture {
  router: MessageRouter;
  store: MessageStore;
  writes: Array<{ agentId: string; data: string }>;
  writeOk: { value: boolean };
}

function fixture(limiter?: InterruptRateLimiter): Fixture {
  const store = new MessageStore(join(mkdtempSync(join(tmpdir(), 'nvk-router-')), 'messages.jsonl'));
  const writes: Array<{ agentId: string; data: string }> = [];
  const writeOk = { value: true };
  const write = (agentId: string, data: string): boolean => {
    writes.push({ agentId, data });
    return writeOk.value;
  };
  const router = new MessageRouter(store, new PtyDelivery({ write }, FAST), () => ROSTER, limiter);
  return { router, store, writes, writeOk };
}

async function testDirectMessageDeliversAndSettles(): Promise<void> {
  const { router, store, writes } = fixture();
  const message = envelope();
  const receipt = await router.route(message);
  assert.equal(receipt.messageId, message.id);
  assert.equal(message.status, 'delivered', 'router settles the envelope object');
  assert.equal(store.history({ withAgent: 'codex-1' })[0]?.status, 'delivered', 'store amended to delivered');
  assert.equal(writes[0]?.agentId, 'agent_2', 'name resolved to the recipient PTY');
}

async function testRecipientNotFoundFailsWithRoster(): Promise<void> {
  const { router, store, writes } = fixture();
  const message = envelope({ 'to': 'codex-9' });
  await assert.rejects(() => router.route(message), (error: unknown) => {
    assert.ok(error instanceof RecipientNotFoundError);
    assert.deepEqual(error.roster.map((agent) => agent.name), ['claude-1', 'codex-1'], 'error carries the live roster');
    assert.match(error.message, /claude-1, codex-1/);
    return true;
  });
  assert.equal(store.history().at(-1)?.status, 'failed', 'failure is audited');
  assert.equal(writes.length, 0, 'nothing typed anywhere');
}

async function testChannelPostIsRecordOnly(): Promise<void> {
  const { router, store, writes } = fixture();
  const post = envelope({ 'to': TEAM_CHANNEL });
  const receipt = await router.route(post);
  assert.equal(receipt.mode, 'channel');
  assert.equal(writes.length, 0, 'channel fan-out never PTY-injects (§4)');
  assert.equal(store.readChannel()[0]?.status, 'delivered');
}

async function testChannelInterruptRejected(): Promise<void> {
  const { router, store } = fixture();
  const post = envelope({ 'to': TEAM_CHANNEL, delivery: 'interrupt' });
  await assert.rejects(() => router.route(post), ChannelInterruptError);
  assert.equal(store.history().at(-1)?.status, 'failed');
}

async function testInterruptRateCap(): Promise<void> {
  let clock = 0;
  const { router, store } = fixture(new InterruptRateLimiter(2, () => clock));
  await router.route(envelope({ delivery: 'interrupt' }));
  await router.route(envelope({ delivery: 'interrupt' }));
  await assert.rejects(() => router.route(envelope({ delivery: 'interrupt' })), InterruptRateLimitError);
  assert.equal(store.history().at(-1)?.status, 'failed', 'capped interrupt audited as failed');
  await router.route(envelope({ delivery: 'normal' })); // normals are never capped
  await router.route(envelope({ delivery: 'interrupt', from: 'codex-1', 'to': 'claude-1' })); // cap is per sender
  clock = 61_000;
  await router.route(envelope({ delivery: 'interrupt' })); // window slides
}

async function testDeliveryFailureAudited(): Promise<void> {
  const { router, store, writeOk } = fixture();
  writeOk.value = false;
  const message = envelope();
  await assert.rejects(() => router.route(message), /no live PTY/);
  assert.equal(message.status, 'failed');
  assert.equal(store.history().at(-1)?.status, 'failed');
}

await testDirectMessageDeliversAndSettles();
await testRecipientNotFoundFailsWithRoster();
await testChannelPostIsRecordOnly();
await testChannelInterruptRejected();
await testInterruptRateCap();
await testDeliveryFailureAudited();
console.log('PASS');
