// Health-derivation seam tests (mission_agent-stall-detection). Pure clock-
// injected derivation: no timers, no PTYs. Run with
// `npx tsx src/backend/terminal/health/health.test.ts`.
import assert from 'node:assert/strict';
import { deriveHealth, thresholdsFromEnv, RULED_THRESHOLDS } from './index.js';

const T = { quietMs: 5 * 60_000, stalledMs: 15 * 60_000 };
const NOW = 1_700_000_000_000;
const act = (ageMs: number) => ({ lastOutputAtMs: NOW - ageMs, trackedSinceMs: NOW - 60 * 60_000 });

// --- state derivation from last-output age ----------------------------------

assert.equal(deriveHealth('running', act(1_000), NOW, T)?.state, 'ok', 'recent output → ok');
assert.equal(deriveHealth('running', act(T.quietMs - 1), NOW, T)?.state, 'ok', 'just under quiet → ok');
assert.equal(deriveHealth('running', act(T.quietMs), NOW, T)?.state, 'quiet', 'age = quiet threshold → quiet');
assert.equal(deriveHealth('running', act(T.stalledMs - 1), NOW, T)?.state, 'quiet', 'just under stalled → quiet');
assert.equal(deriveHealth('running', act(T.stalledMs), NOW, T)?.state, 'stalled', 'age = stalled threshold → stalled');
assert.equal(deriveHealth('exited', act(T.stalledMs * 2), NOW, T), null, 'exited agents have no health');
assert.equal(deriveHealth('running', null, NOW, T), null, 'no activity record → no health');

// --- trackedSince fallback when no output was ever observed ------------------

const noOutput = deriveHealth('running', { lastOutputAtMs: null, trackedSinceMs: NOW - T.stalledMs }, NOW, T);
assert.equal(noOutput?.state, 'stalled', 'no output ever → age from trackedSince');
assert.equal(noOutput?.lastOutputAt, null, 'lastOutputAt stays null when never observed');

// --- reported fields ---------------------------------------------------------

const quiet = deriveHealth('running', act(T.quietMs), NOW, T);
assert.equal(quiet?.silentForMs, T.quietMs, 'silentForMs is the age');
assert.equal(quiet?.lastOutputAt, new Date(NOW - T.quietMs).toISOString(), 'lastOutputAt is ISO of the stamp');
const skewed = deriveHealth('running', { lastOutputAtMs: NOW + 5_000, trackedSinceMs: NOW }, NOW, T);
assert.equal(skewed?.silentForMs, 0, 'clock skew clamps to zero, never negative');

// --- ruled thresholds + rig-only env overrides -------------------------------

assert.deepEqual(RULED_THRESHOLDS, T, 'ruled thresholds are 5min quiet / 15min stalled');
assert.deepEqual(thresholdsFromEnv({}), RULED_THRESHOLDS, 'no env → ruled defaults');
assert.deepEqual(
  thresholdsFromEnv({ NVK_STALL_QUIET_MS: '10000', NVK_STALL_STALLED_MS: '30000' }),
  { quietMs: 10_000, stalledMs: 30_000 },
  'env overrides for rig drills',
);
assert.deepEqual(
  thresholdsFromEnv({ NVK_STALL_QUIET_MS: 'garbage', NVK_STALL_STALLED_MS: '-5' }),
  RULED_THRESHOLDS,
  'invalid env values fall back to ruled defaults',
);

console.log('PASS');
