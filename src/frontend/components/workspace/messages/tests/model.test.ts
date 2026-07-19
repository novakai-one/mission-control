import assert from 'node:assert/strict';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import type { Conversation, TunnelEnvelope } from '../../../../lib/tunnelModel/index.js';
import {
  DEFAULT_RAIL_WIDTHS,
  DENSITY_SCALE,
  MESSAGING_SETTINGS,
  clampRailWidth,
  composerTargetsFor,
  dayLabelFor,
  displayNameFor,
  dmLaneFor,
  filterRailLanes,
  groupByDay,
  initialFor,
  isCollapsible,
  isOwnFreshSend,
  knownAgentsFor,
  laneStatsFor,
  mentionQueryAt,
  mentionSuggestions,
  parseRailWidths,
  presenceToneFor,
  recapNotesFor,
  replyLabelFor,
  resolveSelectedLane,
  reviewLanesFor,
  roleFor,
  roomIdentityFor,
  roomLabelFor,
  rowDeliveryFor,
  snippetFor,
  splitRailSections,
  userScrollActive,
  workingAgentFor,
  WORKING_WINDOW_MS,
} from '../model.js';
import { FOLD_STYLE, NEW_ACTION_STYLE, PICKER_STYLE, SHELL_STYLE, resolveStyle } from '../styles/index.js';

function envelope(overrides: Partial<TunnelEnvelope>): TunnelEnvelope {
  return {
    id: 'msg_1',
    from: 'claude-1',
    'to': 'chris',
    delivery: 'normal',
    body: 'hello',
    createdAt: '2026-07-19T09:00:00.000Z',
    status: 'delivered',
    ...overrides,
  };
}

function agent(overrides: Partial<AgentInfo>): AgentInfo {
  return {
    agentId: 'a1',
    title: 'claude-1',
    provider: 'claude',
    sessionId: 's1',
    projectDir: '/tmp',
    cwd: '/tmp',
    status: 'running',
    createdAt: '2026-07-19T08:00:00.000Z',
    ...overrides,
  } as AgentInfo;
}

function lane(id: string, kind: Conversation['kind'], title: string): Conversation {
  return { id, kind, title };
}

// Density-as-data: the three locked scale factors.
assert.equal(DENSITY_SCALE.low, 1.0);
assert.equal(DENSITY_SCALE.normal, 1.3);
assert.equal(DENSITY_SCALE.high, 1.7);

// Presence heuristic: unread beats running beats gray.
assert.equal(presenceToneFor(2, 'running'), 'amber');
assert.equal(presenceToneFor(0, 'running'), 'green');
assert.equal(presenceToneFor(0, 'exited'), 'gray');
assert.equal(presenceToneFor(0, null), 'gray');

// Rail sections: #team pinned first, rooms next, dms separate (TEAMS hidden).
const sections = splitRailSections([
  lane('room_b', 'room', 'beta'),
  lane('dm:claude-1', 'dm', 'claude-1'),
  lane('#team', 'channel', '#team'),
  lane('room_a', 'room', 'alpha'),
]);
assert.deepEqual(sections.rooms.map((entry) => entry.id), ['#team', 'room_b', 'room_a']);
assert.deepEqual(sections.directs.map((entry) => entry.id), ['dm:claude-1']);
assert.equal(roomLabelFor(lane('#team', 'channel', '#team')), 'team');

// Identity labels.
assert.equal(displayNameFor('chris'), 'Chris');
assert.equal(displayNameFor('claude-1'), 'claude-1');
assert.equal(initialFor('chris'), 'C');
assert.equal(initialFor('maya'), 'M');
assert.equal(roleFor('chris', []), 'Product owner');
assert.equal(roleFor('claude-1', [agent({})]), 'claude');
assert.equal(roleFor('ghost', [agent({})]), 'agent');

