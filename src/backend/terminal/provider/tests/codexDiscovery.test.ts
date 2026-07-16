import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexSessionLocator } from '../codexDiscovery.js';
import { providerArguments, providerEnvironment } from '../index.js';

assert.equal(providerEnvironment('codex').TERM, 'xterm-256color');
assert.deepEqual(providerArguments('codex', 'unused'), [
  '-c', 'check_for_update_on_startup=false', '--no-alt-screen',
]);

const root = mkdtempSync(path.join(tmpdir(), 'codex-discovery-'));
const locator = new CodexSessionLocator(root, 5, 300);
const known = locator.snapshot();
const startedAt = Date.now();
const dated = path.join(root, '2026', '07', '16');
mkdirSync(dated, { recursive: true });
writeFileSync(path.join(dated, 'rollout-other.jsonl'), JSON.stringify({
  payload: { type: 'session_meta', id: 'other', cwd: '/tmp/other' },
}));
writeFileSync(path.join(dated, 'rollout-target.jsonl'), JSON.stringify({
  payload: { type: 'session_meta', session_id: 'codex-target', cwd: '/tmp/project' },
}));

assert.equal(await locator.waitForNew('/tmp/project', known, startedAt), 'codex-target');
await assert.rejects(
  () => new CodexSessionLocator(root, 5, 20).waitForNew('/tmp/missing', locator.snapshot(), Date.now()),
  /saved session was not discovered/,
);
console.log('PASS');
