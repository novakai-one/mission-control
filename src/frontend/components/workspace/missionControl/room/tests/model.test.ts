import assert from 'node:assert/strict';
import { missionRoomViewModel } from '../model.js';
import type { MissionSnapshot, Sourced } from '../../../../../../shared/missionView/schema.js';

function sourced<T>(value: T): Sourced<T> {
  return { value, sourceRefs: [{ store: 'missions', recordId: 'mission_store-validator', line: 11 }] };
}

function attention(id: string, label: string) {
  return { id, label, detail: `${label} — not explicitly linked.`, sourceRefs: [{ store: 'missions', line: 11 }] };
}

function unlinkedMission(): MissionSnapshot['mission'] {
  return {
    id: 'mission_store-validator',
    title: sourced('Store validator'),
    status: sourced('done'),
    owner: sourced<string | null>('chief-kimi'),
    stage: sourced<string | null>('step-6-closed'),
    priority: sourced<string | null>(null),
  };
}

function unlinkedPulse(): MissionSnapshot['pulse'] {
  return {
    outcome: sourced<string | null>('Store writer hardened.'),
    phase: sourced<string | null>('step-6-closed'),
    health: sourced<'on-track' | 'attention' | 'unknown'>('attention'),
    lastUpdate: sourced<string | null>('2026-07-21T00:00:00.000Z'),
    nextCheckpoint: sourced<string | null>(null),
    needsChris: sourced(false),
  };
}

function unlinkedAttention(): MissionSnapshot['attention'] {
  return [
    attention('att-assign', 'No mission-explicit assignments stored'),
    attention('att-presence', 'No mission-explicit bound presences'),
    attention('att-activity', 'No explicitly linked current activity'),
    attention('att-comms', 'No explicit thread/room ref exists for this mission'),
    attention('att-evidence', 'Unlinked evidence candidates in the mission packet'),
  ];
}

// The honest V1 snapshot shape for mission_store-validator: closed mission,
// zero stored assignments/presences/activity, gaps as labeled attention items.
function unlinkedSnapshot(): MissionSnapshot {
  return {
    mission: unlinkedMission(),
    pulse: unlinkedPulse(),
    objective: sourced('O10: truth integrity'),
    assignments: [],
    presences: [],
    currentActivity: [],
    timeline: [],
    artifacts: [],
    attention: unlinkedAttention(),
    asOf: '2026-07-21T01:00:00.000Z',
    issues: ['tasks.jsonl:10 — task_store-validator missing required field ts'],
  };
}

function linkedPresences(): MissionSnapshot['presences'] {
  return [{
    agentId: 'agent-1',
    title: 'Builder Kimi',
    provider: 'kimi',
    sessionId: 'session-9',
    sessionError: null,
    status: 'running',
    observedAt: '2026-07-21T00:59:00.000Z',
    sourceRefs: [{ store: 'registry', path: '.novakai-command/agents.json' }],
  }];
}

function linkedTimeline(): MissionSnapshot['timeline'] {
  return [{
    id: 'log_2026-07-21-003',
    kind: 'log',
    summary: 'Verified the store writer',
    timestamp: '2026-07-21T00:30:00.000Z',
    refPath: ['mission_store-validator'],
    sourceRefs: [{ store: 'captains-log', recordId: 'log_2026-07-21-003', line: 3 }],
  }];
}

function linkedArtifacts(): MissionSnapshot['artifacts'] {
  return [{
    id: 'pr-42',
    kind: 'pr',
    label: 'PR #42',
    location: 'https://github.com/example/repo/pull/42',
    producedAt: null,
    observedModifiedAt: null,
    sourceRefs: [{ store: 'missions', line: 11 }],
  }];
}

// A fully linked snapshot: every glance question answered by a sourced fact.
function linkedSnapshot(): MissionSnapshot {
  const base = unlinkedSnapshot();
  return {
    ...base,
    pulse: { ...base.pulse, nextCheckpoint: sourced<string | null>('step-7-verify') },
    assignments: [{ personId: 'person_builder', role: 'Builder', sourceRefs: [{ store: 'missions', line: 11 }] }],
    presences: linkedPresences(),
    currentActivity: [{ personId: 'person_builder', summary: 'Building the room', active: true, sourceRefs: [{ store: 'registry' }] }],
    timeline: linkedTimeline(),
    artifacts: linkedArtifacts(),
    attention: [],
  };
}

