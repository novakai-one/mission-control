import assert from 'node:assert/strict';
import {
  buildConversations,
  conversationIdsFor,
  dmId,
  formatRoute,
  isRoomId,
  latestChrisQuestion,
  liveRoster,
  mergeFeed,
  mountFeed,
  refetchOnReconnect,
  messagesFor,
  statusMeta,
  upsertEnvelope,
  upsertRoom,
  watchRooms,
  type TunnelEnvelope,
  type TunnelRoom,
} from './index.js';

function envelope(overrides: Partial<TunnelEnvelope>): TunnelEnvelope {
  return {
    id: 'msg_1',
    from: 'claude-1',
    'to': 'codex-1',
    delivery: 'normal',
    body: 'parser is green',
    createdAt: '2026-07-17T09:00:00.000Z',
    status: 'queued',
    ...overrides,
  };
}

// New ids append in arrival order.
const twoMessages = upsertEnvelope([envelope({})], envelope({ id: 'msg_2', body: 'second' }));
assert.deepEqual(twoMessages.map((entry) => entry.id), ['msg_1', 'msg_2']);

// A status amendment (same id) replaces in place — no duplicate rows.
const amended = upsertEnvelope(twoMessages, envelope({ status: 'delivered' }));
assert.equal(amended.length, 2);
assert.equal(amended[0].status, 'delivered');
assert.equal(amended[0].id, 'msg_1');

// The original array is never mutated.
assert.equal(twoMessages[0].status, 'queued');

// History snapshot merges under live frames that landed mid-fetch: the live
// amendment wins over the stale history copy, live-only ids survive.
const merged = mergeFeed(
  [envelope({}), envelope({ id: 'msg_2' })],
  [envelope({ status: 'failed' }), envelope({ id: 'msg_3', 'to': '#team' })],
);
assert.deepEqual(merged.map((entry) => entry.id), ['msg_1', 'msg_2', 'msg_3']);
assert.equal(merged[0].status, 'failed');

// Route labels: DM and channel.
assert.equal(formatRoute(envelope({})), 'claude-1 → codex-1');
assert.equal(formatRoute(envelope({ 'to': '#team' })), 'claude-1 → #team');

// Delivery state in the meta line; only failure grows the roster hint.
assert.equal(statusMeta(envelope({}), ['codex-1']), 'queued');
assert.equal(statusMeta(envelope({ status: 'delivered' }), []), 'delivered');
assert.equal(statusMeta(envelope({ status: 'failed' }), ['claude-1', 'codex-1']), 'failed — live: claude-1, codex-1');
assert.equal(statusMeta(envelope({ status: 'failed' }), []), 'failed — no live agents');

// ------------------------------------------------------------ conversations

function room(overrides: Partial<TunnelRoom>): TunnelRoom {
  return {
    roomId: 'room_a',
    name: 'Parser Push',
    members: ['claude-1', 'codex-1', 'chris'],
    createdBy: 'chris',
    createdAt: '2026-07-17T08:00:00.000Z',
    archived: false,
    ...overrides,
  };
}

// Recipient grammar: rooms are room_<id>, everything else is a name or #team.
assert.equal(isRoomId('room_a'), true);
assert.equal(isRoomId('#team'), false);
assert.equal(isRoomId('codex-1'), false);

// A room post lives in exactly its room; #team in the channel. A DM lands in
// the lane of every non-chris party — sender's lane first — so a chris↔agent
// exchange folds into one lane and an agent↔agent DM shows up in both.
assert.deepEqual(conversationIdsFor(envelope({ 'to': 'room_a' })), ['room_a']);
assert.deepEqual(conversationIdsFor(envelope({ 'to': '#team' })), ['#team']);
assert.deepEqual(conversationIdsFor(envelope({ from: 'chris', 'to': 'claude-1' })), [dmId('claude-1')]);
assert.deepEqual(conversationIdsFor(envelope({ from: 'claude-1', 'to': 'chris' })), [dmId('claude-1')]);
assert.deepEqual(
  conversationIdsFor(envelope({ from: 'claude-1', 'to': 'codex-1' })),
  [dmId('claude-1'), dmId('codex-1')],
);

