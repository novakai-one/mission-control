import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnalyticsRunEvent } from '../../../shared/analytics/types.js';
import { AnalyticsRunner, type AnalyzeCommand } from './index.js';

function collectRunner(command: AnalyzeCommand, outBase: string): { runner: AnalyticsRunner; events: AnalyticsRunEvent[] } {
  const events: AnalyticsRunEvent[] = [];
  const runner = new AnalyticsRunner(
    (event) => events.push(event),
    tmpdir(),
    command,
    (repoPath) => join(outBase, repoPath.split('/').pop() ?? 'repo'),
  );
  return { runner, events };
}

function settled(events: AnalyticsRunEvent[]): Promise<void> {
  return new Promise((resolvePromise) => {
    const timer = setInterval(() => {
      if (events.some((event) => event.status !== 'running')) {
        clearInterval(timer);
        resolvePromise();
      }
    }, 20);
  });
}

const outBase = mkdtempSync(join(tmpdir(), 'analytics-runner-'));

// A successful run: 'running' emitted synchronously, 'completed' on exit 0,
// and the out dir was created before the analyzer spawned.
const okRun = collectRunner(() => ({ command: 'node', args: ['-e', 'process.exit(0)'] }), outBase);
const started = okRun.runner.start('/tmp/fake-repo');
assert.equal(started?.status, 'running');
assert.equal(okRun.runner.isRunning('/tmp/fake-repo'), true);
// One in-flight run per repo — a second start is refused, not queued.
assert.equal(okRun.runner.start('/tmp/fake-repo'), null);
await settled(okRun.events);
assert.deepEqual(okRun.events.map((event) => event.status), ['running', 'completed']);
assert.equal(okRun.runner.isRunning('/tmp/fake-repo'), false);
assert.equal(existsSync(join(outBase, 'fake-repo')), true);
assert.equal(typeof okRun.events[1].finishedAt, 'string');
assert.equal(okRun.events[1].error, undefined);

// A failing run surfaces the analyzer's stderr, never a silent success.
const badRun = collectRunner(
  () => ({ command: 'node', args: ['-e', 'console.error("boom"); process.exit(1)'] }),
  outBase,
);
badRun.runner.start('/tmp/fake-repo');
await settled(badRun.events);
assert.equal(badRun.events[1].status, 'failed');
assert.match(badRun.events[1].error ?? '', /boom/);

// A command that cannot spawn at all still resolves to a failed event.
const missing = collectRunner(() => ({ command: '/no/such/binary-xyz', args: [] }), outBase);
missing.runner.start('/tmp/fake-repo');
await settled(missing.events);
assert.equal(missing.events[1].status, 'failed');
assert.equal((missing.events[1].error ?? '').length > 0, true);
// The failed run is cleared, so a retry is allowed.
assert.equal(missing.runner.isRunning('/tmp/fake-repo'), false);

console.log('analytics runner: ok');
