import assert from 'node:assert/strict';
import { inferSubagentState, oversightFingerprint, renderNotification, renderOversight } from './oversight.mjs';

const now = Date.parse('2026-07-17T03:00:00Z');
const subagent = { agentId: 'sub-1', toolUseId: 'tool-1', modified: now - 10_000, description: 'Verify browser' };
assert.equal(inferSubagentState([], subagent, now, 120_000), 'running');
assert.equal(inferSubagentState([], { ...subagent, modified: now - 130_000 }, now, 120_000), 'stale');
assert.equal(inferSubagentState([{ kind: 'tool_result', toolUseId: 'tool-1' }], subagent, now, 120_000), 'done');
const asyncLaunch = { kind: 'tool_result', toolUseId: 'tool-1', content: 'Async agent launched successfully.\nagentId: task-42' };
assert.equal(inferSubagentState([asyncLaunch], subagent, now, 120_000), 'running');
assert.equal(inferSubagentState([
  asyncLaunch,
  { kind: 'tool_result', content: '<task_id>task-42</task_id><status>completed</status>' },
], subagent, now, 120_000), 'done');
assert.equal(inferSubagentState([
  asyncLaunch,
  { kind: 'user_text', text: '<task-notification><task-id>task-42</task-id><status>completed</status></task-notification>' },
], subagent, now, 120_000), 'done');
assert.equal(inferSubagentState([
  asyncLaunch,
  { kind: 'tool_result', content: 'reaped agent-sub-1' },
], { ...subagent, modified: now - 130_000 }, now, 120_000), 'stopped');

const snapshot = {
  generatedAt: new Date(now).toISOString(),
  unavailable: [],
  agents: [{ agentId: 'a1', title: 'Fable', provider: 'claude', status: 'running', subagents: [{ ...subagent, state: 'stale', quietSeconds: 130 }] }],
};
assert.match(renderOversight(snapshot), /1\/1 agents running/);
assert.match(renderOversight(snapshot), /1 stale/);
assert.match(renderNotification(snapshot), /1 agents running; 1 subagents; 0 done; 1 stale/);
assert.match(renderNotification(snapshot), /Fable \/ Verify browser quiet 130s/);
const stoppedSnapshot = {
  ...snapshot,
  agents: [{ ...snapshot.agents[0], subagents: [{ ...subagent, state: 'stopped', quietSeconds: 130 }] }],
};
assert.match(renderOversight(stoppedSnapshot), /1 stopped/);
assert.doesNotMatch(renderNotification(stoppedSnapshot), /Attention:/);
assert.equal(oversightFingerprint(snapshot), oversightFingerprint({ ...snapshot, generatedAt: 'later' }));
const reordered = {
  ...snapshot,
  agents: [{ ...snapshot.agents[0], subagents: [
    { agentId: 'sub-2', state: 'running' },
    ...snapshot.agents[0].subagents,
  ] }],
};
const swapped = { ...reordered, agents: [{ ...reordered.agents[0], subagents: [...reordered.agents[0].subagents].reverse() }] };
assert.equal(oversightFingerprint(reordered), oversightFingerprint(swapped));

console.log('oversight tests passed');
