import assert from 'node:assert/strict';
import type { AgentInfo } from '../../../lib/agentSocket/index.js';
import { reconcileAgents } from './index.js';

function agent(agentId: string, title: string): AgentInfo {
  return {
    agentId,
    title,
    provider: 'claude',
    sessionId: `session-${agentId}`,
    projectDir: 'project',
    cwd: '/tmp/project',
    status: 'running',
    createdAt: '2026-07-17T00:00:00.000Z',
  };
}

const first = [agent('a', 'Alpha'), agent('b', 'Beta')];
const identical = first.map((entry) => ({ ...entry }));
assert.equal(reconcileAgents(first, identical), first, 'unchanged roster should preserve the array');

const changed = identical.map((entry) => entry.agentId === 'b' ? { ...entry, title: 'Beta 2' } : entry);
const reconciled = reconcileAgents(first, changed);
assert.equal(reconciled[0], first[0], 'unchanged agents should preserve object identity');
assert.notEqual(reconciled[1], first[1], 'changed agents should use the new object');

console.log('PASS');
