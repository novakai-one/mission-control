import assert from 'node:assert/strict';
import { formatRoute, mergeFeed, statusMeta, upsertEnvelope, type TunnelEnvelope } from './index.js';

function envelope(overrides: Partial<TunnelEnvelope>): TunnelEnvelope {
  return {
    id: 'msg_1',
    from: 'claude-1',
    'to': 'codex-1',
    delivery: 'normal',
    body: 'parser is green',
    createdAt: '2026-07-17T09:00:00.000Z',
    status: 'queued',
    ...overrides,
  };
}

// New ids append in arrival order.
const twoMessages = upsertEnvelope([envelope({})], envelope({ id: 'msg_2', body: 'second' }));
assert.deepEqual(twoMessages.map((entry) => entry.id), ['msg_1', 'msg_2']);

// A status amendment (same id) replaces in place — no duplicate rows.
const amended = upsertEnvelope(twoMessages, envelope({ status: 'delivered' }));
assert.equal(amended.length, 2);
assert.equal(amended[0].status, 'delivered');
assert.equal(amended[0].id, 'msg_1');

// The original array is never mutated.
assert.equal(twoMessages[0].status, 'queued');

// History snapshot merges under live frames that landed mid-fetch: the live
// amendment wins over the stale history copy, live-only ids survive.
const merged = mergeFeed(
  [envelope({}), envelope({ id: 'msg_2' })],
  [envelope({ status: 'failed' }), envelope({ id: 'msg_3', 'to': '#team' })],
);
assert.deepEqual(merged.map((entry) => entry.id), ['msg_1', 'msg_2', 'msg_3']);
assert.equal(merged[0].status, 'failed');

// Route labels: DM and channel.
assert.equal(formatRoute(envelope({})), 'claude-1 → codex-1');
assert.equal(formatRoute(envelope({ 'to': '#team' })), 'claude-1 → #team');

// Delivery state in the meta line; only failure grows the roster hint.
assert.equal(statusMeta(envelope({}), ['codex-1']), 'queued');
assert.equal(statusMeta(envelope({ status: 'delivered' }), []), 'delivered');
assert.equal(statusMeta(envelope({ status: 'failed' }), ['claude-1', 'codex-1']), 'failed — live: claude-1, codex-1');
assert.equal(statusMeta(envelope({ status: 'failed' }), []), 'failed — no live agents');

console.log('tunnelModel: all assertions passed');
