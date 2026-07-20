// Mailbox registry unit tests. Run with
// `npx tsx src/backend/messaging/mailbox/mailbox.test.ts`.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MailboxConflictError, MailboxRegistry } from './index.js';

const root = mkdtempSync(join(tmpdir(), 'nvk-mailboxes-'));
const storePath = join(root, 'mailboxes.jsonl');

// 1. Fresh registry seeds chris + kimi and persists them.
const registry = new MailboxRegistry(storePath);
assert.deepEqual(registry.list().map((entry) => entry.memberName), ['chris', 'kimi']);
assert.equal(registry.identityFor('kimi')?.role, 'orchestrator');
assert.ok(readFileSync(storePath, 'utf8').includes('"memberName":"kimi"'), 'seeds written to disk');

// 2. Register a durable mailbox; reload from disk; it survives.
const created = registry.register({ displayName: 'Manager K3', memberName: 'manager-k3' });
assert.equal(created.id, 'orchestrator:manager-k3');
assert.equal(created.role, 'orchestrator');
assert.deepEqual(created.permissions, ['messages:send']);
const reloaded = new MailboxRegistry(storePath);
assert.equal(reloaded.identityFor('manager-k3')?.displayName, 'Manager K3');
assert.equal(reloaded.list().length, 3, 'seeds + registered, no double-seed on reload');

// 3. Conflicts and invalid input are loud.
assert.throws(() => reloaded.register({ displayName: 'Dup', memberName: 'manager-k3' }), MailboxConflictError);
assert.throws(() => reloaded.register({ displayName: '', memberName: 'x' }), /non-empty/);
assert.throws(() => reloaded.register({ displayName: 'Ch', memberName: '#team' }), /channel\/room/);

// 4. Load-time semantics: torn lines skipped; first duplicate wins; missing seed healed.
const messyPath = join(root, 'messy.jsonl');
writeFileSync(messyPath, [
  '{"id":"orchestrator:kimi","displayName":"Evil Twin","memberName":"kimi","role":"orchestrator","permissions":["messages:send"]}',
  '{"id":"orchestrator:m1","displayName":"M1","memberName":"m1","role":"orchestrator","permissions":["messages:send"]}',
  '{"id":"orchestrator:m1","displayName":"M1 Twin","memberName":"m1","role":"orchestrator","permissions":["messages:send"]}',
  '{"broken":',
  '',
].join('\n'));
const messy = new MailboxRegistry(messyPath);
assert.equal(messy.identityFor('kimi')?.displayName, 'Evil Twin', 'file beats code seed — file is source of truth');
assert.equal(messy.identityFor('m1')?.displayName, 'M1', 'first duplicate wins');
assert.equal(messy.identityFor('chris')?.role, 'owner', 'missing seed healed');
assert.ok(readFileSync(messyPath, 'utf8').includes('"memberName":"chris"'), 'healed seed appended');

// 5. In-memory registry never touches disk.
const memory = MailboxRegistry.inMemory();
memory.register({ displayName: 'Scratch', memberName: 'scratch' });
assert.equal(memory.identityFor('scratch')?.displayName, 'Scratch');

console.log('PASS');
