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

async function main(): Promise<void> {
  testRootsRefused();
  await withRig(testHubErrors);
  await withRig(testAmbiguousThrow);
  await withRig(testRoute);
  await withRig(testRoute409);
  console.log('PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
