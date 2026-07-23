import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TerminalHostClient } from '../../client/index.js';
import { TerminalHostServer } from '../../server/index.js';
import { encodeFrame, TERMINAL_HOST_PROTOCOL, type HostFrame } from '../../protocol/index.js';
import type { TerminalRuntime } from '../../../runtime/index.js';

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

// --- activity truth across the seam (mission_agent-stall-detection) ----------

// eslint-disable-next-line max-lines-per-function
async function testActivityAcrossTheSeam(): Promise<void> {
  const socketPath = path.join(mkdtempSync(path.join(tmpdir(), 'host-activity-')), 'host.sock');
  const nowMs = Date.now();
  const hostStamp = { lastOutputAtMs: nowMs - 600_000, trackedSinceMs: nowMs - 3_600_000 };
  const legacyInfo = { ...info, agentId: 'agent-legacy' };
  let peer!: Socket;
  const server = createServer((socket) => {
    peer = socket;
    socket.write(encodeFrame({
      type: 'ready',
      protocol: TERMINAL_HOST_PROTOCOL,
      hostPid: 1,
      agents: [
        { info, data: '', cursor: 0, activity: hostStamp },
        { info: legacyInfo, data: '', cursor: 0 },
      ],
    }));
  });
  await listen(server, socketPath);
  const connectTime = Date.now();
  const client = await TerminalHostClient.connect(socketPath);

  // T-HOST-ACT-1: the ready snapshot seeds the HOST's stamp, not the client clock
  const seeded = client.activity(info.agentId);
  assert.equal(seeded?.lastOutputAtMs, hostStamp.lastOutputAtMs, 'client reads the host stamp');
  assert.equal(seeded?.trackedSinceMs, hostStamp.trackedSinceMs, 'trackedSince carried from host');

  // T-HOST-ACT-3: snapshot WITHOUT activity (old host) → conservative fallback
  const fallback = client.activity(legacyInfo.agentId);
  assert.equal(fallback?.lastOutputAtMs, null, 'no host stamp → unknown output time');
  assert.ok((fallback?.trackedSinceMs ?? 0) >= connectTime, 'trackedSince = connect time (resets, never lies old)');

  // T-HOST-ACT-2: a live data frame moves the stamp forward on the client clock
  const beforeFrame = Date.now();
  peer.write(encodeFrame({ type: 'data', agentId: info.agentId, data: 'x', cursor: 1 }));
  await eventually(() => (client.activity(info.agentId)?.lastOutputAtMs ?? 0) >= beforeFrame);

  assert.equal(client.activity('agent-unknown'), null, 'unknown agent has no activity');
  await close(server, peer);
}

// T-HOST-ACT-4: a real host server includes the runtime's stamp in ready
// snapshots, and the real client seeds from it end to end.
// eslint-disable-next-line max-lines-per-function
async function testHostServerReportsActivityInSnapshots(): Promise<void> {
  const stamp = { lastOutputAtMs: 123_456, trackedSinceMs: 100_000 };
  const runtime: TerminalRuntime = {
    create: () => Promise.reject(new Error('unused')),
    write: () => true,
    submit: () => true,
    resize: () => true,
    rename: () => true,
    kill: () => true,
    archive: () => true,
    snapshot: () => 'snap',
    activity: () => ({ ...stamp }),
    list: () => [info],
    onData: () => {},
    onExit: () => {},
    onSession: () => {},
  };
  const socketPath = path.join(mkdtempSync(path.join(tmpdir(), 'host-act-srv-')), 'host.sock');
  const host = new TerminalHostServer(socketPath, runtime);
  await host.listen();
  const client = await TerminalHostClient.connect(socketPath);
  assert.deepEqual(client.activity(info.agentId), stamp, 'host stamp survives the full seam');
  client.disconnect();
  await host.close();
}

await testCursorSuppressesDuplicatesAndRejectsGaps();
await testMalformedFrameClosesClient();
await testActivityAcrossTheSeam();
await testHostServerReportsActivityInSnapshots();
console.log('PASS');
