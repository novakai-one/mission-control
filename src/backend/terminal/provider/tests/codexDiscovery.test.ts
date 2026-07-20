import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexSessionLocator } from '../codexDiscovery.js';
import { launchProvider, providerArguments, providerEnvironment } from '../index.js';

assert.equal(providerEnvironment('codex').TERM, 'xterm-256color');
assert.deepEqual(providerArguments('codex', 'unused'), [
  '-c', 'check_for_update_on_startup=false', '--no-alt-screen',
]);

const root = mkdtempSync(path.join(tmpdir(), 'codex-discovery-'));
const locator = new CodexSessionLocator(root, 5, 300);
const known = locator.snapshot();
// Margin against coarse fs mtime granularity: on CI filesystems a just-written
// file can stamp BEFORE Date.now(), and the mtime>=startedAt filter would then
// exclude it (flake). The `known` snapshot is what excludes old files, not the clock.
const startedAt = Date.now() - 5000;
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

// cancel() must promptly reject a pending waitForNew with the given reason.
const cancellable = new CodexSessionLocator(root, 5, 60_000);
const pendingWait = cancellable.waitForNew('/tmp/never', cancellable.snapshot(), Date.now());
cancellable.cancel('codex exited (code 1) before its session was discovered');
await assert.rejects(pendingWait, /exited \(code 1\)/);

// A provider whose CLI cannot be resolved must fail the launch loudly
// instead of spawning a PTY that dies silently.
{
  const emptyCwd = mkdtempSync(path.join(tmpdir(), 'codex-no-cli-'));
  const previousPath = process.env.PATH;
  const previousCwd = process.cwd();
  process.chdir(emptyCwd);
  process.env.PATH = emptyCwd;
  try {
    assert.throws(() => launchProvider('codex', '/tmp/project', 'unused'), /codex CLI not found/);
  } finally {
    process.env.PATH = previousPath;
    process.chdir(previousCwd);
  }
}
console.log('PASS');
