// liveness tests — process truth and activity proof against fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activityProof, checkProcess, latestUseful } from './liveness.mjs';

// --- checkProcess -----------------------------------------------------------
const fakePs = (command) => () => command;

const mine = checkProcess(
  { provider: 'kimi', terminalPid: process.pid },
  { ps: fakePs('node /Users/x/.kimi-code/bin/kimi') },
);
assert.equal(mine.alive, true);
assert.equal(mine.providerMatch, true);

const miscast = checkProcess(
  { provider: 'kimi', terminalPid: process.pid },
  { ps: fakePs('node /Users/x/.nvm/bin/codex -c check_for_update_on_startup=false') },
);
assert.equal(miscast.alive, true);
assert.equal(miscast.providerMatch, false, 'kimi request running codex must mismatch');

const dead = checkProcess({ provider: 'claude', terminalPid: 999999 }, { ps: fakePs('claude') });
assert.equal(dead.alive, false);
assert.equal(dead.providerMatch, false);

const noPid = checkProcess({ provider: 'kimi', terminalPid: null });
assert.equal(noPid.alive, false);

// --- activityProof + latestUseful -------------------------------------------
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nvk-live-home-'));
const sessionDir = path.join(home, '.kimi-code', 'sessions', 'wd_x', 'session_l');
fs.mkdirSync(path.join(sessionDir, 'agents', 'main'), { recursive: true });
const wire = path.join(sessionDir, 'agents', 'main', 'wire.jsonl');
fs.writeFileSync(wire, [
  JSON.stringify({ type: 'turn.prompt', input: [{ type: 'text', text: 'do the thing' }], time: 1000 }),
  JSON.stringify({ type: 'context.append_loop_event', event: { type: 'content.part', part: { type: 'text', text: 'thing done' } }, time: 2000 }),
  '',
].join('\n'));
fs.writeFileSync(
  path.join(home, '.kimi-code', 'session_index.jsonl'),
  `${JSON.stringify({ sessionId: 'session_l', sessionDir, workDir: '/x' })}\n`,
);

const agent = { provider: 'kimi', sessionId: 'session_l' };
const activity = activityProof(agent, { home, now: 3000 });
assert.equal(activity.transcript, wire);
assert.equal(activity.events, 2);
assert.equal(activity.userTurns, 1);
assert.equal(activity.lastEventAgeMs, 1000);

const latest = latestUseful(agent, { home });
assert.equal(latest.text, 'thing done');

const silent = activityProof({ provider: 'kimi', sessionId: 'session_nope' }, { home });
assert.equal(silent.transcript, null);
assert.equal(silent.events, 0);

const empty = latestUseful({ provider: 'kimi', sessionId: 'session_nope' }, { home });
assert.equal(empty.text, null);

console.log('liveness tests passed');
