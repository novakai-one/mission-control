// MessagingHub REST + broadcast + spawn-briefing tests over a real express
// app (agent-messaging phases 1–5). Run with
// `npx tsx src/backend/messaging/tests/api.test.ts`.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { MessagingHub, TEAM_CHANNEL } from '../index.js';
import type { MessageEnvelope } from '../index.js';
import type { AgentInfo } from '../../terminal/manager.js';

function agent(overrides: Partial<AgentInfo>): AgentInfo {
  return {
    agentId: 'agent_x', title: 'claude-1', provider: 'claude', sessionId: 'session',
    projectDir: 'project', cwd: '/tmp/project', status: 'running', createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const agents: AgentInfo[] = [
  agent({ agentId: 'agent_1', title: 'claude-1' }),
  agent({ agentId: 'agent_2', title: 'codex-1', provider: 'codex' }),
];
const writes: Array<{ agentId: string; data: string }> = [];
const broadcasts: Array<{ event: string; payload: MessageEnvelope }> = [];
const recordWrite = (agentId: string, data: string): boolean => {
  writes.push({ agentId, data });
  return true;
};

const messagingHub = new MessagingHub(
  { list: () => agents, write: recordWrite },
  (event, payload) => broadcasts.push({ event, payload: payload as MessageEnvelope }),
  {
    storePath: join(mkdtempSync(join(tmpdir(), 'nvk-api-')), 'messages.jsonl'),
    timings: { interruptSettleMs: 0, submitDelayMs: 0 },
    spawnBriefingDelayMs: 5,
    serverPort: 3031,
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
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

async function postAsUser(body: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${baseUrl}/api/user/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

async function getMessages(query: string): Promise<MessageEnvelope[]> {
  const response = await fetch(`${baseUrl}/api/messages${query}`);
  return (await response.json()).messages;
}

async function testSendDeliversAndBroadcasts(): Promise<void> {
  const { status, json } = await post({ from: 'claude-1', 'to': 'codex-1', body: 'ship it' });
  assert.equal(status, 201);
  assert.equal(json.envelope.status, 'delivered');
  assert.match(json.envelope.id, /^msg_/);
  assert.equal(writes[0]?.agentId, 'agent_2');
  assert.equal(writes[0]?.data, `[nvk-msg from claude-1 id ${json.envelope.id}] ship it`);
  assert.equal(writes[1]?.data, '\r');
  assert.deepEqual(
    broadcasts.map((entry) => `${entry.event}:${entry.payload.status}`),
    ['message-envelope:queued', 'message-envelope:delivered'],
    'every appended envelope reaches the ws broadcast',
  );
}

async function testHistoryQueryFilters(): Promise<void> {
  await post({ from: 'codex-1', 'to': 'claude-1', body: 'done', threadId: 'thread-a' });
  await post({ from: 'claude-1', 'to': TEAM_CHANNEL, body: 'status: green' });
  assert.equal((await getMessages('')).length, 3);
  const channel = await getMessages(`?withAgent=${encodeURIComponent(TEAM_CHANNEL)}`);
  assert.equal(channel.length, 1, 'channel read via withAgent=#team');
  assert.equal(channel[0]?.body, 'status: green');
  assert.equal((await getMessages('?threadId=thread-a'))[0]?.threadId, 'thread-a');
  assert.equal((await getMessages('?limit=1')).length, 1);
}

async function testInvalidSendsRejectedBeforeRecording(): Promise<void> {
  assert.equal((await post({ from: 'claude-1', 'to': 'codex-1' })).status, 400, 'missing body');
  assert.equal((await post({ from: '', 'to': 'codex-1', body: 'x' })).status, 400, 'missing from');
  assert.equal((await post({ from: 'claude-1', 'to': 'codex-1', body: 'x', delivery: 'shout' })).status, 400);
  const channelInterrupt = await post({ from: 'claude-1', 'to': TEAM_CHANNEL, body: 'x', delivery: 'interrupt' });
  assert.equal(channelInterrupt.status, 400, 'interrupt to #team rejected');
  assert.equal((await getMessages('')).length, 3, 'rejected sends never enter the audit record');
}

async function testFailureStatusCodes(): Promise<void> {
  const missing = await post({ from: 'claude-1', 'to': 'codex-9', body: 'x' });
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json.roster.map((entry: { name: string }) => entry.name), ['claude-1', 'codex-1'],
    'not-found failure returns the live roster');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await post({ from: 'claude-1', 'to': 'codex-1', body: 'urgent', delivery: 'interrupt' });
  }
  const capped = await post({ from: 'claude-1', 'to': 'codex-1', body: 'urgent', delivery: 'interrupt' });
  assert.equal(capped.status, 429, 'fourth interrupt in a minute is capped');
}

async function testSpawnBriefingTypedIntoNewAgentPty(): Promise<void> {
  writes.length = 0;
  messagingHub.handleAgentSpawned(agents[0]!);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(writes.length, 2, 'briefing line + submit');
  assert.equal(writes[0]?.agentId, 'agent_1');
  assert.match(writes[0]?.data ?? '', /^\[nvk-msg briefing\] You are agent "claude-1"/);
  assert.match(writes[0]?.data ?? '', /codex-1 \(codex\)/, 'roster excludes self, lists peers');
  assert.equal(writes[1]?.data, '\r');
}

async function testDeadAgentIsNeverBriefed(): Promise<void> {
  writes.length = 0;
  messagingHub.handleAgentSpawned(agent({ agentId: 'agent_gone', title: 'claude-9' }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(writes.length, 0, 'no briefing typed for an agent missing from the roster');
}

async function testRegisteredUserIdentityOwnsBrowserSends(): Promise<void> {
  const identityResponse = await fetch(`${baseUrl}/api/identity`);
  assert.equal(identityResponse.status, 200);
  assert.deepEqual(await identityResponse.json(), {
    identity: {
      id: 'user:chris',
      displayName: 'Chris',
      memberName: 'chris',
      role: 'owner',
      permissions: ['messages:send', 'rooms:send'],
    },
  });

  const direct = await postAsUser({
    from: 'spoofed-agent',
    'to': 'codex-1',
    body: 'browser-authored',
  });
  assert.equal(direct.status, 201);
  assert.equal(direct.json.envelope.from, 'chris', 'server identity overrides client sender claims');

  const roomResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Agents only', members: ['claude-1', 'codex-1'], from: 'claude-1' }),
  });
  const roomId = (await roomResponse.json()).room.roomId as string;
  const roomSend = await postAsUser({ 'to': roomId, body: 'owner can address every mission room' });
  assert.equal(roomSend.status, 201, 'owner identity has permission to send to any mission room');
  assert.equal(roomSend.json.envelope.from, 'chris');
}

async function testOwnerTeamPostReachesEveryLiveAgent(): Promise<void> {
  writes.length = 0;
  const teamPost = await postAsUser({ 'to': TEAM_CHANNEL, body: 'Hello team, this is live chat.' });
  assert.equal(teamPost.status, 201);
  assert.deepEqual(
    writes.filter((entry) => entry.data !== '\r').map((entry) => entry.agentId),
    ['agent_1', 'agent_2'],
    'Chris team chat is pushed to every live agent instead of waiting for terminal polling',
  );
  for (const write of writes.filter((entry) => entry.data !== '\r')) {
    assert.match(write.data, /^\[nvk-msg from chris id msg_[^\]]+\] Hello team, this is live chat\.$/);
  }
}

async function testAgentsCanReplyToUserInbox(): Promise<void> {
  const reply = await post({ from: 'codex-1', 'to': 'chris', body: 'Reply visible in Mission Control.' });
  assert.equal(reply.status, 201, 'Chris is a registered recipient even though he has no PTY');
  assert.equal(reply.json.envelope.status, 'delivered');
}

try {
  await testSendDeliversAndBroadcasts();
  await testHistoryQueryFilters();
  await testInvalidSendsRejectedBeforeRecording();
  await testFailureStatusCodes();
  await testSpawnBriefingTypedIntoNewAgentPty();
  await testDeadAgentIsNeverBriefed();
  await testRegisteredUserIdentityOwnsBrowserSends();
  await testOwnerTeamPostReachesEveryLiveAgent();
  await testAgentsCanReplyToUserInbox();
  console.log('PASS');
} finally {
  server.close();
}
