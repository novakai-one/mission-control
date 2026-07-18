// MessageStore in-memory index + external-append probe tests (messaging
// rework task 1). Run with
// `npx tsx src/backend/messaging/tests/store/index.test.ts`.
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageStore } from '../../store/index.js';
import type { MessageEnvelope } from '../../types.js';

function envelope(id: string, overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    id,
    from: 'claude-1',
    'to': 'codex-1',
    delivery: 'normal',
    body: `body of ${id}`,
    createdAt: new Date().toISOString(),
    status: 'queued',
    ...overrides,
  };
}

function testAppendIsVisibleFromMemory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'nvk-store-'));
  const store = new MessageStore(join(directory, 'messages.jsonl'));
  store.append(envelope('msg_one'));
  store.append(envelope('msg_two'));
  const ids = store.history().map((message) => message.id);
  assert.deepEqual(ids, ['msg_one', 'msg_two'], 'appends stay visible in first-seen order');
  return join(directory, 'messages.jsonl');
}

function testExternalAppendBecomesVisible(storePath: string): void {
  const store = new MessageStore(storePath);
  assert.equal(store.history().length, 2, 'baseline from the previous writer');
  appendFileSync(storePath, JSON.stringify(envelope('msg_external')) + '\n');
  const ids = store.history().map((message) => message.id);
  assert.deepEqual(ids, ['msg_one', 'msg_two', 'msg_external'],
    'a size/mtime probe re-folds when an outside writer appends (nvk-msg fallback)');
}

function testUpdateStatusLastWins(): void {
  const directory = mkdtempSync(join(tmpdir(), 'nvk-store-'));
  const store = new MessageStore(join(directory, 'messages.jsonl'));
  store.append(envelope('msg_fold'));
  const updated = store.updateStatus('msg_fold', 'delivered');
  assert.equal(updated?.status, 'delivered');
  const history = store.history();
  assert.equal(history.length, 1, 'amendment folds onto the same id');
  assert.equal(history[0]?.status, 'delivered', 'later line wins');
  assert.equal(store.updateStatus('msg_unknown', 'failed'), null, 'unknown id amends nothing');
}

function testHistoryFiltersSurviveTheIndex(): void {
  const directory = mkdtempSync(join(tmpdir(), 'nvk-store-'));
  const store = new MessageStore(join(directory, 'messages.jsonl'));
  store.append(envelope('msg_a', { threadId: 'thread-1' }));
  store.append(envelope('msg_b', { 'to': '#team' }));
  assert.equal(store.history({ threadId: 'thread-1' }).length, 1);
  assert.equal(store.readChannel().length, 1, 'channel reads still filter on #team');
  assert.equal(store.history({ limit: 1 }).length, 1);
}

testAppendIsVisibleFromMemory();
const storePath = testAppendIsVisibleFromMemory();
testExternalAppendBecomesVisible(storePath);
testUpdateStatusLastWins();
testHistoryFiltersSurviveTheIndex();
console.log('PASS');