const feed: TunnelEnvelope[] = [
  envelope({ id: 'm1', from: 'claude-1', 'to': 'codex-1', createdAt: '2026-07-17T09:00:00.000Z' }),
  envelope({ id: 'm2', from: 'chris', 'to': 'claude-1', createdAt: '2026-07-17T09:01:00.000Z' }),
  envelope({ id: 'm3', from: 'codex-1', 'to': 'room_a', createdAt: '2026-07-17T09:02:00.000Z' }),
  envelope({ id: 'm4', from: 'claude-1', 'to': '#team', createdAt: '2026-07-17T09:03:00.000Z' }),
];

// Grouping: the room post under the room, the pair DM under both lanes.
assert.deepEqual(messagesFor(feed, 'room_a').map((entry) => entry.id), ['m3']);
assert.deepEqual(messagesFor(feed, '#team').map((entry) => entry.id), ['m4']);
assert.deepEqual(messagesFor(feed, dmId('claude-1')).map((entry) => entry.id), ['m1', 'm2']);
assert.deepEqual(messagesFor(feed, dmId('codex-1')).map((entry) => entry.id), ['m1']);

// Roster: only running agents, name = title.
const agents = [
  { title: 'claude-1', provider: 'claude' as const, status: 'running' as const },
  { title: 'codex-1', provider: 'codex' as const, status: 'running' as const },
  { title: 'old-1', provider: 'claude' as const, status: 'exited' as const },
];
assert.deepEqual(liveRoster(agents), [
  { name: 'claude-1', provider: 'claude' },
  { name: 'codex-1', provider: 'codex' },
]);

// Conversations: rooms + #team + a DM lane per live agent (even before any
// message), newest activity first, quiet lanes at the end; archived rooms and
// exited agents never appear.
const conversations = buildConversations(
  feed,
  [room({}), room({ roomId: 'room_b', name: 'Old Push', archived: true })],
  liveRoster([...agents, { title: 'quiet-1', provider: 'codex' as const, status: 'running' as const }]),
);
assert.deepEqual(
  conversations.map((entry) => entry.id),
  ['#team', 'room_a', dmId('claude-1'), dmId('codex-1'), dmId('quiet-1')],
);
assert.deepEqual(
  conversations.map((entry) => entry.kind),
  ['channel', 'room', 'dm', 'dm', 'dm'],
);
assert.equal(conversations[1].title, 'Parser Push');
assert.deepEqual(conversations[1].members, ['claude-1', 'codex-1', 'chris']);
assert.equal(conversations[1].lastMessageAt, '2026-07-17T09:02:00.000Z');
assert.equal(conversations[4].lastMessageAt, undefined);

// rooms-changed snapshots replace by roomId — an amended copy wins in place.
const foldedRooms = upsertRoom([room({})], room({ name: 'Parser Push 2' }));
assert.equal(foldedRooms.length, 1);
assert.equal(foldedRooms[0].name, 'Parser Push 2');
assert.equal(upsertRoom([], room({})).length, 1);

// ---------------------------------------------------------- chris question

// The ONE amber candidate: the most recent conversation whose LATEST message
// mentions Chris (never his own words). m5 asks in room_a; m6 asks later in
// the claude lane — only the claude lane holds the candidacy...
const asked = [
  ...feed,
  envelope({ id: 'm5', from: 'codex-1', 'to': 'room_a', body: 'Chris, ship it?', createdAt: '2026-07-17T09:04:00.000Z' }),
  envelope({ id: 'm6', from: 'claude-1', 'to': 'chris', body: 'chris — which port?', createdAt: '2026-07-17T09:05:00.000Z' }),
];
assert.deepEqual(latestChrisQuestion(asked), {
  envelopeId: 'm6',
  conversationId: dmId('claude-1'),
  since: '2026-07-17T09:05:00.000Z',
});

// ...and a later non-question in that lane supersedes it: the room question,
// still the newest word in its own conversation, takes the amber back.
const superseded = [
  ...asked,
  envelope({ id: 'm7', from: 'claude-1', 'to': 'chris', body: 'never mind, found it', createdAt: '2026-07-17T09:06:00.000Z' }),
];
assert.deepEqual(latestChrisQuestion(superseded), {
  envelopeId: 'm5',
  conversationId: 'room_a',
  since: '2026-07-17T09:04:00.000Z',
});