// Working heuristic: newest envelope TO a running agent, fresh → working.
const nowMs = Date.parse('2026-07-19T09:05:00.000Z');
const toAgent = [envelope({ from: 'chris', 'to': 'claude-1', createdAt: '2026-07-19T09:01:00.000Z' })];
assert.equal(workingAgentFor(toAgent, [agent({})], nowMs), 'claude-1');
// …cleared the moment the agent answers (newest envelope is FROM them).
const agentAnswered = [...toAgent, envelope({ id: 'msg_2', from: 'claude-1', 'to': 'chris' })];
assert.equal(workingAgentFor(agentAnswered, [agent({})], nowMs), null);
// …never fires for exited agents, stale envelopes, rooms, or #team.
assert.equal(workingAgentFor(toAgent, [agent({ status: 'exited' })], nowMs), null);
const stale = [envelope({ from: 'chris', 'to': 'claude-1', createdAt: '2026-07-19T08:00:00.000Z' })];
assert.equal(workingAgentFor(stale, [agent({})], nowMs), null);
assert.ok(WORKING_WINDOW_MS < nowMs - Date.parse('2026-07-19T08:00:00.000Z'));
const toRoom = [envelope({ from: 'chris', 'to': 'room_abc' })];
assert.equal(workingAgentFor(toRoom, [agent({})], nowMs), null);
const toTeam = [envelope({ from: 'chris', 'to': '#team' })];
assert.equal(workingAgentFor(toTeam, [agent({})], nowMs), null);

// Day grouping: TODAY label, per-day splits, stable order.
const nowDate = new Date('2026-07-19T12:00:00');
const mixed = [
  envelope({ createdAt: '2026-07-18T23:00:00' }),
  envelope({ id: 'msg_2', createdAt: '2026-07-19T08:00:00' }),
  envelope({ id: 'msg_3', createdAt: '2026-07-19T09:00:00' }),
];
const groups = groupByDay(mixed, nowDate);
assert.equal(groups.length, 2);
assert.equal(groups[1].label, 'TODAY');
assert.equal(groups[1].messages.length, 2);
assert.equal(dayLabelFor('2026-07-18T23:00:00', nowDate), 'JUL 18');

// Reply context only when the parent envelope is actually known.
const parent = envelope({ id: 'msg_parent', from: 'claude-1' });
const reply = envelope({ id: 'msg_reply', threadId: 'msg_parent' });
assert.equal(replyLabelFor(reply, [parent, reply]), 'Replying to claude-1');
assert.equal(replyLabelFor(reply, [reply]), null);
assert.equal(replyLabelFor(envelope({}), [parent]), null);

// Stats: real derived counts per lane.
const laneMessages = [
  envelope({ from: 'chris', 'to': 'claude-1', status: 'delivered' }),
  envelope({ id: 'msg_2', from: 'claude-1', 'to': 'chris', status: 'delivered' }),
  envelope({ id: 'msg_3', from: 'chris', 'to': 'claude-1', status: 'failed' }),
];
assert.deepEqual(laneStatsFor(laneMessages), { sent: 2, received: 1, delivered: 2, failed: 1 });

// Recap notes: unread, members, last word — all derived.
const room = lane('room_a', 'room', 'alpha');
room.members = ['chris', 'claude-1'];
const notes = recapNotesFor(room, laneMessages, 2);
assert.equal(notes[0], '2 unread here.');
assert.equal(notes[1], '2 members in this room.');
assert.ok(notes[2].startsWith('Last word '));
assert.equal(recapNotesFor(room, [], 0)[2], 'Nothing said yet.');

// Room identity header (M4): kind + honest member count. The #team channel
// carries no member list, so it shows its kind alone — no invented number.
assert.equal(roomIdentityFor(lane('#team', 'channel', '#team')), 'Channel');
assert.equal(roomIdentityFor(room), 'Mission room · 2 members');
assert.equal(
  roomIdentityFor({ id: 'room_solo', kind: 'room', title: 'solo', members: ['chris'] }),
  'Mission room · 1 member',
);

// Review resilience (M4): the target's lanes are derived from the envelope;
// a stale notice (envelope gone from the feed) resolves to null honestly.
const reviewFeed = [
  envelope({ id: 'msg_room_fail', 'to': 'room_a' }),
  envelope({ id: 'msg_dm_fail', 'to': 'claude-1' }),
];
assert.deepEqual(reviewLanesFor(reviewFeed, 'msg_room_fail'), ['room_a']);
assert.deepEqual(reviewLanesFor(reviewFeed, 'msg_dm_fail'), ['dm:claude-1']);
assert.equal(reviewLanesFor(reviewFeed, 'msg_gone'), null);

