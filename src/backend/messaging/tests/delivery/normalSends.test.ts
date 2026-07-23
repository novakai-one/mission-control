// Normal-send honesty (mission_transcript-proof-normal-sends): a normal
// direct send settles 'accepted' when bytes are written and earns 'delivered'
// only on transcript proof — the same D1 honesty PR #46 gave interrupts.
// Mailbox recipients (no PTY, no transcript) honestly stay 'queued' (ruling
// R1) and reconcile never re-routes them (R2 — the duplicate-append bug).
// Channel and room fan-out semantics are unchanged (R3).
// Every assertion reads the PERSISTED trail from the JSONL store file —
// confirmation is fire-and-record, so in-memory reads race the amendment.
// Run with `npx tsx src/backend/messaging/tests/delivery/normalSends.test.ts`.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageStore } from '../../store/index.js';
import { RoomStore } from '../../rooms/index.js';
import { PtyDelivery } from '../../delivery/index.js';
import { MessageRouter, InterruptRateLimiter } from '../../router/index.js';
import type { EffectConfirmer } from '../../confirm/index.js';
import type { AgentAddress, MessageEnvelope } from '../../types.js';

const roster: AgentAddress[] = [
  { agentId: 'agent_n1', name: 'worker-1', provider: 'claude' },
  { agentId: 'agent_n2', name: 'worker-2', provider: 'kimi' },
];

interface Harness {
  router: MessageRouter;
  store: MessageStore;
  storePath: string;
  rooms: RoomStore;
  writes: Array<{ agentId: string; data: string }>;
  submits: Array<{ agentId: string; messageId: string; text: string }>;
  submittedIds: Set<string>;
}

function envelope(overrides: Partial<MessageEnvelope>): MessageEnvelope {
  return {
    'id': `msg_${Math.random().toString(36).slice(2, 10)}`, from: 'worker-2', 'to': 'worker-1',
    delivery: 'normal', body: 'ping', createdAt: new Date().toISOString(), status: 'queued',
    ...overrides,
  };
}

function makeHarness(confirmer: EffectConfirmer | undefined, { confirmTimeoutMs = 200 } = {}): Harness {
  const storePath = join(mkdtempSync(join(tmpdir(), 'nvk-ns-')), 'messages.jsonl');
  const store = new MessageStore(storePath);
  const rooms = new RoomStore(join(mkdtempSync(join(tmpdir(), 'nvk-ns-rooms-')), 'rooms.jsonl'));
  const writes: Harness['writes'] = [];
  const submits: Harness['submits'] = [];
  const submittedIds = new Set<string>();
  const delivery = new PtyDelivery({
    write: (agentId: string, data: string) => { writes.push({ agentId, data }); return true; },
    submit: (submission: { agentId: string; messageId: string; text: string }) => {
      if (submittedIds.has(submission.messageId)) return true;
      submittedIds.add(submission.messageId);
      submits.push(submission);
      return true;
    },
  }, { interruptSettleMs: 0, submitDelayMs: 0 });
  const router = new MessageRouter(
    store, delivery, rooms,
    () => roster, new InterruptRateLimiter(100), undefined, undefined,
    confirmer,
    (agentId) => ({ sessionId: `sess-${agentId}`, projectDir: 'proj', provider: agentId === 'agent_n2' ? 'kimi' : 'claude' }),
    confirmTimeoutMs,
  );
  return { router, store, storePath, rooms, writes, submits, submittedIds };
}

function trailFor(storePath: string, id: string): MessageEnvelope[] {
  return readFileSync(storePath, 'utf8').trim().split('\n')
    .map((line) => JSON.parse(line) as MessageEnvelope)
    .filter((entry) => entry.id === id);
}

function settle(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const provingConfirmer: EffectConfirmer = {
  confirm: (_target, marker) => Promise.resolve(
    marker.startsWith('[nvk-msg from') ? { confirmedAt: '2026-07-23T05:00:00Z', transcriptEvent: 'time:1753246800' } : null,
  ),
};

// --- normal DM: accepted on write, delivered ONLY on transcript proof --------

{
  const harness = makeHarness(provingConfirmer);
  const message = envelope({ delivery: 'normal' });
  const receipt = await harness.router.route(message);
  assert.equal(receipt.mode, 'normal-accepted', 'the send path returns on acceptance, never blocking on proof');

  await settle(20);
  const trail = trailFor(harness.storePath, message.id);
  assert.deepEqual(trail.map((entry) => entry.status), ['queued', 'accepted', 'delivered'],
    'queued → accepted (bytes) → delivered (proof)');
  const final = trail.at(-1)?.outcome as Record<string, unknown>;
  assert.equal(typeof final?.acceptedAt, 'string', 'acceptedAt survives the merge');
  assert.equal(final?.confirmedAt, '2026-07-23T05:00:00Z');
  assert.equal(final?.transcriptEvent, 'time:1753246800', 'the transcript event is the persisted evidence');
  assert.equal(final?.sessionId, 'sess-agent_n1');
  assert.equal(final?.agentId, 'agent_n1');
  console.log('normal accepted→delivered test passed');
}

// --- normal DM with no proof: stays accepted with an honest note -------------

{
  const harness = makeHarness({ confirm: () => Promise.resolve(null) });
  const message = envelope({ delivery: 'normal' });
  await harness.router.route(message);
  await settle(20);
  const final = trailFor(harness.storePath, message.id).at(-1);
  assert.equal(final?.status, 'accepted', 'no proof → never claimed delivered');
  assert.match(String(final?.outcome?.note), /effect unverified within/);
  console.log('normal unverified-note test passed');
}

console.log('normal-send honesty tests passed');
