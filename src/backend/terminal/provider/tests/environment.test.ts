// providerEnvironment tests. Run with
// `npx tsx src/backend/terminal/provider/tests/environment.test.ts`.
import assert from 'node:assert/strict';
import { providerEnvironment } from '../index.js';

function testBindsBrowserSession(): void {
  const environment = providerEnvironment('claude', 'agent-session-123');
  assert.equal(environment.NVK_SESSION, 'agent-session-123', 'each agent gets its own browser session id');
}

function testOmitsBrowserSessionWhenUnset(): void {
  const environment = providerEnvironment('claude');
  assert.equal(environment.NVK_SESSION, undefined, 'no browser binding when none is requested');
}

function testStillScrubsProviderSecrets(): void {
  const environment = providerEnvironment('claude', 'sess');
  const leaked = Object.keys(environment).filter((envKey) => /^CLAUDE|^ANTHROPIC/.test(envKey));
  assert.deepEqual(leaked, [], 'provider secrets remain scrubbed');
}

testBindsBrowserSession();
testOmitsBrowserSessionWhenUnset();
testStillScrubsProviderSecrets();
console.log('PASS');