// Collapsible messages: threshold is typed data; snippets flatten whitespace.
const longBody = 'word '.repeat(120).trim(); // 600 chars > 280
assert.equal(isCollapsible(longBody), true);
assert.equal(isCollapsible('short note'), false);
const snippet = snippetFor(longBody);
assert.ok(snippet.endsWith('…'));
assert.ok(snippet.length <= 282); // 280 + ellipsis, trimmed
assert.equal(snippetFor('line one\n\nline   two'), 'line one line   two'.replace('   ', ' '));
assert.equal(isCollapsible('x'.repeat(280)), false);
assert.equal(isCollapsible('x'.repeat(281)), true);

// Rail widths: clamps, parse fallbacks, round-trip honesty.
assert.equal(clampRailWidth('rail', 100), 180);
assert.equal(clampRailWidth('rail', 999), 360);
assert.equal(clampRailWidth('rail', 240.4), 240);
assert.equal(clampRailWidth('context', 50), 220);
assert.equal(clampRailWidth('context', 999), 440);
assert.equal(clampRailWidth('rail', Number.NaN), DEFAULT_RAIL_WIDTHS.rail);
assert.deepEqual(parseRailWidths(null), DEFAULT_RAIL_WIDTHS);
assert.deepEqual(parseRailWidths('not json'), DEFAULT_RAIL_WIDTHS);
assert.deepEqual(parseRailWidths('{"rail":250}'), { rail: 250, context: 280 });
assert.deepEqual(parseRailWidths('{"rail":1,"context":9999}'), { rail: 180, context: 440 });

// @ mention picker: query detection + suggestion ranking.
assert.deepEqual(mentionQueryAt('hello @may', 10), { start: 6, query: 'may' });
assert.deepEqual(mentionQueryAt('@', 1), { start: 0, query: '' });
assert.equal(mentionQueryAt('email a@b.com', 9), null);        // @ mid-word
assert.equal(mentionQueryAt('done @maya now', 13), null);      // caret past a space
assert.equal(mentionQueryAt('no sign', 7), null);
// A fresh second @ opens a new empty query (picker shows all members).
assert.deepEqual(mentionQueryAt('two @ma @', 9), { start: 8, query: '' });
assert.deepEqual(mentionQueryAt('two @ma @x', 10), { start: 8, query: 'x' });
assert.deepEqual(mentionQueryAt(' @@op', 5), { start: 2, query: 'op' }); // abandoned @ restarts
const mentionTargets = [
  { objectId: 'agent:maya', label: 'maya', kind: 'agent' as const },
  { objectId: 'agent:atlas', label: 'atlas', kind: 'agent' as const },
  { objectId: 'agent:maverick', label: 'maverick', kind: 'agent' as const },
  { objectId: 'thread:t1', label: 'maya-thread', kind: 'thread' as const },
];
assert.deepEqual(
  mentionSuggestions(mentionTargets, 'ma', 6).map((target) => target.label),
  ['maya', 'maverick'], // prefix first, threads excluded
);
assert.deepEqual(
  mentionSuggestions(mentionTargets, 'la', 6).map((target) => target.label),
  ['atlas'], // substring match
);
assert.equal(mentionSuggestions(mentionTargets, '', 2).length, 2); // limit caps the open picker
// Duplicate roster names (real-data collision) collapse to one option.
const colliding = [
  { objectId: 'agent:Worlds Greatest Team · claude', label: 'Worlds Greatest Team · claude', kind: 'agent' as const },
  { objectId: 'agent:Worlds Greatest Team · claude', label: 'Worlds Greatest Team · claude', kind: 'agent' as const },
];
assert.equal(mentionSuggestions(colliding, '', 6).length, 1);

