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

function testPointsAgentAtOwnBackend(): void {
  delete process.env.NVK_COMMAND_URL;
  const environment = providerEnvironment('claude', 'sess', 3931);
  assert.equal(
    environment.NVK_COMMAND_URL,
    'http://127.0.0.1:3931',
    'agent tunnel points at this backend, not prod :3031',
  );
}

function testHonoursInheritedCommandUrl(): void {
  process.env.NVK_COMMAND_URL = 'http://127.0.0.1:9999';
  try {
    const environment = providerEnvironment('claude', 'sess', 3931);
    assert.equal(environment.NVK_COMMAND_URL, 'http://127.0.0.1:9999', 'explicit override wins');
  } finally {
    delete process.env.NVK_COMMAND_URL;
  }
}

testBindsBrowserSession();
testOmitsBrowserSessionWhenUnset();
testStillScrubsProviderSecrets();
testPointsAgentAtOwnBackend();
testHonoursInheritedCommandUrl();
console.log('PASS');
