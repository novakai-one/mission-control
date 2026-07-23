// TerminalManager registry regression tests. Run with
// `npx tsx src/backend/terminal/tests/manager.test.ts`.
// NEVER call manager.create() here — it would spawn the real claude CLI.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalManager } from '../manager.js';
import type { ProviderLauncher, ProviderTerminalProcess } from '../provider/index.js';

const NOW = new Date().toISOString();

function makeFixtureRegistry(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mc-agents-'));
  const registryPath = join(directory, 'agents.json');
  const entries = [
    { agentId: 'agent_running', title: 'r', sessionId: 's1', projectDir: 'p1', cwd: '/tmp/p1', status: 'running', createdAt: NOW },
    { agentId: 'agent_exited', title: 'e', sessionId: 's2', projectDir: 'p2', cwd: '/tmp/p2', status: 'exited', createdAt: NOW },
    { agentId: 'agent_archived', title: 'a', sessionId: 's3', projectDir: 'p3', cwd: '/tmp/p3', status: 'exited', createdAt: NOW, archived: true }
  ];
  writeFileSync(registryPath, JSON.stringify(entries));
  return registryPath;
}

function testLoadsExitedAndHidesArchived(): void {
  const manager = new TerminalManager(makeFixtureRegistry());
  const listed = manager.list();
  assert.equal(listed.length, 2, 'archived entry must be hidden from list()');
  for (const info of listed) assert.equal(info.status, 'exited', 'restored entries report exited');
  assert.ok(!listed.some((info) => info.agentId === 'agent_archived'), 'archived agent absent');
}

function testRenamePersists(): void {
  const registryPath = makeFixtureRegistry();
  const manager = new TerminalManager(registryPath);
  assert.equal(manager.rename('agent_exited', 'renamed'), true);
  const saved = JSON.parse(readFileSync(registryPath, 'utf8')) as Array<{ agentId: string; title: string }>;
  const entry = saved.find((item) => item.agentId === 'agent_exited');
  assert.equal(entry?.title, 'renamed', 'rename must persist to the registry file');
  assert.equal(manager.rename('agent_unknown', 'x'), false, 'unknown id returns false');
}

function testArchivePersistsAndHides(): void {
  const registryPath = makeFixtureRegistry();
  const manager = new TerminalManager(registryPath);
  const before = manager.list().length;
  assert.equal(manager.archive('agent_exited'), true);
  assert.equal(manager.list().length, before - 1, 'archiving hides the agent from list()');
  const saved = JSON.parse(readFileSync(registryPath, 'utf8')) as Array<{ agentId: string; archived?: boolean }>;
  const entry = saved.find((item) => item.agentId === 'agent_exited');
  assert.equal(entry?.archived, true, 'archive must persist archived:true');
  assert.equal(manager.archive('agent_unknown'), false, 'unknown id returns false');
}

function testKillRestoredAgent(): void {
  const manager = new TerminalManager(makeFixtureRegistry());
  assert.equal(manager.kill('agent_running'), true, 'kill on a pty-less restored agent is a no-op success');
  assert.equal(manager.kill('agent_unknown'), false, 'unknown id returns false');
}

function testWriteResizeSnapshotOnRestoredAgent(): void {
  const manager = new TerminalManager(makeFixtureRegistry());
  assert.equal(manager.write('agent_running', 'hi'), false, 'write on a pty-less agent returns false');
  assert.equal(manager.resize('agent_running', 80, 24), false, 'resize on a pty-less agent returns false');
  assert.equal(manager.snapshot('agent_running'), '', 'snapshot on a buffer-less agent is empty');
}

function testCorruptRegistryDoesNotThrow(): void {
  const dir = mkdtempSync(join(tmpdir(), 'mc-agents-'));
  const registryPath = join(dir, 'agents.json');
  writeFileSync(registryPath, '{ not valid json');
  const manager = new TerminalManager(registryPath);
  assert.equal(manager.list().length, 0, 'corrupt registry starts empty rather than throwing');
}

function fakeProcess(): ProviderTerminalProcess {
  return {
    onData: () => ({ dispose() {} }),
    onExit: () => ({ dispose() {} }),
    write() {},
    resize() {},
    kill() {},
  };
}

async function testProviderLaunchPersistsResolvedSession(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'mc-agents-'));
  const registryPath = join(directory, 'agents.json');
  let finishDiscovery: (sessionId: string) => void = () => {};
  const sessionId = new Promise<string>((resolve) => { finishDiscovery = resolve; });
  const launcher: ProviderLauncher = (provider) => ({
    process: fakeProcess(),
    sessionId: provider === 'codex' ? sessionId : Promise.resolve('preset-claude'),
  });
  const manager = new TerminalManager(registryPath, launcher);
  const resolved = new Promise<void>((resolve) => manager.onSession(() => resolve()));
  const created = await manager.create({
    provider: 'codex', cwd: '/tmp/project', projectId: 'project-1', threadId: 'thread-1',
  });
  assert.equal(created.provider, 'codex');
  assert.equal(created.sessionId, '', 'Codex PTY returns before first-prompt discovery');
  finishDiscovery('discovered-codex');
  await resolved;
  assert.equal(created.sessionId, 'discovered-codex');
  assert.equal(created.threadId, 'thread-1');
  const saved = JSON.parse(readFileSync(registryPath, 'utf8')) as Array<{ sessionId: string }>;
  assert.equal(saved[0]?.sessionId, 'discovered-codex');
}

