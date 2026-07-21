// Mission Room V1 snapshot tests (pure derive, fabricated fixtures). Run with
// `npx tsx src/backend/missionView/snapshot/index.test.ts`.
import assert from 'node:assert/strict';
import { deriveSnapshot } from './index.js';
import type { MissionFacts } from './index.js';
import { resolveLinkage } from '../linkage/index.js';
import type { MissionLinkage } from '../linkage/index.js';
import type { PacketFile, RawRecord, RegistryEntry, StoreName } from '../sources/index.js';
import type { MessageEnvelope } from '../../messaging/types.js';
import type { MissionSnapshot } from '../../../shared/missionView/schema.js';
import { agentEntry, envelopeLine, issueLine, logLine, missionLine, okrLine, requestLine, taskLine } from '../tests/fixtures.js';

const MISSION_REFS = ',"refs":[{"kind":"project","value":"proj_a"},'
  + '{"kind":"exp","value":"EXP-1"},'
  + '{"kind":"doc","value":".novakai/work/mission_a/brief.md","label":"Mission Contract"},'
  + '{"kind":"doc","value":"https://example/pr/42","label":"PR #42"},'
  + '{"kind":"objective","value":"okr_a"}]';

function record(store: StoreName, line: number, json: string): RawRecord {
  return { store, path: `/fake/${store}.jsonl`, line, block: JSON.parse(json) as Record<string, unknown> };
}

function storesOf(partials: Partial<Record<StoreName, RawRecord[]>>): Record<StoreName, RawRecord[]> {
  return { 'missions': [], 'tasks': [], 'okrs': [], 'requests': [], 'issues': [], 'captains-log': [], ...partials };
}

function linked(missionId: string, stores: Record<StoreName, RawRecord[]>): MissionLinkage {
  const result = resolveLinkage(missionId, stores);
  assert.equal(result.status, 'resolved');
  return (result as { linkage: MissionLinkage }).linkage;
}

function makeFacts(linkage: MissionLinkage, overrides: Partial<MissionFacts> = {}): MissionFacts {
  return {
    missionId: String(linkage.mission.block.id),
    linkage,
    journal: [],
    journalPath: '/fake/messages.jsonl',
    registry: [],
    registryPath: '/fake/agents.json',
    registryObservedAt: null,
    packet: [],
    readProblems: [],
    asOf: '2026-07-21T13:00:00.000Z',
    ...overrides,
  };
}

function envelope(envelopeId: string, body: string): MessageEnvelope {
  return JSON.parse(envelopeLine(envelopeId, body)) as MessageEnvelope;
}

function packetFile(name: string): PacketFile {
  return { name, path: `/fake/work/mission_a/${name}`, observedModifiedAt: '2026-07-21T12:05:00.000Z' };
}

function fullStores(): Record<StoreName, RawRecord[]> {
  return storesOf({
    'missions': [record('missions', 11, missionLine('mission_a', MISSION_REFS))],
    'tasks': [record('tasks', 10, taskLine('task_a', 'mission_a'))],
    'captains-log': [record('captains-log', 56, logLine('log_a', 'mission_a'))],
    'issues': [record('issues', 7, issueLine('issue_a', 'task_a'))],
    'okrs': [record('okrs', 12, okrLine('okr_a', 'O10 truth integrity'))],
    'requests': [record('requests', 2, requestLine('req_a', 'mission_a', 'pending'))],
  });
}

function fullFacts(): MissionFacts {
  return makeFacts(linked('mission_a', fullStores()), {
    journal: [envelope('msg_1', 'mission_a in body'), envelope('msg_2', 'mission_a again'), envelope('msg_3', 'unrelated')],
    registry: [agentEntry('agent_live', false, 'proj_a') as unknown as RegistryEntry],
    registryObservedAt: '2026-07-21T12:30:00.000Z',
    packet: [packetFile('brief.md'), packetFile('plan.md')],
  });
}

function testPulse(snapshot: MissionSnapshot): void {
  assert.equal(snapshot.pulse.outcome.value, 'Mission mission_a', 'outcome falls back to title (M6)');
  assert.equal(snapshot.pulse.phase.value, 'step-6-closed', 'phase from stage');
  assert.equal(snapshot.pulse.health.value, 'attention', 'attention items present → attention');
  assert.equal(snapshot.pulse.lastUpdate.value, '2026-07-21T12:00:00+10:00');
  assert.equal(snapshot.pulse.nextCheckpoint.value, null, 'closed mission → null; UI renders the sourced closed line');
  assert.equal(snapshot.pulse.needsChris.value, true);
  assert.equal(snapshot.pulse.needsChris.sourceRefs[0].recordId, 'req_a');
}

