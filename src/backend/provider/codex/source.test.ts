import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexSessionSource } from './source.js';

const sessionId = '019f-codex-session';
const root = mkdtempSync(path.join(tmpdir(), 'codex-source-'));
const dated = path.join(root, '2026', '07', '16');
mkdirSync(dated, { recursive: true });
writeFileSync(path.join(dated, `rollout-2026-07-16-${sessionId}.jsonl`), [
  JSON.stringify({
    timestamp: '2026-07-16T00:00:00.000Z', type: 'session_meta',
    payload: { type: 'session_meta', id: sessionId, cwd: '/tmp/novakai' },
  }),
  JSON.stringify({
    timestamp: '2026-07-16T00:00:01.000Z', type: 'event_msg',
    payload: { type: 'user_message', message: 'Build the provider seam' },
  }),
  JSON.stringify({
    timestamp: '2026-07-16T00:00:02.000Z', type: 'event_msg',
    payload: { type: 'agent_message', message: 'Starting now', phase: 'commentary' },
  }),
].join('\n'));

const source = new CodexSessionSource(root, path.join(root, 'archived'));
const snapshot = source.read({ provider: 'codex', sessionId });
assert.deepEqual(snapshot.events.map((event) => event.kind), ['user', 'assistant']);
assert.equal(snapshot.events[1]?.text, 'Starting now');
assert.throws(
  () => source.read({ provider: 'codex', sessionId: 'missing' }),
  /codex session not found/,
);
console.log('PASS');
