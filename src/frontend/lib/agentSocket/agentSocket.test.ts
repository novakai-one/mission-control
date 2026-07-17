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
const { connect, subscribeAgent, sendInput, watchSession, unwatchSession, setBackoffForTest, onRoomsChanged } = agentSocket;

function framesOf(instance: FakeSocket, type: string): Record<string, unknown>[] {
  return instance.sent.map(frame => JSON.parse(frame)).filter(frame => frame.type === type);
}

setBackoffForTest(5, 20);

// Queued send before any socket exists must survive and flush on open.
// agent-subscribe / watch-session called pre-open must NOT also be queued —
// they rely solely on resubscribeAll() at open time, otherwise open would
// fire them twice (once flushed, once from resubscribeAll).
sendInput('agent-x', 'queued-keystroke');
const dataOne: string[] = [];
subscribeAgent('agent-1', { onReplay: () => {}, onData: chunk => dataOne.push(chunk), onExit: () => {} });
watchSession('proj-dir', 'sess-1');
connect();
const socketOne = FakeSocket.instances[0];
socketOne.triggerOpen();

const queuedInput = framesOf(socketOne, 'agent-input');
assert.equal(queuedInput.length, 1);
assert.equal(queuedInput[0].data, 'queued-keystroke');

const subscribeAfterOpen = framesOf(socketOne, 'agent-subscribe');
assert.deepEqual(subscribeAfterOpen.map(frame => frame.agentId), ['agent-1']); // exactly one, no double-send

const watchAfterOpen = framesOf(socketOne, 'watch-session');
assert.equal(watchAfterOpen.length, 1); // exactly one, no double-send
assert.deepEqual(watchAfterOpen[0], { type: 'watch-session', projectDir: 'proj-dir', sessionId: 'sess-1' });

// subscribeAgent called while the socket is already open sends immediately.
const dataTwo: string[] = [];
subscribeAgent('agent-2', { onReplay: () => {}, onData: chunk => dataTwo.push(chunk), onExit: () => {} });
const subscribeFrames = framesOf(socketOne, 'agent-subscribe');
assert.deepEqual(subscribeFrames.map(frame => frame.agentId).sort(), ['agent-1', 'agent-2']);

// agent-data must route only to the matching agent's handler.
socketOne.triggerMessage({ type: 'agent-data', agentId: 'agent-1', data: 'hello-1' });
assert.deepEqual(dataOne, ['hello-1']);
assert.deepEqual(dataTwo, []);

// rooms-changed rides the event-keyed broadcast dialect ({event, payload});
// listeners receive the payload's rooms array, and unsubscribe stops delivery.
const roomFrames: unknown[] = [];
const unsubscribeRooms = onRoomsChanged(rooms => roomFrames.push(rooms));
socketOne.triggerMessage({ event: 'rooms-changed', payload: { rooms: [{ roomId: 'room_a' }] } });
assert.deepEqual(roomFrames, [[{ roomId: 'room_a' }]]);
unsubscribeRooms();
socketOne.triggerMessage({ event: 'rooms-changed', payload: { rooms: [] } });
assert.equal(roomFrames.length, 1);

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

// unwatchSession sends the frame when open and drops the target from tracking —
// a later reconnect must not resend watch-session for it.
unwatchSession('proj-dir', 'sess-1');
const unwatchFrames = framesOf(socketTwo, 'unwatch-session');
assert.equal(unwatchFrames.length, 1);
assert.deepEqual(unwatchFrames[0], { type: 'unwatch-session', projectDir: 'proj-dir', sessionId: 'sess-1' });

socketTwo.triggerClose();
sendInput('agent-x', 'during-backend-restart');
connect();
connect(); // scheduled reconnect and eager callers must still create one socket
await new Promise(resolve => setTimeout(resolve, 60));
assert.equal(FakeSocket.instances.length, 3);
const socketThree = FakeSocket.instances[2];
socketThree.triggerOpen();
assert.deepEqual(
  framesOf(socketThree, 'agent-input').map(frame => frame.data),
  ['during-backend-restart'],
);
const resentWatchAfterUnwatch = framesOf(socketThree, 'watch-session');
assert.equal(resentWatchAfterUnwatch.length, 0); // unwatched target must not resurrect on reconnect

console.log('PASS');
