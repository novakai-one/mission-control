// Durable mailbox identity integration tests. Exercises the real HTTP and
// CLI interfaces while keeping mailbox identity distinct from live Presence.
// Run with `npx tsx src/backend/messaging/tests/mailbox/index.test.ts`.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
import { MessagingHub } from '../../index.js';
import type { AgentInfo } from '../../../terminal/manager.js';

const execFileAsync = promisify(execFile);
const agents: AgentInfo[] = [
  {
    agentId: 'agent_1',
    title: 'codex-1',
    provider: 'codex',
    sessionId: 'session_1',
    projectDir: 'project',
    cwd: '/tmp/project',
    status: 'running',
    createdAt: new Date().toISOString(),
  },
];
const writes: Array<{ agentId: string; data: string }> = [];
const root = mkdtempSync(join(tmpdir(), 'nvk-mailbox-'));
const messagingHub = new MessagingHub(
  {
    list: () => agents,
    write: (agentId, data) => {
      writes.push({ agentId, data });
      return true;
    },
  },
  () => {},
  {
    storePath: join(root, 'messages.jsonl'),
    roomsStorePath: join(root, 'rooms.jsonl'),
    timings: { interruptSettleMs: 0, submitDelayMs: 0 },
  },
);
const application = express();
application.use(express.json());
messagingHub.registerRoutes(application);
const server: Server = await new Promise((resolve) => {
  const listening = application.listen(0, '127.0.0.1', () => resolve(listening));
});
const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

async function post(body: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

async function history(name: string): Promise<any[]> {
  const response = await fetch(`${baseUrl}/api/messages?withAgent=${encodeURIComponent(name)}`);
  return (await response.json()).messages;
}

async function testWorkerCanDeliverToKimiMailbox(): Promise<void> {
  writes.length = 0;
  const reply = await post({ from: 'codex-1', 'to': 'kimi', body: 'done' });
  assert.equal(reply.status, 201);
  assert.equal(reply.json.envelope.status, 'delivered');
  assert.equal(writes.length, 0, 'mailbox delivery writes no PTY bytes');
  assert.equal((await history('kimi')).at(-1)?.body, 'done');
}

async function testKimiCanDeliverToLiveWorker(): Promise<void> {
  writes.length = 0;
  const mission = await post({ from: 'kimi', 'to': 'codex-1', body: 'next mission' });
  assert.equal(mission.status, 201);
  assert.equal(writes[0]?.agentId, 'agent_1');
  assert.match(writes[0]?.data ?? '', /^\[nvk-msg from kimi id msg_[^\]]+\] next mission$/);
}

async function testAddressBookSeparatesMailboxAndPresence(): Promise<void> {
  const response = await fetch(`${baseUrl}/api/messaging/address-book`);
  assert.equal(response.status, 200);
  const book = await response.json() as {
    mailboxes: Array<{ memberName: string }>;
    presences: Array<{ name: string }>;
  };
  assert.deepEqual(book.mailboxes.map((entry) => entry.memberName), ['chris', 'kimi']);
  assert.deepEqual(book.presences.map((entry) => entry.name), ['codex-1']);
  assert.ok(!book.presences.some((entry) => entry.name === 'kimi'));
}

async function testCliDeliveryAndDiscovery(): Promise<void> {
  const options = { cwd: process.cwd(), env: { ...process.env, NVK_COMMAND_URL: baseUrl } };
  const send = await execFileAsync(process.execPath, [
    'scripts/nvk-msg.mjs', 'send', '--from', 'codex-1', '--to', 'kimi', 'cli done',
  ], options);
  assert.equal(send.stderr, '');
  assert.match(send.stdout, /→ kimi \(delivered\)/);
  assert.equal((await history('kimi')).at(-1)?.body, 'cli done');

  const names = await execFileAsync(process.execPath, ['scripts/nvk-msg.mjs', 'names'], options);
  assert.match(names.stdout, /^chris \(mailbox:owner\)$/m);
  assert.match(names.stdout, /^kimi \(mailbox:orchestrator\)$/m);
  assert.match(names.stdout, /^codex-1 \(codex\)$/m);
}

try {
  await testWorkerCanDeliverToKimiMailbox();
  await testKimiCanDeliverToLiveWorker();
  await testAddressBookSeparatesMailboxAndPresence();
  await testCliDeliveryAndDiscovery();
  console.log('PASS');
} finally {
  server.close();
}
