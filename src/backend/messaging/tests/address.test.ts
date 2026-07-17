// Addressing + spawn-briefing unit tests (agent-messaging §5, phase 5). Run
// with `npx tsx src/backend/messaging/tests/address.test.ts`.
import assert from 'node:assert/strict';
import { rosterFromAgents, nextSpawnName, isNameTaken } from '../address/index.js';
import { composeSpawnBriefing } from '../address/briefing.js';
import type { AgentInfo } from '../../terminal/manager.js';

function agent(overrides: Partial<AgentInfo>): AgentInfo {
  return {
    agentId: 'agent_x', title: 'claude-1', provider: 'claude', sessionId: 'session',
    projectDir: 'project', cwd: '/tmp/project', status: 'running', createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function testRosterOnlyRunningAgents(): void {
  const roster = rosterFromAgents([
    agent({ agentId: 'agent_1', title: 'claude-1' }),
    agent({ agentId: 'agent_2', title: 'codex-1', provider: 'codex' }),
    agent({ agentId: 'agent_3', title: 'claude-2', status: 'exited' }),
  ]);
  assert.deepEqual(roster, [
    { agentId: 'agent_1', name: 'claude-1', provider: 'claude' },
    { agentId: 'agent_2', name: 'codex-1', provider: 'codex' },
  ], 'exited agents are not addressable');
}

function testSpawnNamesAreProviderOrdinals(): void {
  assert.equal(nextSpawnName('claude', []), 'claude-1');
  assert.equal(nextSpawnName('claude', ['claude-1', 'codex-1']), 'claude-2');
  assert.equal(nextSpawnName('codex', ['claude-1', 'codex-1', 'codex-2']), 'codex-3');
  assert.equal(nextSpawnName('claude', ['claude-2']), 'claude-1', 'fills the first gap');
}

function testNameUniqueness(): void {
  const agents = [agent({ agentId: 'agent_1', title: 'claude-1' })];
  assert.equal(isNameTaken('claude-1', agents), true);
  assert.equal(isNameTaken('claude-2', agents), false);
  assert.equal(isNameTaken('claude-1', agents, 'agent_1'), false, 'renaming to your own name is fine');
}

function testBriefingNamesProtocolAndEtiquette(): void {
  const briefing = composeSpawnBriefing('claude-2', [
    { agentId: 'agent_2', name: 'codex-1', provider: 'codex' },
  ], 3031);
  assert.match(briefing, /You are agent "claude-2"/, 'briefing states the agent name');
  assert.match(briefing, /codex-1 \(codex\)/, 'briefing lists the live roster');
  assert.match(briefing, /nvk-msg\.mjs send --from claude-2/, 'briefing teaches the send protocol');
  assert.match(briefing, /check #team at natural pauses/, 'briefing teaches channel etiquette');
  assert.match(briefing, /nvk-live\.mjs room create/, 'briefing teaches room verbs');
  assert.match(briefing, /nvk-live\.mjs send --to room_/, 'briefing teaches room replies');
  assert.match(briefing, /127\.0\.0\.1:3031\/api\/messages/, 'briefing documents the curl fallback');
  assert.ok(!briefing.includes('\n'), 'briefing is one PTY submission — no raw newlines');
  const empty = composeSpawnBriefing('claude-1', [], 3031);
  assert.match(empty, /none yet/);
}

testRosterOnlyRunningAgents();
testSpawnNamesAreProviderOrdinals();
testNameUniqueness();
testBriefingNamesProtocolAndEtiquette();
console.log('PASS');
