// Pure lease-math tests. Run with
// `npx tsx src/backend/browser/tests/lease.test.ts`.
import assert from 'node:assert/strict';
import { isLeaseExpired, leaseExpiresAt } from '../lease.js';

function testExpiresAtIsNowPlusTtl(): void {
  const now = new Date('2026-07-17T00:00:00.000Z');
  assert.equal(leaseExpiresAt(now, 1000), '2026-07-17T00:00:01.000Z');
}

function testExpiredWhenDeadlinePassed(): void {
  const now = new Date('2026-07-17T00:00:10.000Z');
  assert.equal(isLeaseExpired({ leaseExpiresAt: '2026-07-17T00:00:10.000Z' }, now), true, 'equal instant counts as expired');
  assert.equal(isLeaseExpired({ leaseExpiresAt: '2026-07-17T00:00:05.000Z' }, now), true, 'past deadline expired');
}

function testNotExpiredWhenAhead(): void {
  const now = new Date('2026-07-17T00:00:10.000Z');
  assert.equal(isLeaseExpired({ leaseExpiresAt: '2026-07-17T00:00:20.000Z' }, now), false);
}

testExpiresAtIsNowPlusTtl();
testExpiredWhenDeadlinePassed();
testNotExpiredWhenAhead();
console.log('PASS');