async function testRejectsConcurrentCodexDiscovery(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'mc-agents-'));
  let finishDiscovery: (sessionId: string) => void = () => {};
  const sessionId = new Promise<string>((resolve) => { finishDiscovery = resolve; });
  const manager = new TerminalManager(join(directory, 'agents.json'), () => ({
    process: fakeProcess(), sessionId,
  }));
  const first = await manager.create({ provider: 'codex', cwd: '/tmp/project' });
  await assert.rejects(
    () => manager.create({ provider: 'codex', cwd: '/tmp/project' }),
    /already starting/,
  );
  finishDiscovery('discovered-codex');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(first.sessionId, 'discovered-codex');
}

async function testLauncherFailureClearsPendingCodex(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'mc-agents-'));
  const manager = new TerminalManager(join(directory, 'agents.json'), () => {
    throw new Error('codex CLI not found');
  });
  await assert.rejects(() => manager.create({ provider: 'codex', cwd: '/tmp/project' }), /CLI not found/);
  await assert.rejects(
    () => manager.create({ provider: 'codex', cwd: '/tmp/project' }),
    /CLI not found/,
    'retry must surface the launch failure, not "already starting"',
  );
}

function earlyExitFixture(): { launcher: ProviderLauncher; exit: (code: number) => void } {
  let exitHandler: (event: { exitCode: number }) => void = () => {};
  let rejectDiscovery: (error: Error) => void = () => {};
  const sessionId = new Promise<string>((ignored, reject) => { rejectDiscovery = reject; });
  const launcher: ProviderLauncher = () => ({
    process: { ...fakeProcess(), onExit: (handler) => { exitHandler = handler; return { dispose() {} }; } },
    sessionId,
    cancelSessionWait: (reason?: string) => rejectDiscovery(new Error(reason ?? 'cancelled')),
  });
  return { launcher, exit: (code) => exitHandler({ exitCode: code }) };
}

async function testEarlyExitCancelsCodexDiscovery(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'mc-agents-'));
  const fixture = earlyExitFixture();
  const manager = new TerminalManager(join(directory, 'agents.json'), fixture.launcher);
  const errored = new Promise<{ sessionError?: string }>((resolve) => manager.onSession((info) => resolve(info)));
  await manager.create({ provider: 'codex', cwd: '/tmp/project' });
  fixture.exit(1);
  const timeout = new Promise<never>((ignored, reject) => setTimeout(() => reject(new Error('sessionError never reported after early exit')), 500));
  const info = await Promise.race([errored, timeout]);
  assert.match(info.sessionError ?? '', /exited/, 'early exit must surface a session error naming the exit');
  const retried = await manager.create({ provider: 'codex', cwd: '/tmp/project' });
  assert.equal(retried.provider, 'codex', 'early exit must release the pending-codex guard so retries launch');
}

async function testActivityStamping(): Promise<void> {
  let emitData: ((data: string) => void) | null = null;
  const launcher: ProviderLauncher = () => ({
    process: {
      ...fakeProcess(),
      onData: (callback: (data: string) => void) => { emitData = callback; return { dispose() {} }; },
    },
    sessionId: new Promise<string>(() => {}),
    cancelSessionWait: () => {},
  });
  const registryPath = join(mkdtempSync(join(tmpdir(), 'mc-activity-')), 'agents.json');
  const manager = new TerminalManager(registryPath, launcher);
  const before = Date.now();
  const info = await manager.create({ cwd: '/tmp/fake' });
  const initial = manager.activity(info.agentId);
  assert.ok(initial, 'activity exists from creation');
  assert.equal(initial.lastOutputAtMs, null, 'no output observed yet');
  assert.ok(initial.trackedSinceMs >= before, 'trackedSince set at create');
  emitData!('spinner frame');
  const stamped = manager.activity(info.agentId);
  assert.ok(stamped?.lastOutputAtMs !== null && (stamped?.lastOutputAtMs ?? 0) >= before, 'onData stamps lastOutputAtMs');
  assert.equal(manager.activity('agent_unknown'), null, 'unknown id returns null');
  const restored = new TerminalManager(makeFixtureRegistry());
  const restoredActivity = restored.activity('agent_running');
  assert.ok(restoredActivity, 'restored agents track activity too');
  assert.equal(restoredActivity.lastOutputAtMs, null, 'restored agents have no observed output');
}

async function main(): Promise<void> {
  testLoadsExitedAndHidesArchived();
  testRenamePersists();
  testArchivePersistsAndHides();
  testKillRestoredAgent();
  testWriteResizeSnapshotOnRestoredAgent();
  testCorruptRegistryDoesNotThrow();
  await testProviderLaunchPersistsResolvedSession();
  await testRejectsConcurrentCodexDiscovery();
  await testLauncherFailureClearsPendingCodex();
  await testEarlyExitCancelsCodexDiscovery();
  await testActivityStamping();
  console.log('PASS');
}

await main();
