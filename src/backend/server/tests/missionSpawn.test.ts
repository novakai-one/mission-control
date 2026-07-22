// Mission spawn path (plan v2 §1.4, ruling S4): one id minted once, the
// durable Agent block persisted BEFORE the Presence exists, launch failure
// leaving an explicit failed record, session attach on resolution, and the
// identity projection. Run with
// `npx tsx src/backend/server/tests/missionSpawn.test.ts`.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { AgentsHub } from '../agents.js';
import { ObjectModel } from '../../objectModel/index.js';
import { readStoreDir } from '../../stores/store.mjs';
import type { AgentInfo, CreateAgentOptions } from '../../terminal/manager.js';
import type { TerminalRuntime } from '../../terminal/runtime/index.js';

const TS = '2026-07-22T10:00:00+10:00';
const STORE_FILES = [
  'decisions.jsonl', 'requests.jsonl', 'missions.jsonl', 'tasks.jsonl', 'captains-log.jsonl',
  'learnings.jsonl', 'okrs.jsonl', 'projects.jsonl', 'issues.jsonl',
  'teams.jsonl', 'agents.jsonl', 'artifacts.jsonl', 'threads.jsonl',
];

function scratchStores(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'nvk-spawn-'));
  for (const name of STORE_FILES) writeFileSync(path.join(dir, name), '');
  writeFileSync(path.join(dir, 'missions.jsonl'),
    JSON.stringify({ id: 'mission_alpha', kind: 'mission', ts: TS, title: 'Alpha', owner: 'chief' }) + '\n');
  writeFileSync(path.join(dir, 'teams.jsonl'),
    JSON.stringify({ id: 'team_alpha', kind: 'team', ts: TS, name: 'Alpha Crew', refs: [{ kind: 'mission', value: 'mission_alpha' }] }) + '\n');
  return dir;
}

function agentInfo(overrides: Partial<AgentInfo>): AgentInfo {
  return {
    agentId: 'agent_x', title: 'claude-1', provider: 'claude', sessionId: '',
    projectDir: 'project', cwd: '/tmp/project', status: 'running', createdAt: new Date().toISOString(),
    ...overrides,
  };
}

interface Harness {
  base: string;
  dir: string;
  createdOptions: CreateAgentOptions[];
  recordExistedAtLaunch: boolean[];
  fireSession: (info: AgentInfo) => void;
  close: () => void;
}

async function startHarness({ failLaunch = false } = {}): Promise<Harness> {
  const dir = scratchStores();
  const model = new ObjectModel({ storesDir: dir });
  const createdOptions: CreateAgentOptions[] = [];
  const recordExistedAtLaunch: boolean[] = [];
  let sessionCallback: (info: AgentInfo) => void = () => {};
  const terminals: TerminalRuntime = {
    create: (options: CreateAgentOptions) => {
      createdOptions.push(options);
      // The S4 ordering proof: at the moment the runtime is asked to launch,
      // the durable record must already exist.
      recordExistedAtLaunch.push(Boolean(options.agentId && model.agentRecord(options.agentId)));
      if (failLaunch) return Promise.reject(new Error('PTY launch refused'));
      return Promise.resolve(agentInfo({
        agentId: options.agentId ?? `agent_fake_${createdOptions.length}`,
        title: options.title ?? 'agent',
        provider: options.provider ?? 'claude',
        cwd: options.cwd,
      }));
    },
    write: () => true, resize: () => true, rename: () => true, kill: () => true, archive: () => true,
    snapshot: () => '', list: () => [],
    onData: () => {}, onExit: () => {},
    onSession: (callback) => { sessionCallback = callback; },
  };
  const hub = new AgentsHub(new Set(), terminals, undefined, model);
  const application = express();
  application.use(express.json());
  hub.registerRoutes(application);
  const server: Server = await new Promise((resolve) => {
    const listening = application.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return {
    base: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    dir, createdOptions, recordExistedAtLaunch,
    fireSession: (info) => sessionCallback(info),
    close: () => server.close(),
  };
}

async function postAgent(base: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${base}/api/agents`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}

function durableAgents(dir: string): Array<Record<string, unknown>> {
  return readStoreDir(dir).files['agents.jsonl'].records.map((record) => record.block);
}

// --- happy path: one id, record-before-Presence, session attach --------------

{
  const harness = await startHarness();
  const { status, json } = await postAgent(harness.base, {
    title: 'Worker One', provider: 'claude', cwd: '/tmp/project',
    missionId: 'mission_alpha', teamId: 'team_alpha',
  });
  assert.equal(status, 201);
  const runtimeId = json.agentId as string;

  const blocks = durableAgents(harness.dir);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, runtimeId, 'durable id IS the runtime id — one mint, no fork');
  assert.equal(blocks[0].status, 'spawning');
  assert.deepEqual(harness.recordExistedAtLaunch, [true], 'record persisted BEFORE the runtime launch');

  harness.fireSession(agentInfo({ agentId: runtimeId, sessionId: 'session-abc' }));
  const attached = durableAgents(harness.dir)[0];
  assert.equal(attached.sessionId, 'session-abc');
  assert.equal(attached.status, 'live');

  // Replayed callback (host restart re-emits) stays a no-op.
  harness.fireSession(agentInfo({ agentId: runtimeId, sessionId: 'session-abc' }));
  assert.equal(durableAgents(harness.dir).length, 1);

  const identity = await fetch(`${harness.base}/api/agents/${runtimeId}/identity`);
  assert.equal(identity.status, 200);
  const identityBody = await identity.json() as { durable: Record<string, unknown> | null };
  assert.equal(identityBody.durable?.sessionId, 'session-abc', 'projection serves the durable record');

  harness.close();
  rmSync(harness.dir, { recursive: true, force: true });
  console.log('mission spawn happy-path tests passed');
}

// --- launch failure leaves an explicit failed record -------------------------

{
  const harness = await startHarness({ failLaunch: true });
  const { status } = await postAgent(harness.base, {
    title: 'Doomed', provider: 'claude', cwd: '/tmp/project',
    missionId: 'mission_alpha', teamId: 'team_alpha',
  });
  assert.equal(status, 500);
  const blocks = durableAgents(harness.dir);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].status, 'failed', 'no silent orphan — the failure is recorded');
  assert.equal(blocks[0].failureReason, 'PTY launch refused');
  harness.close();
  rmSync(harness.dir, { recursive: true, force: true });
  console.log('mission spawn failure-record test passed');
}

// --- guards: half-specified mission spawn, bad refs --------------------------

{
  const harness = await startHarness();
  assert.equal((await postAgent(harness.base, { title: 'Half', cwd: '/tmp/p', missionId: 'mission_alpha' })).status, 400,
    'missionId without teamId is a 400');
  assert.equal((await postAgent(harness.base, { title: 'BadRef', cwd: '/tmp/p', missionId: 'mission_alpha', teamId: 'team_ghost' })).status, 400,
    'dangling team ref is a 400, not a spawn');
  assert.equal(harness.createdOptions.length, 0, 'no invalid spawn ever reached the runtime');
  // A plain spawn without mission context stays exactly as before.
  assert.equal((await postAgent(harness.base, { title: 'Plain', cwd: '/tmp/p' })).status, 201);
  assert.equal(durableAgents(harness.dir).length, 0, 'plain spawns write no durable record');
  harness.close();
  rmSync(harness.dir, { recursive: true, force: true });
  console.log('mission spawn guard tests passed');
}

console.log('mission spawn tests passed');
