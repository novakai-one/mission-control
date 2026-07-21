// Mission Room V1 linkage tests (pure, fabricated fixtures). Run with
// `npx tsx src/backend/missionView/linkage/index.test.ts`.
import assert from 'node:assert/strict';
import { resolveLinkage } from './index.js';
import type { LinkageResult, MissionLinkage } from './index.js';
import type { RawRecord, StoreName } from '../sources/index.js';
import { issueLine, logLine, missionLine, okrLine, requestLine, taskLine } from '../tests/fixtures.js';

function record(store: StoreName, line: number, json: string): RawRecord {
  return { store, path: `/fake/${store}.jsonl`, line, block: JSON.parse(json) as Record<string, unknown> };
}

function storesOf(partials: Partial<Record<StoreName, RawRecord[]>>): Record<StoreName, RawRecord[]> {
  return { 'missions': [], 'tasks': [], 'okrs': [], 'requests': [], 'issues': [], 'captains-log': [], ...partials };
}

function resolved(result: LinkageResult): MissionLinkage {
  assert.equal(result.status, 'resolved');
  return (result as { status: 'resolved'; linkage: MissionLinkage }).linkage;
}

function testAbsent(): void {
  const result = resolveLinkage('mission_nope', storesOf({ missions: [record('missions', 1, missionLine('mission_a'))] }));
  assert.equal(result.status, 'absent');
}

function testAmbiguous(): void {
  const stores = storesOf({ missions: [record('missions', 1, missionLine('mission_dup')), record('missions', 2, missionLine('mission_dup'))] });
  const result = resolveLinkage('mission_dup', stores);
  assert.equal(result.status, 'ambiguous', 'duplicate target ids are never a silent pick');
  const candidates = (result as { candidates: Array<{ id: string; line: number; sourceRefs: Array<{ store: string }> }> }).candidates;
  assert.deepEqual(candidates.map((entry) => entry.line), [1, 2]);
  assert.equal(candidates[0].id, 'mission_dup');
  assert.equal(candidates[0].sourceRefs[0].store, 'missions');
}

function testReverseAndHop(): void {
  const stores = storesOf({
    'missions': [record('missions', 1, missionLine('mission_a'))],
    'tasks': [record('tasks', 1, taskLine('task_a', 'mission_a'))],
    'captains-log': [record('captains-log', 1, logLine('log_a', 'mission_a'))],
    'issues': [record('issues', 1, issueLine('issue_a', 'task_a'))],
  });
  const linkage = resolved(resolveLinkage('mission_a', stores));
  assert.equal(linkage.linked.length, 3);
  const hopEntry = linkage.linked.find((item) => item.record.block.id === 'issue_a');
  assert.deepEqual(hopEntry?.refPath, ['mission_a', 'task_a', 'issue_a'], 'one bounded hop with full refPath (M4)');
  assert.deepEqual(linkage.problems, []);
}

function testDuplicateReverse(): void {
  const stores = storesOf({
    'missions': [record('missions', 1, missionLine('mission_a'))],
    'tasks': [record('tasks', 1, taskLine('task_a', 'mission_a')), record('tasks', 2, taskLine('task_a', 'mission_a'))],
  });
  const linkage = resolved(resolveLinkage('mission_a', stores));
  assert.equal(linkage.linked.length, 2, 'both duplicates stay visible');
  const merged = linkage.problems.filter((entry) => entry.message.includes("duplicate id 'task_a'"));
  assert.equal(merged.length, 1, 'duplicate messages merge into one issue');
  const lines = merged[0].sourceRefs.map((sourceRef) => sourceRef.line).sort();
  assert.deepEqual(lines, [1, 2], 'BOTH line refs survive the merge — the duplication fact proves itself (T1)');
}

function testWrongKind(): void {
  const wrong = '{"id":"task_wrong","kind":"mission","ts":"2026-07-21T10:30:00+10:00","title":"t",'
    + '"refs":[{"kind":"mission","value":"mission_a"}]}';
  const stores = storesOf({
    'missions': [record('missions', 1, missionLine('mission_a'))],
    'tasks': [record('tasks', 7, wrong)],
  });
  const linkage = resolved(resolveLinkage('mission_a', stores));
  assert.ok(linkage.problems.some((entry) => entry.message.includes("kind 'mission' not allowed in tasks.jsonl")));
  assert.ok(linkage.problems.some((entry) => entry.message.includes('tasks:7')));
}

