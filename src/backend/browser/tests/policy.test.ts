// Pure allocation-decision tests. Run with
// `npx tsx src/backend/browser/tests/policy.test.ts`.
import assert from 'node:assert/strict';
import { decideAllocation } from '../policy.js';
import type { Session } from '../types.js';

const NOW = new Date('2026-07-17T00:00:10.000Z');

function makeSession(over: Partial<Session> = {}): Session {
  return {
    sessionId: 's1',
    agentId: 'a1',
    instance: { pid: 111, port: 9300, userDataDir: '/tmp/x', cdpEndpoint: 'http://127.0.0.1:9300' },
    status: 'active',
    leaseExpiresAt: '2026-07-17T00:00:20.000Z',
    ...over,
  };
}

function testNoSessionLaunches(): void {
  assert.equal(decideAllocation(undefined, false, NOW).kind, 'launch');
}

function testHealthySessionReuses(): void {
  const decision = decideAllocation(makeSession(), true, NOW);
  assert.equal(decision.kind, 'reuse');
  assert.equal(decision.session?.sessionId, 's1');
}

function testExpiredLaunches(): void {
  assert.equal(decideAllocation(makeSession({ leaseExpiresAt: '2026-07-17T00:00:05.000Z' }), true, NOW).kind, 'launch');
}

function testDeadInstanceLaunches(): void {
  assert.equal(decideAllocation(makeSession(), false, NOW).kind, 'launch');
}

function testReleasedLaunches(): void {
  assert.equal(decideAllocation(makeSession({ status: 'released' }), true, NOW).kind, 'launch');
}

testNoSessionLaunches();
testHealthySessionReuses();
testExpiredLaunches();
testDeadInstanceLaunches();
testReleasedLaunches();
console.log('PASS');
