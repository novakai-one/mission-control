// SubagentWatcher regression test. Run with
// `npx tsx src/backend/transcript/subagents/watcher.test.ts`.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SubagentWatcher } from './index.js';

const root = mkdtempSync(path.join(tmpdir(), 'subagent-watcher-'));
const projectDir = 'proj1';
const sessionId = 'sess1';
const subagentsDir = path.join(root, projectDir, sessionId, 'subagents');

function agentLine(text: string): string {
  return JSON.stringify({
    type: 'user',
    uuid: `u-${text}`,
    sessionId,
    timestamp: '2026-07-10T00:00:00.000Z',
    message: { role: 'user', content: text },
  });
}

function writeAgent(subagentId: string, text: string): void {
  writeFileSync(path.join(subagentsDir, `${subagentId}.meta.json`), JSON.stringify({
    agentType: 'explore', description: `desc-${subagentId}`, toolUseId: `tool-${subagentId}`, spawnDepth: 1,
  }));
  writeFileSync(path.join(subagentsDir, `${subagentId}.jsonl`), agentLine(text) + '\n');
}

async function waitUntil(check: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(check(), 'condition not met before timeout');
}

async function assertFirstAgentDiscovered(messages: any[]): Promise<void> {
  mkdirSync(subagentsDir, { recursive: true });
  writeAgent('agent-aaa111', 'hello-from-aaa');

  await waitUntil(() => messages.some((message) => message.type === 'subagents-changed'), 3000);
  await waitUntil(() => messages.some((message) => message.type === 'subagent-event'), 3000);

  const changed = messages.find((message) => message.type === 'subagents-changed');
  assert.equal(changed.subagents.length, 1);
  assert.equal(changed.subagents[0].subagentId, 'agent-aaa111');
  assert.equal(changed.subagents[0].agentType, 'explore');

  const tailed = messages.find((message) => message.type === 'subagent-event');
  assert.equal(tailed.subagentId, 'agent-aaa111');
  assert.equal(tailed.event.text, 'hello-from-aaa');
}

async function assertSecondAgentDiscovered(messages: any[]): Promise<void> {
  writeAgent('agent-bbb222', 'hello-from-bbb');
  await waitUntil(() => {
    const latest = [...messages].reverse().find((message) => message.type === 'subagents-changed');
    return latest?.subagents.length === 2;
  }, 3000);
}

async function main() {
  const messages: any[] = [];
  const watcher = new SubagentWatcher(projectDir, sessionId, (message) => messages.push(message), root);
  watcher.start();

  // Dir doesn't exist yet — watcher must tolerate ENOENT, not throw.
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(messages.length, 0, 'no emissions before subagents/ exists');

  await assertFirstAgentDiscovered(messages);
  await assertSecondAgentDiscovered(messages);

  watcher.stop();
  console.log('PASS');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
