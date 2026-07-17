import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { TerminalHostClient } from '../../client/index.js';
import { createTerminalRuntime, terminalSocketPath } from '../../launch/index.js';

async function eventually(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('condition did not become true');
}

// eslint-disable-next-line max-lines-per-function
async function testScratchOverrideStartsIsolatedHost(): Promise<void> {
  const workspace = process.cwd();
  const port = String(49_000 + process.pid % 500);
  const socketPath = terminalSocketPath(workspace, port);
  const priorPort = process.env.NOVAKAI_SERVER_PORT;
  const priorRuntime = process.env.NOVAKAI_TERMINAL_RUNTIME;
  process.env.NOVAKAI_SERVER_PORT = port;
  process.env.NOVAKAI_TERMINAL_RUNTIME = 'host';
  let hostPid: number | null = null;
  try {
    const runtime = await createTerminalRuntime(workspace);
    assert.ok(runtime instanceof TerminalHostClient);
    hostPid = runtime.hostPid();
    assert.ok(hostPid && hostPid !== process.pid);
    assert.equal(statSync(socketPath).mode & 0o777, 0o600);
    runtime.disconnect();
  } finally {
    if (hostPid) process.kill(hostPid, 'SIGTERM');
    if (priorPort === undefined) delete process.env.NOVAKAI_SERVER_PORT;
    else process.env.NOVAKAI_SERVER_PORT = priorPort;
    if (priorRuntime === undefined) delete process.env.NOVAKAI_TERMINAL_RUNTIME;
    else process.env.NOVAKAI_TERMINAL_RUNTIME = priorRuntime;
  }
  await eventually(() => !existsSync(socketPath));
}

await testScratchOverrideStartsIsolatedHost();
console.log('PASS');
