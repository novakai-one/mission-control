import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTerminalRuntime } from '../../launch/index.js';

function registryAgent(agentId: string) {
  return [{
    agentId,
    title: agentId,
    provider: 'claude',
    sessionId: `session-${agentId}`,
    projectDir: 'project',
    cwd: '/tmp/project',
    status: 'running',
    createdAt: new Date().toISOString(),
  }];
}

// eslint-disable-next-line max-lines-per-function
async function testScratchPortsNeverShareProductionRegistry(): Promise<void> {
  const workspace = mkdtempSync(path.join(tmpdir(), 'host-isolation-'));
  const stateDir = path.join(workspace, '.novakai-command');
  mkdirSync(stateDir);
  writeFileSync(path.join(stateDir, 'agents.json'), JSON.stringify(registryAgent('production')));
  writeFileSync(path.join(stateDir, 'agents-4101.json'), JSON.stringify(registryAgent('scratch-one')));
  writeFileSync(path.join(stateDir, 'agents-4102.json'), JSON.stringify(registryAgent('scratch-two')));

  const originalPort = process.env.NOVAKAI_SERVER_PORT;
  try {
    process.env.NOVAKAI_SERVER_PORT = '4101';
    const first = await createTerminalRuntime(workspace);
    process.env.NOVAKAI_SERVER_PORT = '4102';
    const second = await createTerminalRuntime(workspace);
    assert.deepEqual(first.list().map(({ agentId }) => agentId), ['scratch-one']);
    assert.deepEqual(second.list().map(({ agentId }) => agentId), ['scratch-two']);
    assert.ok(!first.list().some(({ agentId }) => agentId === 'production'));
  } finally {
    if (originalPort === undefined) delete process.env.NOVAKAI_SERVER_PORT;
    else process.env.NOVAKAI_SERVER_PORT = originalPort;
  }
}

await testScratchPortsNeverShareProductionRegistry();
console.log('PASS');
