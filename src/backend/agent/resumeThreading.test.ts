// Standalone test: run with `npx tsx src/backend/agent/resumeThreading.test.ts`
import assert from 'node:assert/strict';
import { AgentCoordinator } from './index.js';

let captured: string | undefined = 'UNSET';

const stubExecutor: any = {
  runClaudeCode: async (_agentId: string, _prompt: string, options: any) => {
    captured = options.resumeSessionId;
  },
  runGeminiApi: async () => {},
  stopProcess: async () => true
};

const stubStateManager: any = {
  saveBuild: () => {},
  createGitCommit: async () => undefined
};

async function main() {
  const coordinator = new AgentCoordinator(stubExecutor, stubStateManager);
  coordinator.setBroadcastHandler(() => {});

  await coordinator.startBuild('hi', 'claude', undefined, 'sess-xyz');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(captured, 'sess-xyz', 'expected resumeSessionId to be threaded through');

  captured = 'UNSET';
  // startBuild refuses a second concurrent build; wait for the first to settle (it already did above).
  await coordinator.startBuild('hi', 'claude');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(captured, undefined, 'expected resumeSessionId to be undefined when not passed');

  console.log('PASS');
}

main();
