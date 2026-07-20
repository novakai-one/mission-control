// stale-host decision tests. Run with
// `npx tsx src/backend/terminal/host/launch/launch.test.ts`.
import assert from 'node:assert/strict';
import { staleHostAction } from './index.js';

assert.equal(staleHostAction('abc123', 'abc123', 0), 'ok', 'same snapshot is fine');
assert.equal(staleHostAction('abc123', 'abc123', 5), 'ok', 'same snapshot is fine even with a fleet');
assert.equal(staleHostAction('old999', 'abc123', 0), 'restart', 'stale + empty fleet restarts');
assert.equal(staleHostAction('old999', 'abc123', 3), 'warn', 'stale + live agents warns, never kills PTYs');
assert.equal(staleHostAction(null, 'abc123', 0), 'restart', 'pre-handshake host counts as stale');
assert.equal(staleHostAction(null, 'abc123', 1), 'warn', 'pre-handshake host with a fleet warns');

console.log('PASS');
