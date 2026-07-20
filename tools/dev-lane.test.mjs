// Ownership predicate tests for the dev-lane predev hook. Run with
// `npx tsx tools/dev-lane.test.mjs`.
import assert from 'node:assert/strict';
import { ownsDevLane } from './dev-lane.mjs';

const workspace = '/tmp/lanes-ws';

assert.equal(
  ownsDevLane({ pid: 1, command: 'node /tmp/lanes-ws/node_modules/.bin/tsx watch src/backend/index.ts', cwd: '/tmp/lanes-ws' }, workspace),
  true,
  'own tsx-watch dev backend is reclaimable',
);
assert.equal(
  ownsDevLane({ pid: 2, command: 'node /tmp/lanes-ws/node_modules/.bin/vite --host', cwd: '/tmp/lanes-ws' }, workspace),
  true,
  'own vite dev frontend is reclaimable',
);
assert.equal(
  ownsDevLane({ pid: 3, command: 'node /other/node_modules/.bin/tsx watch src/backend/index.ts', cwd: '/other/checkout' }, workspace),
  false,
  'a dev backend from another worktree is NEVER killed (audit S1)',
);
assert.equal(
  ownsDevLane({ pid: 4, command: 'python3 -m http.server 3131', cwd: '/tmp/lanes-ws' }, workspace),
  false,
  'a non-lane command is never killed, even from our own cwd',
);
assert.equal(
  ownsDevLane(null, workspace),
  false,
  'a vanished/unreadable process is never killed',
);
assert.equal(
  ownsDevLane({ pid: 5, command: 'node /tmp/lanes-ws/node_modules/.bin/tsx watch src/backend/index.ts', cwd: '' }, workspace),
  false,
  'missing cwd means unproven ownership — never killed',
);

console.log('PASS');
