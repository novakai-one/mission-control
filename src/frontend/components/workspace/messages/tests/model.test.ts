import assert from 'node:assert/strict';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import type { Conversation, TunnelEnvelope } from '../../../../lib/tunnelModel/index.js';
import {
  DENSITY_SCALE,
  dayLabelFor,
  displayNameFor,
  groupByDay,
  initialFor,
  isCollapsible,
  laneStatsFor,
  presenceToneFor,
  recapNotesFor,
  replyLabelFor,
  roleFor,
  roomLabelFor,
  snippetFor,
  splitRailSections,
  workingAgentFor,
  WORKING_WINDOW_MS,
} from '../model.js';

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

console.log('messages/model tests passed');