function pulseFact(model: ReturnType<typeof missionRoomViewModel>, label: string) {
  const fact = model.pulse.find((entry) => entry.label === label);
  assert.ok(fact, `pulse fact "${label}" must exist`);
  return fact;
}

function hasAttention(model: ReturnType<typeof missionRoomViewModel>, pattern: RegExp): boolean {
  return model.attention.some((item) => pattern.test(item.label) || pattern.test(item.detail));
}

// (a) S2 regression — the view-model takes ONLY the snapshot. A fabricated
// roster of unbound global agents sits in scope yet must never leak into the
// room's team/presence surface.
const globalRoster = [
  { agentId: 'agent-unbound-1', title: 'Manager Fable', status: 'running', projectId: 'proj_novakai-command' },
  { agentId: 'agent-unbound-2', title: 'Codex Auditor', status: 'idle' },
];
assert.ok(globalRoster.length === 2, 'roster fixture is in scope');
const boundedModel = missionRoomViewModel(unlinkedSnapshot());
assert.equal(boundedModel.assignments.length, 0);
assert.equal(boundedModel.presences.length, 0);
assert.equal(boundedModel.currentActivity.length, 0);
const teamSurface = JSON.stringify({
  assignments: boundedModel.assignments,
  presences: boundedModel.presences,
  currentActivity: boundedModel.currentActivity,
});
for (const agent of globalRoster) {
  assert.ok(!teamSurface.includes(agent.agentId), `unbound agent ${agent.agentId} must not appear`);
  assert.ok(!teamSurface.includes(agent.title), `unbound agent ${agent.title} must not appear`);
}

// (b) S3 Done-when matrix — one block per Contract glance question (7). Each
// asserts its representation exists in the view-model either as a sourced
// value or as a labeled attention item (the fallback form).
const unlinked = missionRoomViewModel(unlinkedSnapshot());
const linked = missionRoomViewModel(linkedSnapshot());

// 1. Outcome.
assert.ok(pulseFact(unlinked, 'Outcome').value.length > 0);
assert.ok(pulseFact(linked, 'Outcome').value.length > 0);

// 2. Who is assigned, including active sessions.
assert.ok(
  linked.assignments.length > 0 && linked.presences.some((entry) => entry.sessionId !== null),
  'linked form: assignments plus a presence carrying its sessionId',
);
assert.ok(
  unlinked.assignments.length === 0 && hasAttention(unlinked, /assign|presence|session/i),
  'fallback form: empty team explained by a labeled attention item',
);

// 3. What everyone is doing now.
assert.ok(linked.currentActivity.some((entry) => entry.active));
assert.ok(unlinked.currentActivity.length === 0 && hasAttention(unlinked, /current activity/i));

// 4. Recent history, including team communication.
assert.ok(linked.timeline.length > 0);
assert.ok(unlinked.timeline.length === 0 && hasAttention(unlinked, /thread|communication/i));

// 5. Next checkpoint — sourced stage text when open; the sourced "mission
// closed" line when nextCheckpoint is null (M6).
assert.equal(pulseFact(linked, 'Next checkpoint').value, 'step-7-verify');
assert.equal(
  pulseFact(unlinked, 'Next checkpoint').value,
  'Mission closed (status `done`, stage `step-6-closed`) — no next checkpoint',
);
assert.ok(pulseFact(unlinked, 'Next checkpoint').sourceRefs.length > 0);

// 6. What needs attention — the first-class attention list is always present.
assert.ok(Array.isArray(unlinked.attention) && unlinked.attention.length === 5);
assert.ok(Array.isArray(linked.attention));
assert.ok(unlinked.attention.every((item) => item.label.length > 0 && item.sourceRefs.length > 0));

// 7. Where plan, review, evidence, PR, and result live.
assert.ok(
  linked.artifacts.some((artifact) => artifact.kind === 'pr' && artifact.location.startsWith('https://')),
  'linked form: resolved artifacts carry label + location',
);
assert.ok(
  unlinked.artifacts.length === 0 && hasAttention(unlinked, /evidence|artifact|plan|pr|result/i),
  'fallback form: unlinked evidence candidates are labeled attention items',
);

// Trust: freshness line + every read issue visible (M6).
assert.ok(unlinked.trust.asOf.length > 0);
assert.deepEqual(unlinked.trust.issues, ['tasks.jsonl:10 — task_store-validator missing required field ts']);

console.log('room/model.test.ts: all assertions passed');
