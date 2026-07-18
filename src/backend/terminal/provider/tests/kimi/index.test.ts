// KimiSessionLocator tests (messaging rework task 5), mirroring
// ../codexDiscovery.test.ts. Run with
// `npx tsx src/backend/terminal/provider/tests/kimi/index.test.ts`.
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KimiSessionLocator } from '../../kimi/index.js';
import { providerArguments, providerEnvironment } from '../../index.js';

assert.deepEqual(providerArguments('kimi', 'unused'), [], 'kimi launches its interactive TUI with no args');

{
  process.env.KIMI_API_KEY = 'secret';
  try {
    const environment = providerEnvironment('kimi');
    assert.equal(environment.KIMI_API_KEY, undefined, 'KIMI_* vars are scrubbed for kimi agents');
    assert.equal(environment.TERM, 'xterm-256color');
  } finally {
    delete process.env.KIMI_API_KEY;
  }
}

function indexEntry(sessionId: string, workDir: string): string {
  return JSON.stringify({ sessionId, sessionDir: `/sessions/${sessionId}`, workDir });
}

const root = mkdtempSync(path.join(tmpdir(), 'kimi-discovery-'));
const indexPath = path.join(root, 'session_index.jsonl');
writeFileSync(indexPath, `${indexEntry('session_known', '/tmp/project')}\n`);

const locator = new KimiSessionLocator(indexPath, 5, 300);
const known = locator.snapshot();
assert.ok(known.has('session_known'));

// A torn line never blocks discovery of the real entry.
appendFileSync(indexPath, '{ not json\n');
appendFileSync(indexPath, `${indexEntry('session_other', '/tmp/other')}\n`);
appendFileSync(indexPath, `${indexEntry('session_target', '/tmp/project')}\n`);
assert.equal(await locator.waitForNew('/tmp/project', known), 'session_target',
  'the new index line whose workDir matches the spawn cwd wins');

await assert.rejects(
  () => new KimiSessionLocator(indexPath, 5, 20).waitForNew('/tmp/missing', locator.snapshot()),
  /session was not discovered/,
  'a missing index entry fails the spawn loudly instead of hanging',
);

// cancel() must promptly reject a pending waitForNew with the given reason.
const cancellable = new KimiSessionLocator(indexPath, 5, 60_000);
const pendingWait = cancellable.waitForNew('/tmp/never', cancellable.snapshot());
cancellable.cancel('kimi exited (code 1) before its session was discovered');
await assert.rejects(pendingWait, /exited \(code 1\)/);

console.log('PASS');
