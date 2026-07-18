import assert from 'node:assert/strict';

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(_url: string) {
    FakeSocket.instances.push(this);
  }

  send(frame: string): void { this.sent.push(frame); }
  open(): void { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  receive(frame: object): void { this.onmessage?.({ data: JSON.stringify(frame) }); }
}

(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;

const { connect } = await import('../agentSocket/index.js');
const { runSessionControl } = await import('./index.js');

{
  const result = await runSessionControl('agent-1', { kind: 'interrupt' });
  assert.deepEqual(result, {
    status: 'rejected',
    agentId: 'agent-1',
    intent: { kind: 'interrupt' },
    reason: 'session connection is not ready',
  });
}

connect();
const socket = FakeSocket.instances[0]!;
socket.open();

{
  const resultPromise = runSessionControl('agent-1', { kind: 'model', model: 'fable' });
  const sent = JSON.parse(socket.sent.at(-1)!) as Record<string, unknown>;
  assert.equal(sent.type, 'agent-control');
  assert.equal(sent.agentId, 'agent-1');
  assert.deepEqual(sent.intent, { kind: 'model', model: 'fable' });
  assert.equal(typeof sent.commandId, 'string');

  socket.receive({
    type: 'agent-control-result',
    commandId: sent.commandId,
    status: 'accepted',
    agentId: 'agent-1',
    intent: sent.intent,
  });
  assert.equal((await resultPromise).status, 'accepted');
}

{
  const result = await runSessionControl('agent-1', { kind: 'interrupt' }, 5);
  assert.equal(result.status, 'rejected');
  assert.equal(result.status === 'rejected' && result.reason, 'session control timed out');
}

console.log('session control client tests passed');
