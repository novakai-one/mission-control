import assert from 'node:assert/strict';

// Fake WebSocket, installed on globalThis BEFORE agentSocket is imported so
// the module's lazy `globalThis.WebSocket` lookup resolves to this class.
class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public targetUrl: string) {
    FakeSocket.instances.push(this);
  }

  send(frame: string): void {
    this.sent.push(frame);
  }

  triggerOpen(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  triggerMessage(payload: object): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  triggerClose(): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;

const agentSocket = await import('./index.js');
const { connect, subscribeAgent, sendInput, watchSession, setBackoffForTest } = agentSocket;

function framesOf(instance: FakeSocket, type: string): Record<string, unknown>[] {
  return instance.sent.map(frame => JSON.parse(frame)).filter(frame => frame.type === type);
}

setBackoffForTest(5, 20);

// Queued send before any socket exists must survive and flush on open.
sendInput('agent-x', 'queued-keystroke');
connect();
const socketOne = FakeSocket.instances[0];
socketOne.triggerOpen();
const queuedInput = framesOf(socketOne, 'agent-input');
assert.equal(queuedInput.length, 1);
assert.equal(queuedInput[0].data, 'queued-keystroke');

// subscribeAgent sends agent-subscribe.
const dataOne: string[] = [];
const dataTwo: string[] = [];
subscribeAgent('agent-1', { onReplay: () => {}, onData: chunk => dataOne.push(chunk), onExit: () => {} });
subscribeAgent('agent-2', { onReplay: () => {}, onData: chunk => dataTwo.push(chunk), onExit: () => {} });
const subscribeFrames = framesOf(socketOne, 'agent-subscribe');
assert.deepEqual(subscribeFrames.map(frame => frame.agentId).sort(), ['agent-1', 'agent-2']);

watchSession('proj-dir', 'sess-1');
const watchFrames = framesOf(socketOne, 'watch-session');
assert.equal(watchFrames.length, 1);
assert.deepEqual(watchFrames[0], { type: 'watch-session', projectDir: 'proj-dir', sessionId: 'sess-1' });

// agent-data must route only to the matching agent's handler.
socketOne.triggerMessage({ type: 'agent-data', agentId: 'agent-1', data: 'hello-1' });
assert.deepEqual(dataOne, ['hello-1']);
assert.deepEqual(dataTwo, []);

// Simulated close → reconnect after backoff → new socket → re-subscribe + re-watch.
socketOne.triggerClose();
await new Promise(resolve => setTimeout(resolve, 60));
assert.equal(FakeSocket.instances.length, 2);
const socketTwo = FakeSocket.instances[1];
socketTwo.triggerOpen();
const resentSubscribe = framesOf(socketTwo, 'agent-subscribe');
assert.deepEqual(resentSubscribe.map(frame => frame.agentId).sort(), ['agent-1', 'agent-2']);
const resentWatch = framesOf(socketTwo, 'watch-session');
assert.equal(resentWatch.length, 1);
assert.deepEqual(resentWatch[0], { type: 'watch-session', projectDir: 'proj-dir', sessionId: 'sess-1' });

console.log('PASS');
