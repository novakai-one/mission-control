import assert from 'node:assert/strict';
import { SessionControl } from './index.js';
import type { AgentInfo, CreateAgentOptions } from '../manager.js';
import type { TerminalRuntime } from '../runtime/index.js';

class FakeTerminals implements TerminalRuntime {
  readonly writes: Array<{ agentId: string; data: string }> = [];

  constructor(readonly agents: AgentInfo[], private readonly writeResult = true) {}

  async create(_options: CreateAgentOptions): Promise<AgentInfo> { return this.agents[0]!; }
  submit(): boolean { return true; }
  activity(): null { return null; }

  write(agentId: string, data: string): boolean {
    this.writes.push({ agentId, data });
    return this.writeResult;
  }
  resize(): boolean { return false; }
  rename(): boolean { return false; }
  kill(): boolean { return false; }
  archive(): boolean { return false; }
  snapshot(): string { return ''; }
  list(): AgentInfo[] { return this.agents; }
  onData(): void {}
  onExit(): void {}
  onSession(): void {}
}

function agent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    agentId: 'agent-1',
    title: 'claude-1',
    provider: 'claude',
    sessionId: 'session-1',
    projectDir: '-tmp-project',
    cwd: '/tmp/project',
    status: 'running',
    createdAt: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

{
  const terminals = new FakeTerminals([agent()]);
  const controls = new SessionControl(terminals);
  assert.equal(controls.execute('agent-1', { kind: 'model', model: 'fable' }).status, 'accepted');
  assert.deepEqual(terminals.writes, [{ agentId: 'agent-1', data: '/model fable\r' }]);
}

{
  const terminals = new FakeTerminals([agent({ provider: 'codex' })]);
  const controls = new SessionControl(terminals);
  const result = controls.execute('agent-1', { kind: 'model', model: 'fable' });
  assert.equal(result.status, 'rejected');
  assert.equal(terminals.writes.length, 0);
}

{
  const terminals = new FakeTerminals([agent({ provider: 'codex' })]);
  const controls = new SessionControl(terminals);
  assert.equal(controls.execute('agent-1', { kind: 'interrupt' }).status, 'accepted');
  assert.deepEqual(terminals.writes.map((write) => write.data), ['\x1b']);
}

{
  const controls = new SessionControl(new FakeTerminals([agent({ status: 'exited' })]));
  assert.equal(controls.execute('agent-1', { kind: 'interrupt' }).status, 'rejected');
  assert.equal(controls.execute('missing', { kind: 'interrupt' }).status, 'rejected');
}

{
  const terminals = new FakeTerminals([agent()]);
  const controls = new SessionControl(terminals);
  const result = controls.execute('agent-1', { kind: 'model', model: 'opus\r/compact' });
  assert.equal(result.status, 'rejected', 'model ids cannot inject a second terminal command');
  assert.equal(terminals.writes.length, 0);
}

console.log('session control tests passed');