function testMissionAndObjective(snapshot: MissionSnapshot): void {
  assert.equal(snapshot.mission.owner.value, 'chief-kimi', 'owner stays a raw sourced field');
  assert.deepEqual(snapshot.assignments, [], 'owner is never promoted into assignments (S4)');
  assert.equal(snapshot.objective?.value, 'O10 truth integrity');
  assert.equal(snapshot.objective?.sourceRefs[0].store, 'okrs');
  assert.deepEqual(snapshot.presences, [], 'no mission-explicit bound presence exists');
  assert.deepEqual(snapshot.currentActivity, []);
}

function testArtifacts(snapshot: MissionSnapshot): void {
  assert.deepEqual(snapshot.artifacts.map((entry) => entry.label), ['Mission Contract', 'PR #42']);
  assert.equal(snapshot.artifacts[0].observedModifiedAt, '2026-07-21T12:05:00.000Z', 'packet mtime is observation time (L2)');
  assert.equal(snapshot.artifacts[0].producedAt, null);
  assert.equal(snapshot.artifacts[1].observedModifiedAt, null, 'PR is label + URL only; no fs observation');
}

function testAttention(snapshot: MissionSnapshot): void {
  const idSet = new Set(snapshot.attention.map((entry) => entry.id));
  assert.ok(idSet.has('attention:no-assignments'));
  assert.ok(idSet.has('attention:no-presences'));
  assert.ok(idSet.has('attention:no-current-activity'));
  assert.ok(idSet.has('attention:unresolvable-ref:EXP-1'));
  assert.ok(idSet.has('attention:evidence-candidate:plan.md'), 'packet neighbor is a labeled candidate, not an artifact');
  assert.ok(!idSet.has('attention:evidence-candidate:brief.md'), 'explicitly ref\'d contract is an artifact');
  assert.ok(idSet.has('attention:presence-candidate:agent_live'), 'project-only registry entry is a candidate');
}

function testCommunication(snapshot: MissionSnapshot): void {
  const item = snapshot.attention.find((entry) => entry.id === 'attention:no-thread-ref');
  assert.equal(item?.label, 'no explicit thread/room ref exists for this mission', 'the primary gap (M3)');
  assert.ok(item?.detail.includes('2 journal envelope(s)'), 'mention count is diagnostic detail only');
  assert.ok(!snapshot.timeline.some((entry) => entry.summary.includes('in body')), 'never promoted into the timeline');
}

function testTimeline(snapshot: MissionSnapshot): void {
  assert.deepEqual(
    snapshot.timeline.map((entry) => entry.id),
    ['task_a', 'log_a', 'issue_a', 'mission_a'],
    'chronological by timestamp, labeled chronological (M4)',
  );
  const hopEntry = snapshot.timeline.find((entry) => entry.id === 'issue_a');
  assert.equal(hopEntry?.kind, 'issue');
  assert.deepEqual(hopEntry?.refPath, ['mission_a', 'task_a', 'issue_a']);
}

function testInvalidHealth(): void {
  const noTitle = '{"id":"mission_bad","kind":"mission","ts":"2026-07-21T10:00:00+10:00","status":"done"}';
  const snapshot = deriveSnapshot(makeFacts(linked('mission_bad', storesOf({ missions: [record('missions', 3, noTitle)] }))));
  assert.equal(snapshot.pulse.health.value, 'unknown', 'invalid mission record → unknown, never rendered clean');
  assert.ok(snapshot.issues.some((entry) => entry.includes('no non-empty string title')));
}

function testZeroRefs(): void {
  const snapshot = deriveSnapshot(makeFacts(linked('mission_solo', storesOf({ missions: [record('missions', 1, missionLine('mission_solo'))] }))));
  assert.deepEqual(snapshot.artifacts, []);
  assert.equal(snapshot.objective, null);
  assert.deepEqual(snapshot.timeline.map((entry) => entry.id), ['mission_solo']);
  assert.equal(snapshot.pulse.needsChris.value, false);
  assert.ok(!snapshot.issues.some((entry) => entry.includes('dangling')), 'zero refs dangle nothing');
}

function testReadProblemsSurface(): void {
  const facts = makeFacts(linked('mission_a', fullStores()), { readProblems: ['store file missing: okrs.jsonl'] });
  const snapshot = deriveSnapshot(facts);
  assert.ok(snapshot.issues.includes('store file missing: okrs.jsonl'), 'read problems render as visible issues');
  assert.equal(snapshot.pulse.health.value, 'attention');
}

function main(): void {
  const snapshot = deriveSnapshot(fullFacts());
  testPulse(snapshot);
  testMissionAndObjective(snapshot);
  testArtifacts(snapshot);
  testAttention(snapshot);
  testCommunication(snapshot);
  testTimeline(snapshot);
  testInvalidHealth();
  testZeroRefs();
  testReadProblemsSurface();
  console.log('PASS');
}

main();