// Delivery grammar: queued is transient; stale queued settles honestly.
const windowMs = MESSAGING_SETTINGS.delivery.sendingWindowMs;
const freshQueued = envelope({ status: 'queued', from: 'chris', createdAt: '2026-07-19T09:04:55.000Z' });
assert.equal(rowDeliveryFor(freshQueued, nowMs), 'sending');
const staleOwn = envelope({ status: 'queued', from: 'chris', createdAt: '2026-07-19T08:00:00.000Z' });
assert.ok(nowMs - Date.parse(staleOwn.createdAt) > windowMs);
assert.equal(rowDeliveryFor(staleOwn, nowMs), 'undelivered');
const staleOther = envelope({ status: 'queued', from: 'claude-1', createdAt: '2026-07-19T08:00:00.000Z' });
assert.equal(rowDeliveryFor(staleOther, nowMs), 'quiet');
assert.equal(rowDeliveryFor(envelope({ status: 'failed' }), nowMs), 'failed');
assert.equal(rowDeliveryFor(envelope({ status: 'delivered' }), nowMs), 'quiet');
// The boundary: exactly at the window edge is no longer "Sending…".
const edge = envelope({ status: 'queued', from: 'chris', createdAt: new Date(nowMs - windowMs).toISOString() });
assert.equal(rowDeliveryFor(edge, nowMs), 'undelivered');

// Style blocks (doctrine §B): frozen typed attachments, ONE resolver seam.
assert.ok(Object.isFrozen(SHELL_STYLE.base));
assert.ok(Object.isFrozen(SHELL_STYLE.contextClosed));
assert.ok(Object.isFrozen(FOLD_STYLE.fold));
assert.ok(Object.isFrozen(FOLD_STYLE.open));
assert.ok(Object.isFrozen(NEW_ACTION_STYLE.base));
assert.ok(Object.isFrozen(PICKER_STYLE.agentPicked));
assert.equal(resolveStyle(NEW_ACTION_STYLE.base, NEW_ACTION_STYLE.active), 'msg-new-action is-active');
assert.equal(resolveStyle(PICKER_STYLE.agent, PICKER_STYLE.agentPicked), 'msg-picker-agent is-picked');
assert.equal(SHELL_STYLE.base.className, 'msg-view');
assert.equal(SHELL_STYLE.contextClosed.className, 'msg-context-closed');
assert.ok(Object.isFrozen(SHELL_STYLE.railCollapsed));
assert.equal(SHELL_STYLE.railCollapsed.className, 'msg-rail-collapsed');
// resolveStyle combines only the attached blocks, in order, no duplicates logic.
assert.equal(resolveStyle(SHELL_STYLE.base), 'msg-view');
assert.equal(
  resolveStyle(SHELL_STYLE.base, SHELL_STYLE.contextClosed, false, SHELL_STYLE.railOverlayOpen),
  'msg-view msg-context-closed msg-rail-open',
);
assert.equal(resolveStyle(FOLD_STYLE.fold, FOLD_STYLE.open), 'msg-row-fold is-open');
assert.equal(resolveStyle(FOLD_STYLE.fold, false, null, undefined), 'msg-row-fold');
assert.equal(resolveStyle(), '');

// Known agents (M5): the pickers' union of registered agents (any status)
// and feed-history names — live first, then alphabetical.
assert.deepEqual(knownAgentsFor([], []), []);
const known = knownAgentsFor(
  [
    agent({ title: 'zeta', status: 'exited' }),
    agent({ title: 'maya', status: 'running', provider: 'claude' }),
  ],
  [
    envelope({ from: 'atlas', 'to': 'chris' }),
    envelope({ from: 'chris', 'to': 'room_1' }),
    envelope({ from: 'chris', 'to': '#team' }),
  ],
);
assert.deepEqual(
  known,
  [
    { name: 'maya', provider: 'claude', live: true },      // live sorts first
    { name: 'atlas', provider: null, live: false },        // feed-only: name is all history knows
    { name: 'zeta', provider: 'claude', live: false },     // exited stays known, provider kept
  ],
);
// A live record beats an exited duplicate of the same title.
assert.deepEqual(
  knownAgentsFor(
    [agent({ title: 'maya', status: 'exited' }), agent({ title: 'maya', status: 'running' })],
    [],
  ),
  [{ name: 'maya', provider: 'claude', live: true }],
);
// chris, rooms, and channels are never agent candidates.
assert.deepEqual(
  knownAgentsFor([], [envelope({ from: 'chris', 'to': 'room_x' }), envelope({ from: 'chris', 'to': '#team' })]),
  [],
);
// An agent record already known is not re-derived from the feed.
assert.deepEqual(
  knownAgentsFor([agent({ title: 'maya' })], [envelope({ from: 'maya', 'to': 'chris' })]),
  [{ name: 'maya', provider: 'claude', live: true }],
);

