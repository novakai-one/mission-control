// Mission Room V1 hub tests: roots refusal (S1), id containment, error mapping,
// and one route integration pass against temp dirs on an ephemeral port. Run with
// `npx tsx src/backend/missionView/index.test.ts`.
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import {
  InvalidMissionIdError,
  MissionAmbiguousError,
  MissionNotFoundError,
  MissionViewHub,
} from './index.js';
import type { MissionViewRoots } from './index.js';
import type { MissionSnapshotError, MissionSnapshotResponse } from '../../shared/missionView/schema.js';
import {
  agentEntry,
  envelopeLine,
  missionLine,
  taskLine,
  withRig,
  writeJournal,
  writePacketFile,
  writeRegistry,
  writeStore,
} from './tests/fixtures.js';
import type { Rig } from './tests/fixtures.js';

function testRootsRefused(): void {
  assert.throws(() => new MissionViewHub(undefined as unknown as MissionViewRoots), /explicit roots/);
  const relative = { storesDir: 'rel', workDir: '/abs/work', journalPath: '/abs/j', registryPath: '/abs/r', roomsPath: '/abs/ro' };
  assert.throws(() => new MissionViewHub(relative), /absolute path/, 'no cwd-relative defaults inside the module (S1)');
  const missing = { storesDir: '/abs/s' } as MissionViewRoots;
  assert.throws(() => new MissionViewHub(missing), /absolute path/);
}

function seedRig(env: Rig): void {
  writeStore(env, 'missions.jsonl', [missionLine('mission_a')]);
  writeStore(env, 'tasks.jsonl', [taskLine('task_a', 'mission_a')]);
  writeJournal(env, [envelopeLine('msg_1', 'mission_a mentioned in body')]);
  writeRegistry(env, [agentEntry('agent_live', false, 'proj_a')]);
  writePacketFile(env, 'mission_a', 'brief.md', '# contract');
}

function testHubErrors(env: Rig): void {
  seedRig(env);
  const view = new MissionViewHub(env.roots);
  assert.throws(() => view.readMissionSnapshot('a/b'), InvalidMissionIdError);
  assert.throws(() => view.readMissionSnapshot('..'), InvalidMissionIdError);
  assert.throws(() => view.readMissionSnapshot('mission_nope'), MissionNotFoundError);
  const snapshot = view.readMissionSnapshot('mission_a');
  assert.equal(snapshot.mission.id, 'mission_a');
  assert.equal(snapshot.pulse.health.value, 'attention');
  assert.ok(snapshot.attention.length > 0);
  assert.ok(snapshot.asOf.length > 0);
}

function testAmbiguousThrow(env: Rig): void {
  writeStore(env, 'missions.jsonl', [missionLine('mission_dup'), missionLine('mission_dup')]);
  const view = new MissionViewHub(env.roots);
  try {
    view.readMissionSnapshot('mission_dup');
    assert.fail('expected MissionAmbiguousError');
  } catch (error) {
    assert.ok(error instanceof MissionAmbiguousError);
    assert.deepEqual(error.candidates.map((entry) => entry.line), [1, 2]);
  }
}

