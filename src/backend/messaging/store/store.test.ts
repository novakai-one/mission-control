// Message store unit tests (agent-messaging phase 1). Run with
// `npx tsx src/backend/messaging/store/store.test.ts`.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageStore } from './index.js';
import { TEAM_CHANNEL } from '../types.js';
import type { MessageEnvelope } from '../types.js';

let counter = 0;
function envelope(overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  counter += 1;
  return {
    id: `msg_${counter}`,
    from: 'claude-1',
    'to': 'codex-1',
    delivery: 'normal',
    body: `body ${counter}`,
    createdAt: `2026-07-17T00:00:${String(counter).padStart(2, '0')}.000Z`,
    status: 'queued',
    ...overrides,
  };
}

function freshStore(): { store: MessageStore; storePath: string } {
  const storePath = join(mkdtempSync(join(tmpdir(), 'nvk-msg-')), 'messages.jsonl');
  return { store: new MessageStore(storePath), storePath };
}

function testAppendAndHistory(): void {
  const { store } = freshStore();
  const first = envelope();
  const second = envelope({ from: 'codex-1', 'to': 'claude-1' });
  store.append(first);
  store.append(second);
  const everything = store.history();
  assert.equal(everything.length, 2);
  assert.deepEqual(everything[0], first, 'append order preserved and payload intact');
}

function testStatusAmendmentIsAppendOnly(): void {
  const { store, storePath } = freshStore();
  const sent = envelope();
  store.append(sent);
  const updated = store.updateStatus(sent.id, 'delivered');
  assert.equal(updated?.status, 'delivered');
  const rawLines = readFileSync(storePath, 'utf8').trim().split('\n');
  assert.equal(rawLines.length, 2, 'status change appends an amended line, never rewrites');
  const folded = store.history();
  assert.equal(folded.length, 1, 'readers fold amendments by id');
  assert.equal(folded[0]?.status, 'delivered');
  assert.equal(store.updateStatus('msg_unknown', 'failed'), null, 'unknown id returns null');
}

function testHistoryFilters(): void {
  const { store } = freshStore();
  const direct = envelope({ from: 'claude-1', 'to': 'codex-1', threadId: 'thread-a' });
  const reply = envelope({ from: 'codex-1', 'to': 'claude-1', threadId: 'thread-a' });
  const other = envelope({ from: 'claude-2', 'to': 'codex-2' });
  for (const message of [direct, reply, other]) store.append(message);

  const withCodex = store.history({ withAgent: 'codex-1' });
  assert.deepEqual(withCodex.map((message) => message.id), [direct.id, reply.id], 'withAgent matches from OR to');
  assert.deepEqual(store.history({ threadId: 'thread-a' }).map((message) => message.id), [direct.id, reply.id]);
  const since = store.history({ since: reply.createdAt });
  assert.deepEqual(since.map((message) => message.id), [reply.id, other.id], 'since is inclusive by createdAt');
  assert.deepEqual(store.history({ limit: 1 }).map((message) => message.id), [other.id], 'limit keeps the newest');
}

function testChannelReadIsPullOnly(): void {
  const { store } = freshStore();
  const post = envelope({ 'to': TEAM_CHANNEL });
  store.append(envelope());
  store.append(post);
  const channel = store.readChannel();
  assert.deepEqual(channel.map((message) => message.id), [post.id], 'channel read returns only #team posts');
  assert.deepEqual(store.readChannel({ since: '2099-01-01T00:00:00Z' }), []);
}

function testCorruptLinesNeverBlockTheRecord(): void {
  const { store, storePath } = freshStore();
  const good = envelope();
  writeFileSync(storePath, '{ torn line\n' + JSON.stringify(good) + '\n\n');
  assert.deepEqual(store.history().map((message) => message.id), [good.id], 'corrupt line skipped, rest readable');
}

function testAppendListenerFiresForSendsAndAmendments(): void {
  const { store } = freshStore();
  const seen: string[] = [];
  store.onAppend((message) => seen.push(`${message.id}:${message.status}`));
  const sent = envelope();
  store.append(sent);
  store.updateStatus(sent.id, 'failed');
  assert.deepEqual(seen, [`${sent.id}:queued`, `${sent.id}:failed`]);
}

testAppendAndHistory();
testStatusAmendmentIsAppendOnly();
testHistoryFilters();
testChannelReadIsPullOnly();
testCorruptLinesNeverBlockTheRecord();
testAppendListenerFiresForSendsAndAmendments();
console.log('PASS');
