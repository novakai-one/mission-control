import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentBuffer } from '../../../buffer.js';
import type { AgentInfo, CreateAgentOptions } from '../../../manager.js';
import type { TerminalRuntime } from '../../../runtime/index.js';
import { TerminalHostClient } from '../../client/index.js';
import { TerminalHostServer } from '../../server/index.js';

class FakeTerminals implements TerminalRuntime {
  readonly writes: string[] = [];
  private readonly buffer = new AgentBuffer();
  private dataCallback: (agentId: string, data: string) => void = () => {};
  private exitCallback: (agentId: string, code: number | null) => void = () => {};
  private sessionCallback: (info: AgentInfo) => void = () => {};
  private info: AgentInfo = {
    agentId: 'agent-forge',
    title: 'Forge',
    provider: 'codex',
    sessionId: 'session-forge',
    projectDir: 'project',
    cwd: '/tmp/project',
    status: 'running',
    terminalPid: 4242,
    createdAt: new Date().toISOString(),
  };

  async create(_options: CreateAgentOptions): Promise<AgentInfo> {
    return this.info;
  }

  write(agentId: string, data: string): boolean {
    if (agentId !== this.info.agentId) return false;
    this.writes.push(data);
    return true;
  }

  resize(): boolean { return true; }
  rename(): boolean { return true; }
  kill(): boolean { return true; }
  archive(): boolean { return true; }
  snapshot(): string { return this.buffer.snapshot(); }
  list(): AgentInfo[] { return [this.info]; }
  onData(callback: (agentId: string, data: string) => void): void { this.dataCallback = callback; }
  onExit(callback: (agentId: string, code: number | null) => void): void { this.exitCallback = callback; }
  onSession(callback: (info: AgentInfo) => void): void { this.sessionCallback = callback; }

  output(data: string): void {
    this.buffer.push(data);
    this.dataCallback(this.info.agentId, data);
  }
}

async function eventually(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('condition did not become true');
}

// eslint-disable-next-line max-lines-per-function
async function testReconnectPreservesTerminalIdentityAndBuffer(): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), 'terminal-host-'));
  const socketPath = path.join(directory, 'host.sock');
  const terminals = new FakeTerminals();
  const host = new TerminalHostServer(socketPath, terminals);
  await host.listen();
  assert.equal(statSync(socketPath).mode & 0o777, 0o600, 'host socket must be owner-only');

  const first = await TerminalHostClient.connect(socketPath);
  terminals.output('before restart\n');
  await eventually(() => first.snapshot('agent-forge').includes('before restart'));
  first.write('agent-forge', 'first input');
  await eventually(() => terminals.writes.length === 1);
  first.disconnect();
  terminals.output('during restart\n');

  const second = await TerminalHostClient.connect(socketPath);
  const restored = second.list()[0];
  assert.equal(restored.agentId, 'agent-forge');
  assert.equal(restored.terminalPid, 4242);
  assert.equal(second.snapshot(restored.agentId), 'before restart\nduring restart\n');
  second.write(restored.agentId, 'queued input');
  await eventually(() => terminals.writes.length === 2);
  assert.deepEqual(terminals.writes, ['first input', 'queued input'], 'inputs arrive exactly once');

  terminals.output('after restart\n');
  await eventually(() => second.snapshot(restored.agentId).includes('after restart'));
  assert.equal(second.snapshot(restored.agentId), 'before restart\nduring restart\nafter restart\n');
  second.disconnect();
  await host.close();
}

await testReconnectPreservesTerminalIdentityAndBuffer();
console.log('PASS');
