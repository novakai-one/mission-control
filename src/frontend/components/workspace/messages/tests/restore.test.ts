// D3 restore state machine (ruling S7): remembered id retained while sources
// hydrate; fallback only after feed + rooms + roster ALL settle; fallback is
// never a saved preference (the caller never persists it — asserted by kind).
// Run with `npx tsx src/frontend/components/workspace/messages/tests/restore.test.ts`.
import assert from 'node:assert/strict';
import { restoreDecision } from '../model.js';

const loading = { feedLoaded: false, roomsLoaded: false, agentsLoaded: false };
const settled = { feedLoaded: true, roomsLoaded: true, agentsLoaded: true };

// Already selected → nothing to do, ever.
assert.deepEqual(
  restoreDecision({ selectedId: '#team', remembered: 'room_x', conversationIds: ['#team'], ...settled }),
  { kind: 'none' },
);

// Remembered room not yet hydrated → WAIT (the old bug fell back here).
assert.deepEqual(
  restoreDecision({ selectedId: null, remembered: 'room_x', conversationIds: ['#team'], ...loading }),
  { kind: 'wait' },
);

// Rooms arrive → restore the remembered room.
assert.deepEqual(
  restoreDecision({ selectedId: null, remembered: 'room_x', conversationIds: ['#team', 'room_x'], feedLoaded: false, roomsLoaded: true, agentsLoaded: false }),
  { kind: 'restore', id: 'room_x' },
);

// Historical DM: appears once the feed hydrates.
assert.deepEqual(
  restoreDecision({ selectedId: null, remembered: 'dm:codex-1', conversationIds: ['#team', 'dm:codex-1'], feedLoaded: true, roomsLoaded: false, agentsLoaded: false }),
  { kind: 'restore', id: 'dm:codex-1' },
);

// Live DM with no history: appears only when the ROSTER hydrates — the exact
// race the audit named. Partial readiness without the lane still waits…
assert.deepEqual(
  restoreDecision({ selectedId: null, remembered: 'dm:worker-1', conversationIds: ['#team'], feedLoaded: true, roomsLoaded: true, agentsLoaded: false }),
  { kind: 'wait' },
);
// …and the lane restoring once the roster lands.
assert.deepEqual(
  restoreDecision({ selectedId: null, remembered: 'dm:worker-1', conversationIds: ['#team', 'dm:worker-1'], ...settled }),
  { kind: 'restore', id: 'dm:worker-1' },
);

// All sources settled and the remembered lane truly gone → honest fallback.
assert.deepEqual(
  restoreDecision({ selectedId: null, remembered: 'room_deleted', conversationIds: ['#team'], ...settled }),
  { kind: 'fallback', id: '#team' },
);

// Nothing remembered: fallback still waits for full hydration (no flicker).
assert.deepEqual(
  restoreDecision({ selectedId: null, remembered: null, conversationIds: ['#team'], ...loading }),
  { kind: 'wait' },
);
assert.deepEqual(
  restoreDecision({ selectedId: null, remembered: null, conversationIds: ['#team'], ...settled }),
  { kind: 'fallback', id: '#team' },
);

// Settled but zero lanes yet → keep waiting rather than selecting nothing.
assert.deepEqual(
  restoreDecision({ selectedId: null, remembered: null, conversationIds: [], ...settled }),
  { kind: 'wait' },
);

console.log('restore.test.ts: all assertions passed');
