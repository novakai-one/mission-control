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

const STAMP = '2026-07-22T10:00:00+10:00';

function scratchStores(): string {
  // C1: NO pre-created store files — ObjectModel provisions them at
  // composition; only the seed records are written here.
  const storesDir = mkdtempSync(path.join(tmpdir(), 'nvk-spawn-'));
  writeFileSync(path.join(storesDir, 'missions.jsonl'),
    JSON.stringify({ id: 'mission_alpha', kind: 'mission', 'ts': STAMP, title: 'Alpha', owner: 'chief' }) + '\n');
  writeFileSync(path.join(storesDir, 'teams.jsonl'),
    JSON.stringify({ id: 'team_alpha', kind: 'team', 'ts': STAMP, name: 'Alpha Crew', refs: [{ kind: 'mission', value: 'mission_alpha' }] }) + '\n');
  return storesDir;
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
  storesDir: string;
  createdOptions: CreateAgentOptions[];
  recordExistedAtLaunch: boolean[];
  fireSession: (info: AgentInfo) => void;
  close: () => void;
}

interface FakeTerminalsState {
  createdOptions: CreateAgentOptions[];
  recordExistedAtLaunch: boolean[];
  fireSession: (info: AgentInfo) => void;
}

function makeTerminals(model: ObjectModel, failLaunch: boolean, state: FakeTerminalsState): TerminalRuntime {
  return {
    create: (options: CreateAgentOptions) => {
      state.createdOptions.push(options);
      // The S4 ordering proof: at the moment the runtime is asked to launch,
      // the durable record must already exist.
      state.recordExistedAtLaunch.push(Boolean(options.agentId && model.agentRecord(options.agentId)));
      if (failLaunch) return Promise.reject(new Error('PTY launch refused'));
      return Promise.resolve(agentInfo({
        agentId: options.agentId ?? `agent_fake_${state.createdOptions.length}`,
        title: options.title ?? 'agent',
        provider: options.provider ?? 'claude',
        cwd: options.cwd,
      }));
    },
    write: () => true, submit: () => true, resize: () => true, rename: () => true, kill: () => true, archive: () => true,
    snapshot: () => '', list: () => [],
    onData: () => {}, onExit: () => {},
    onSession: (callback) => { state.fireSession = callback; },
  };
}

async function listen(application: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const listening = application.listen(0, '127.0.0.1', () => resolve(listening));
  });
}

async function startHarness({ failLaunch = false } = {}): Promise<Harness> {
  const storesDir = scratchStores();
  const model = new ObjectModel({ storesDir: storesDir });
  const state: FakeTerminalsState = { createdOptions: [], recordExistedAtLaunch: [], fireSession: () => {} };
  const agentsHub = new AgentsHub(new Set(), makeTerminals(model, failLaunch, state), undefined, model);
  const application = express();
  application.use(express.json());
  agentsHub.registerRoutes(application);
  const server = await listen(application);
  return {
    base: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    storesDir,
    createdOptions: state.createdOptions,
    recordExistedAtLaunch: state.recordExistedAtLaunch,
    fireSession: (info) => state.fireSession(info),
    close: () => server.close(),
  };
}

async function postAgent(base: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${base}/api/agents`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}

function durableAgents(storesDir: string): Array<Record<string, unknown>> {
  return readStoreDir(storesDir).files['agents.jsonl'].records.map((record) => record.block);
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

  const blocks = durableAgents(harness.storesDir);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, runtimeId, 'durable id IS the runtime id — one mint, no fork');
  assert.equal(blocks[0].status, 'spawning');
  assert.deepEqual(harness.recordExistedAtLaunch, [true], 'record persisted BEFORE the runtime launch');

  harness.fireSession(agentInfo({ agentId: runtimeId, sessionId: 'session-abc' }));
  const attached = durableAgents(harness.storesDir)[0];
  assert.equal(attached.sessionId, 'session-abc');
  assert.equal(attached.status, 'live');

  // Replayed callback (host restart re-emits) stays a no-op.
  harness.fireSession(agentInfo({ agentId: runtimeId, sessionId: 'session-abc' }));
  assert.equal(durableAgents(harness.storesDir).length, 1);

  const identity = await fetch(`${harness.base}/api/agents/${runtimeId}/identity`);
  assert.equal(identity.status, 200);
  const identityBody = await identity.json() as { durable: Record<string, unknown> | null };
  assert.equal(identityBody.durable?.sessionId, 'session-abc', 'projection serves the durable record');

  harness.close();
  rmSync(harness.storesDir, { recursive: true, force: true });
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
  const blocks = durableAgents(harness.storesDir);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].status, 'failed', 'no silent orphan — the failure is recorded');
  assert.equal(blocks[0].failureReason, 'PTY launch refused');
  harness.close();
  rmSync(harness.storesDir, { recursive: true, force: true });
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
  assert.equal(durableAgents(harness.storesDir).length, 0, 'plain spawns write no durable record');
  harness.close();
  rmSync(harness.storesDir, { recursive: true, force: true });
  console.log('mission spawn guard tests passed');
}

console.log('mission spawn tests passed');