// DM lane overlay (M5): a not-yet-derived lane resolves through the overlay.
const openedDm = dmLaneFor('nova');
assert.deepEqual(openedDm, { id: 'dm:nova', kind: 'dm', title: 'nova' });
assert.equal(resolveSelectedLane([lane('#team', 'channel', '#team')], openedDm, 'dm:nova'), openedDm);
const derivedDm = lane('dm:maya', 'dm', 'maya');
assert.equal(resolveSelectedLane([derivedDm], openedDm, 'dm:maya'), derivedDm); // the derived lane wins
assert.equal(resolveSelectedLane([derivedDm], openedDm, 'dm:other'), null); // stale overlay never leaks
assert.equal(resolveSelectedLane([], null, null), null);

// Send-and-know (M7): only Chris's own FRESH send pulls a scrolled-up feed.
const sendWindow = MESSAGING_SETTINGS.sendFollow.ownSendWindowMs;
const ownFresh = envelope({ from: 'chris', 'to': 'claude-1', createdAt: '2026-07-19T09:04:58.000Z' });
assert.ok(nowMs - Date.parse(ownFresh.createdAt) < sendWindow);
assert.equal(isOwnFreshSend(ownFresh, nowMs), true);
assert.equal(isOwnFreshSend(envelope({ from: 'claude-1' }), nowMs), false); // incoming never yanks
assert.equal(isOwnFreshSend(envelope({ from: 'chris', createdAt: '2026-07-19T08:00:00.000Z' }), nowMs), false);
assert.equal(isOwnFreshSend(undefined, nowMs), false);
// Active-scroll guard: a gesture inside the window means "hands on the feed".
const guardMs = MESSAGING_SETTINGS.sendFollow.scrollGuardMs;
assert.equal(userScrollActive(null, nowMs), false);
assert.equal(userScrollActive(nowMs - guardMs + 1, nowMs), true);
assert.equal(userScrollActive(nowMs - guardMs, nowMs), false); // boundary: no longer active

// Rail search (M8c): case-insensitive substring over titles; empty query passes through.
const searchable = [lane('#team', 'channel', '#team'), lane('room_a', 'room', 'alpha'), lane('dm:maya', 'dm', 'maya')];
assert.equal(filterRailLanes(searchable, ''), searchable);
assert.equal(filterRailLanes(searchable, '   '), searchable);
assert.deepEqual(filterRailLanes(searchable, 'MAY').map((entry) => entry.id), ['dm:maya']);
assert.deepEqual(filterRailLanes(searchable, 'a').map((entry) => entry.id), ['#team', 'room_a', 'dm:maya']);
assert.deepEqual(filterRailLanes(searchable, 'zzz'), []);

// Composer mention universe (M8a): known agents (live or not) become agent
// targets — the picker opens on a bare @ even with an empty live roster.
assert.deepEqual(composerTargetsFor([]), []);
assert.deepEqual(
  composerTargetsFor([
    { name: 'maya', provider: 'claude', live: true },
    { name: 'atlas', provider: null, live: false },
  ]),
  [
    { objectId: 'agent:maya', label: 'maya', kind: 'agent' },
    { objectId: 'agent:atlas', label: 'atlas', kind: 'agent' },
  ],
);
// …and those targets feed the picker on an EMPTY query (bare @), not just
// with filter text — the review miss was the universe, not the trigger.
const offlineTargets = composerTargetsFor([{ name: 'atlas', provider: null, live: false }]);
assert.deepEqual(mentionSuggestions(offlineTargets, '', 6).map((target) => target.label), ['atlas']);

console.log('messages/model tests passed');