async function serve(view: MissionViewHub): Promise<{ server: Server; base: string }> {
  const application = express();
  view.registerRoutes(application);
  const server = await new Promise<Server>((resolve) => {
    const listening = application.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { server, base: `http://127.0.0.1:${port}` };
}

async function testRoute(env: Rig): Promise<void> {
  seedRig(env);
  const { server, base } = await serve(new MissionViewHub(env.roots));
  try {
    const good = await fetch(`${base}/api/missions/mission_a/snapshot`);
    assert.equal(good.status, 200);
    const body = await good.json() as MissionSnapshotResponse;
    assert.equal(body.snapshot.mission.id, 'mission_a');
    assert.equal(body.snapshot.timeline.some((entry) => entry.id === 'task_a'), true);
    const absent = await fetch(`${base}/api/missions/mission_nope/snapshot`);
    assert.equal(absent.status, 404, '404 reserved for a truly absent id');
  } finally {
    server.close();
  }
}

async function testRoute409(env: Rig): Promise<void> {
  writeStore(env, 'missions.jsonl', [missionLine('mission_dup'), missionLine('mission_dup')]);
  const { server, base } = await serve(new MissionViewHub(env.roots));
  try {
    const response = await fetch(`${base}/api/missions/mission_dup/snapshot`);
    assert.equal(response.status, 409);
    const body = await response.json() as MissionSnapshotError;
    assert.equal(body.candidates?.length, 2);
    assert.deepEqual(body.candidates?.map((entry) => entry.line), [1, 2]);
    assert.equal(body.candidates?.[0].sourceRefs[0].store, 'missions');
  } finally {
    server.close();
  }
}

// S1 (mission_mission-control-ux): 'active' must never pin a signed-off
// mission — closed/refiled/done team-linked missions are excluded BEFORE the
// newest pick, and the open fallback keeps its existing rule.
function testActiveExcludesClosedTeamLinked(env: Rig): void {
  writeStore(env, 'missions.jsonl', [
    missionLine('mission_open').replace('"status":"done"', '"status":"doing"').replace('"updated":"2026-07-21T12:00:00+10:00"', '"updated":"2026-07-20T12:00:00+10:00"'),
    missionLine('mission_closed'), // status done, updated 2026-07-21 — NEWER and team-linked
  ]);
  writeStore(env, 'teams.jsonl', [
    '{"id":"team_closed","kind":"team","ts":"2026-07-21T09:00:00+10:00","name":"Closed Team","refs":[{"kind":"mission","value":"mission_closed"}]}',
  ]);
  const view = new MissionViewHub(env.roots);
  const snapshot = view.readMissionSnapshot('active');
  assert.equal(snapshot.mission.id, 'mission_open', 'a newer but closed team-linked mission never wins over an open one');
}

function testActiveOpenTeamLinkedStillWins(env: Rig): void {
  writeStore(env, 'missions.jsonl', [
    missionLine('mission_solo').replace('"status":"done"', '"status":"doing"').replace('"updated":"2026-07-21T12:00:00+10:00"', '"updated":"2026-07-22T12:00:00+10:00"'),
    missionLine('mission_teamed').replace('"status":"done"', '"status":"doing"'),
  ]);
  writeStore(env, 'teams.jsonl', [
    '{"id":"team_live","kind":"team","ts":"2026-07-21T09:00:00+10:00","name":"Live Team","refs":[{"kind":"mission","value":"mission_teamed"}]}',
  ]);
  const view = new MissionViewHub(env.roots);
  const snapshot = view.readMissionSnapshot('active');
  assert.equal(snapshot.mission.id, 'mission_teamed', 'an OPEN team-linked mission beats a newer open solo mission');
}

function testActiveAllClosed(env: Rig): void {
  writeStore(env, 'missions.jsonl', [missionLine('mission_done')]); // status done
  const view = new MissionViewHub(env.roots);
  assert.throws(() => view.readMissionSnapshot('active'), MissionNotFoundError, 'nothing open → honest 404, never a closed pin');
}

// Ruling 2i (mission_visual-truth): freshness compares PARSED instants, never
// lexical strings — "2026-07-23T15:00:00+10:00" (= 05:00Z) sorts AHEAD of
// "2026-07-23T10:07:37.099Z" as text while being the older instant. The live
// defect: the Mission Room pinned mission_chief-operations over the genuinely
// newer mission_visual-truth. Both team-linked so the sort is the decider.
function testActiveMixedOffsets(env: Rig): void {
  const olderOffset = '{"id":"mission_offset","kind":"mission","ts":"2026-07-23T15:00:00+10:00","title":"Offset mission","status":"doing"}';
  const newerZulu = '{"id":"mission_zulu","kind":"mission","ts":"2026-07-23T10:07:37.099Z","title":"Zulu mission","status":"doing"}';
  writeStore(env, 'missions.jsonl', [olderOffset, newerZulu]);
  writeStore(env, 'teams.jsonl', [
    '{"id":"team_offset","kind":"team","ts":"2026-07-23T09:00:00Z","name":"Offset Team","refs":[{"kind":"mission","value":"mission_offset"}]}',
    '{"id":"team_zulu","kind":"team","ts":"2026-07-23T09:00:00Z","name":"Zulu Team","refs":[{"kind":"mission","value":"mission_zulu"}]}',
  ]);
  const view = new MissionViewHub(env.roots);
  const snapshot = view.readMissionSnapshot('active');
  assert.equal(snapshot.mission.id, 'mission_zulu', 'the newer INSTANT wins even when a mixed offset loses the lexical sort');
}

// Same law on the `updated` field: an +10:00 updated stamp must not outrank a
// genuinely newer Z stamp.
function testActiveMixedOffsetsUpdated(env: Rig): void {
  const olderOffset = '{"id":"mission_offset","kind":"mission","ts":"2026-07-23T01:00:00Z","title":"Offset mission","status":"doing","updated":"2026-07-23T18:00:00+10:00"}';
  const newerZulu = '{"id":"mission_zulu","kind":"mission","ts":"2026-07-23T01:00:00Z","title":"Zulu mission","status":"doing","updated":"2026-07-23T09:00:00.000Z"}';
  writeStore(env, 'missions.jsonl', [olderOffset, newerZulu]);
  writeStore(env, 'teams.jsonl', [
    '{"id":"team_offset","kind":"team","ts":"2026-07-23T09:00:00Z","name":"Offset Team","refs":[{"kind":"mission","value":"mission_offset"}]}',
    '{"id":"team_zulu","kind":"team","ts":"2026-07-23T09:00:00Z","name":"Zulu Team","refs":[{"kind":"mission","value":"mission_zulu"}]}',
  ]);
  const view = new MissionViewHub(env.roots);
  const snapshot = view.readMissionSnapshot('active');
  assert.equal(snapshot.mission.id, 'mission_zulu', 'updated: parsed compare (18:00+10:00 = 08:00Z < 09:00Z), never lexical');
}

async function main(): Promise<void> {
  testRootsRefused();
  await withRig(testHubErrors);
  await withRig(testAmbiguousThrow);
  await withRig(testRoute);
  await withRig(testRoute409);
  await withRig(testActiveExcludesClosedTeamLinked);
  await withRig(testActiveOpenTeamLinkedStillWins);
  await withRig(testActiveAllClosed);
  await withRig(testActiveMixedOffsets);
  await withRig(testActiveMixedOffsetsUpdated);
  console.log('PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
