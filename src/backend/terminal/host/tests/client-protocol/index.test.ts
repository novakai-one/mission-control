import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TerminalHostClient } from '../../client/index.js';
import { encodeFrame, TERMINAL_HOST_PROTOCOL, type HostFrame } from '../../protocol/index.js';

const info = {
  agentId: 'agent-cursor',
  title: 'Cursor',
  provider: 'codex' as const,
  sessionId: 'session-cursor',
  projectDir: 'project',
  cwd: '/tmp/project',
  status: 'running' as const,
  terminalPid: 5150,
  createdAt: new Date().toISOString(),
};

async function listen(server: Server, socketPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
}

async function eventually(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('condition did not become true');
}

async function close(server: Server, peer: Socket): Promise<void> {
  peer.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

// eslint-disable-next-line max-lines-per-function
async function testCursorSuppressesDuplicatesAndRejectsGaps(): Promise<void> {
  const socketPath = path.join(mkdtempSync(path.join(tmpdir(), 'host-cursor-')), 'host.sock');
  let peer!: Socket;
  const server = createServer((socket) => {
    peer = socket;
    socket.write(encodeFrame({
      type: 'ready',
      protocol: TERMINAL_HOST_PROTOCOL,
      hostPid: 1,
      agents: [{ info, data: 'snapshot\n', cursor: 3 }],
    }));
  });
  await listen(server, socketPath);
  const client = await TerminalHostClient.connect(socketPath);
  const live: string[] = [];
  client.onData((_agentId, data) => live.push(data));

  const frames: HostFrame[] = [
    { type: 'data', agentId: info.agentId, data: 'next\n', cursor: 4 },
    { type: 'data', agentId: info.agentId, data: 'duplicate\n', cursor: 4 },
    { type: 'data', agentId: info.agentId, data: 'last\n', cursor: 5 },
  ];
  for (const frame of frames) peer.write(encodeFrame(frame));
  await eventually(() => live.length === 2);
  assert.deepEqual(live, ['next\n', 'last\n']);
  assert.equal(client.snapshot(info.agentId), 'snapshot\nnext\nlast\n');

  peer.write(encodeFrame({ type: 'data', agentId: info.agentId, data: 'gap\n', cursor: 7 }));
  await eventually(() => !client.write(info.agentId, 'must not send'));
  await close(server, peer);
}

async function testMalformedFrameClosesClient(): Promise<void> {
  const socketPath = path.join(mkdtempSync(path.join(tmpdir(), 'host-malformed-')), 'host.sock');
  let peer!: Socket;
  const server = createServer((socket) => {
    peer = socket;
    socket.write(encodeFrame({
      type: 'ready',
      protocol: TERMINAL_HOST_PROTOCOL,
      hostPid: 1,
      agents: [{ info, data: '', cursor: 0 }],
    }));
  });
  await listen(server, socketPath);
  const client = await TerminalHostClient.connect(socketPath);
  peer.write('{bad json}\n');
  await eventually(() => !client.write(info.agentId, 'must not send'));
  await close(server, peer);
}

await testCursorSuppressesDuplicatesAndRejectsGaps();
await testMalformedFrameClosesClient();
console.log('PASS');
