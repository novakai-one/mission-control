import assert from 'node:assert/strict';
import { agentActivity, agentNames, buildChatMessages, formatChatTime } from './index.js';
import type { CanonicalEvent, ThreadProjection } from '../../../shared/provider/schema.js';

function event(overrides: Partial<CanonicalEvent>): CanonicalEvent {
  return {
    id: 'event-1',
    provider: 'claude',
    sessionId: 'session-1',
    kind: 'assistant',
    timestamp: '2026-07-17T21:31:00.000Z',
    text: 'Task events reach the timeline now.',
    rawType: 'assistant',
    ...overrides,
  };
}

function projection(events: CanonicalEvent[]): ThreadProjection {
  return {
    thread: { id: 'thread-1', title: 'Canonical task events', sessionReferences: [], createdAt: '', updatedAt: '' },
    events,
    issues: [],
  };
}

// Empty projection → no messages.
assert.deepEqual(buildChatMessages(null), []);
assert.deepEqual(buildChatMessages(projection([])), []);

// user/assistant become captioned messages; tool/system stay out of the chat.
const mixed = buildChatMessages(projection([
  event({ id: 'u1', kind: 'user', text: 'Fix the parser.' }),
  event({ id: 't1', kind: 'tool', text: 'Bash(...)', rawType: 'tool_use' }),
  event({ id: 'a1', kind: 'assistant', provider: 'codex' }),
  event({ id: 's1', kind: 'system', text: 'compact', rawType: 'system' }),
]));
assert.deepEqual(mixed.map((message) => message.id), ['u1', 'a1']);
assert.equal(mixed[0].fromYou, true);
assert.equal(mixed[0].author, 'You');
assert.equal(mixed[0].rows.length, 0);
assert.equal(mixed[1].author, 'codex-1');
assert.equal(mixed[1].fromYou, false);

// task snapshot → numbered state rows carrying a (null for now) mention slot.
const tasks = buildChatMessages(projection([event({
  id: 'k1',
  kind: 'task',
  text: '',
  tasks: [
    { id: 'one', subject: 'Port the shell', status: 'completed' },
    { id: 'two', subject: 'Wire the socket', status: 'in_progress', activeForm: 'Wiring the socket' },
  ],
})]));
assert.equal(tasks[0].caption, 'Task list updated.');
assert.equal(tasks[0].rows.length, 2);
assert.equal(tasks[0].rows[0].text, 'Port the shell');
assert.equal(tasks[0].rows[0].settled, true);
assert.equal(tasks[0].rows[0].objectId, null);
assert.equal(tasks[0].rows[1].text, 'Wiring the socket');
assert.equal(tasks[0].rows[1].state, 'in progress');
assert.equal(tasks[0].rows[1].settled, false);

// approval → command row plus one row per declared write.
const approvals = buildChatMessages(projection([event({
  id: 'p1',
  kind: 'approval',
  text: 'Renderer registry needs your call.',
  approval: { command: 'npm run migrate', reason: 'renderer registry', writes: ['a.ts', 'b.ts'] },
})]));
assert.equal(approvals[0].rows.length, 3);
assert.equal(approvals[0].rows[0].mono, 'npm run migrate');
assert.equal(approvals[0].rows[0].state, 'awaiting');
assert.equal(approvals[0].rows[2].mono, 'b.ts');

// The limit keeps only the newest messages.
const capped = buildChatMessages(
  projection([event({ id: 'm1' }), event({ id: 'm2' }), event({ id: 'm3' })]),
  2,
);
assert.deepEqual(capped.map((message) => message.id), ['m2', 'm3']);

// Bad timestamps degrade to an empty time, never NaN text.
assert.equal(formatChatTime('not-a-date'), '');
assert.notEqual(formatChatTime('2026-07-17T21:31:00.000Z'), '');

// Agent identity: per-thread names by first appearance — no colors involved.
const namedEvents = [
  event({ id: 'n1', provider: 'claude', sessionId: 'sess-a' }),
  event({ id: 'n2', provider: 'codex', sessionId: 'sess-b' }),
  event({ id: 'n3', provider: 'claude', sessionId: 'sess-c' }),
  event({ id: 'n4', provider: 'claude', sessionId: 'sess-a' }),
];
const names = agentNames(namedEvents);
assert.equal(names.get('claude:sess-a'), 'claude-1');
assert.equal(names.get('codex:sess-b'), 'codex-1');
assert.equal(names.get('claude:sess-c'), 'claude-2');
const named = buildChatMessages(projection(namedEvents));
assert.deepEqual(named.map((message) => message.author), ['claude-1', 'codex-1', 'claude-2', 'claude-1']);

// Exactly one gold label: only an approval that is still the newest event
// claims attention, and anything after it releases the gold.
const openApproval = buildChatMessages(projection([
  event({ id: 'q1', kind: 'assistant' }),
  event({ id: 'q2', kind: 'approval', approval: { writes: [] } }),
]));
assert.deepEqual(openApproval.map((message) => message.needsYou), [false, true]);
const answeredApproval = buildChatMessages(projection([
  event({ id: 'q2', kind: 'approval', approval: { writes: [] } }),
  event({ id: 'q3', kind: 'user', text: 'run it' }),
]));
assert.deepEqual(answeredApproval.map((message) => message.needsYou), [false, false]);

// Activity: pending/unanswered turns = working, fresh output = replying,
// stale output = ready; exited agents settle, none at all is idle.
const NOW_MS = Date.parse('2026-07-17T21:31:10.000Z');
const oldAssistant = event({ id: 'v1', timestamp: '2026-07-17T21:00:00.000Z' });
const freshAssistant = event({ id: 'v2', timestamp: '2026-07-17T21:31:08.000Z' });
const userTurn = event({ id: 'v3', kind: 'user', timestamp: '2026-07-17T21:31:08.000Z' });
assert.equal(agentActivity(null, [], false, NOW_MS), 'idle');
assert.equal(agentActivity('exited', [freshAssistant], false, NOW_MS), 'settled');
assert.equal(agentActivity('running', [oldAssistant], true, NOW_MS), 'working');
assert.equal(agentActivity('running', [oldAssistant, userTurn], false, NOW_MS), 'working');
assert.equal(agentActivity('running', [freshAssistant], false, NOW_MS), 'replying');
assert.equal(agentActivity('running', [oldAssistant], false, NOW_MS), 'ready');
assert.equal(agentActivity('running', [], false, NOW_MS), 'ready');

// Mention targets fill the row objectId seam: a task row naming an agent
// points at that agent's object; unresolvable rows stay null.
const mentionTargets = [{ objectId: 'agent:codex-1', label: 'codex-1', kind: 'agent' as const }];
const linkedRows = buildChatMessages(projection([event({
  id: 'l1',
  kind: 'task',
  text: '',
  tasks: [
    { id: 'one', subject: 'waiting on codex-1', status: 'in_progress' },
    { id: 'two', subject: 'port the shell', status: 'completed' },
  ],
})]), undefined, mentionTargets);
assert.equal(linkedRows[0].rows[0].objectId, 'agent:codex-1');
assert.equal(linkedRows[0].rows[1].objectId, null);

// Idle-session system heartbeats carry fresh timestamps; they must neither
// hold Replying open nor mask an unanswered user turn.
const freshSystem = event({ id: 'v4', kind: 'system', text: 'auto', timestamp: '2026-07-17T21:31:09.000Z' });
assert.equal(agentActivity('running', [oldAssistant, freshSystem], false, NOW_MS), 'ready');
assert.equal(agentActivity('running', [userTurn, freshSystem], false, NOW_MS), 'working');

console.log('PASS');