// Chris's own messages never claim his attention; "christen" is not "chris".
assert.equal(latestChrisQuestion([envelope({ from: 'chris', body: 'chris?' })]), null);
assert.equal(latestChrisQuestion([envelope({ body: 'we should christen the build' })]), null);
assert.equal(latestChrisQuestion(feed), null);


// ---- C5 (audit S3): refetch-on-reopen trigger ------------------------------
// The merge seam existed; only the trigger was missing. refetchOnReconnect
// fires the reload on every 'connected' transition — including the first
// open (a mount fetch that raced a dead backend heals when the ws lands) —
// and never on closes or repeated failed retries.
class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public targetUrl: string) { FakeSocket.instances.push(this); }
  send(): void {}
  triggerOpen(): void { this.readyState = 1; this.onopen?.(); }
  triggerClose(): void { this.readyState = 3; this.onclose?.(); }
}
(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;

/** Drop the live socket and let the backoff loop bring up a fresh one. */
async function cycleReconnect(): Promise<void> {
  FakeSocket.instances[FakeSocket.instances.length - 1].triggerClose();
  await new Promise(resolve => setTimeout(resolve, 40));
  FakeSocket.instances[FakeSocket.instances.length - 1].triggerOpen();
}

{
  const { connect, setBackoffForTest } = await import('../agentSocket/index.js');
  setBackoffForTest(5, 20);
  let reloads = 0;
  const offReload = refetchOnReconnect(() => { reloads += 1; });
  connect();
  FakeSocket.instances[0].triggerOpen();
  assert.equal(reloads, 1); // first open heals a mount fetch that raced a dead backend
  FakeSocket.instances[0].triggerClose();
  assert.equal(reloads, 1); // closing is not a reason to reload
  await new Promise(resolve => setTimeout(resolve, 30));
  FakeSocket.instances[1].triggerClose(); // failed retry — still down, no reload
  assert.equal(reloads, 1);
  await new Promise(resolve => setTimeout(resolve, 60));
  FakeSocket.instances[2].triggerOpen();
  assert.equal(reloads, 2); // the reconnect — exactly one reload
  offReload();
  FakeSocket.instances[2].triggerClose();
  await new Promise(resolve => setTimeout(resolve, 30));
  FakeSocket.instances[3].triggerOpen();
  assert.equal(reloads, 2); // unsubscribed
}


// ---- C5 (evidence correction): the reconnect trigger exercises the REAL
// feed and rooms wiring — mountFeed re-pulls the '#team' history and
// watchRooms re-issues GET /api/rooms on reopen, not just a callback.
{
  const roomsFetches: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (requestUrl: unknown) => {
    roomsFetches.push(String(requestUrl));
    return new Response(JSON.stringify({ messages: [], rooms: [] }), { status: 200 });
  }) as typeof fetch;
  try {
    // FEED: mountFeed pulls '#team' at mount and again on every reopen.
    const lanePulls: string[] = [];
    const unmount = mountFeed(() => {}, { current: true }, (laneId) => lanePulls.push(laneId));
    assert.deepEqual(lanePulls, ['#team']);
    await cycleReconnect();
    assert.deepEqual(lanePulls, ['#team', '#team'], 'reopen re-pulls the #team history through loadConversation');
    unmount();

    // ROOMS: watchRooms re-issues its real GET /api/rooms fetch on reopen.
    const unwatch = watchRooms(() => {}, () => true);
    const before = roomsFetches.filter((entry) => entry.includes('/api/rooms')).length;
    assert.equal(before, 1, 'one mount fetch');
    await cycleReconnect();
    await new Promise(resolve => setTimeout(resolve, 10));
    const after = roomsFetches.filter((entry) => entry.includes('/api/rooms')).length;
    assert.equal(after, before + 1, 'reopen re-issues GET /api/rooms');
    unwatch();
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log('tunnelModel: all assertions passed');