function testInvalidTarget(): void {
  const noTitle = '{"id":"mission_bad","kind":"mission","ts":"2026-07-21T10:00:00+10:00","status":"done"}';
  const linkage = resolved(resolveLinkage('mission_bad', storesOf({ missions: [record('missions', 3, noTitle)] })));
  assert.equal(linkage.missionValid, false, 'invalid target is served but flagged (never rendered clean)');
  assert.ok(linkage.problems.some((entry) => entry.message.includes('no non-empty string title')));
}

function testMissingTs(): void {
  const noTs = '{"id":"task_nots","kind":"task","title":"t","refs":[{"kind":"mission","value":"mission_a"}]}';
  const stores = storesOf({
    'missions': [record('missions', 1, missionLine('mission_a'))],
    'tasks': [record('tasks', 1, noTs)],
  });
  const linkage = resolved(resolveLinkage('mission_a', stores));
  assert.ok(linkage.problems.some((entry) => entry.message.includes("missing required field 'ts'")));
}

function testDangling(): void {
  const mission = missionLine('mission_a', ',"refs":[{"kind":"objective","value":"okr_missing"}]');
  const task = '{"id":"task_a","kind":"task","ts":"2026-07-21T10:30:00+10:00","title":"t",'
    + '"refs":[{"kind":"mission","value":"mission_a"},{"kind":"log","value":"log_missing"}]}';
  const stores = storesOf({ 'missions': [record('missions', 1, mission)], 'tasks': [record('tasks', 1, task)] });
  const linkage = resolved(resolveLinkage('mission_a', stores));
  assert.ok(linkage.problems.some((entry) => entry.message.includes("objective 'okr_missing' absent from okrs.jsonl")));
  assert.ok(linkage.problems.some((entry) => entry.message.includes("log 'log_missing' — absent from captains-log.jsonl")));
  assert.equal(linkage.objective, null);
}

function testUnresolvable(): void {
  const mission = missionLine('mission_a', ',"refs":[{"kind":"exp","value":"EXP-1"},{"kind":"session","value":"live_x"}]');
  const linkage = resolved(resolveLinkage('mission_a', storesOf({ missions: [record('missions', 1, mission)] })));
  assert.deepEqual(linkage.unresolvableRefs.map((entry) => entry.value), ['EXP-1', 'live_x']);
  assert.ok(!linkage.problems.some((entry) => entry.message.includes('dangling')), 'exp/session are attention, never dangling');
}

function testObjectiveResolves(): void {
  const mission = missionLine('mission_a', ',"refs":[{"kind":"objective","value":"okr_a"}]');
  const stores = storesOf({ 'missions': [record('missions', 1, mission)], 'okrs': [record('okrs', 1, okrLine('okr_a', 'O1'))] });
  const linkage = resolved(resolveLinkage('mission_a', stores));
  assert.equal(linkage.objective?.block.title, 'O1');
}

function testNeedsChris(): void {
  const base = { missions: [record('missions', 1, missionLine('mission_a'))] };
  const pending = resolved(resolveLinkage('mission_a', storesOf({ ...base, requests: [record('requests', 1, requestLine('req_a', 'mission_a', 'pending'))] })));
  assert.equal(pending.needsChris, true, 'pending request ref\'ing the mission (explicit reverse ref, M6)');
  assert.equal(pending.needsChrisSource?.block.id, 'req_a');
  const answered = resolved(resolveLinkage('mission_a', storesOf({ ...base, requests: [record('requests', 1, requestLine('req_a', 'mission_a', 'answered'))] })));
  assert.equal(answered.needsChris, false);
}

function testRefKindAllowlist(): void {
  const mission = missionLine('mission_a', ',"refs":[{"kind":"bogus","value":"x"}]');
  const linkage = resolved(resolveLinkage('mission_a', storesOf({ missions: [record('missions', 1, mission)] })));
  assert.ok(linkage.problems.some((entry) => entry.message.includes("ref kind 'bogus' outside the typed-ref allowlist")));
}

function main(): void {
  testAbsent();
  testAmbiguous();
  testReverseAndHop();
  testDuplicateReverse();
  testWrongKind();
  testInvalidTarget();
  testMissingTs();
  testDangling();
  testUnresolvable();
  testObjectiveResolves();
  testNeedsChris();
  testRefKindAllowlist();
  console.log('PASS');
}

main();
