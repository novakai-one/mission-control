import assert from 'node:assert/strict';
import { parseProjectRecord } from './schema.js';

const VALID_PROJECT = {
  schemaVersion: 1,
  id: 'project_novakai',
  name: 'Novakai IDE',
  rootPath: '/tmp/novakai',
  activeThreadId: 'thread_provider',
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  threads: [{
    id: 'thread_provider',
    title: 'Provider integration',
    preferredProvider: 'codex',
    sessionReferences: [
      { provider: 'claude', sessionId: 'claude-session', cwd: '/tmp/novakai' },
      { provider: 'codex', sessionId: 'codex-session' },
    ],
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  }],
};

function testValidProject(): void {
  const parsed = parseProjectRecord(VALID_PROJECT);
  assert.equal(parsed.threads[0]?.sessionReferences.length, 2);
  assert.equal(parsed.threads[0]?.preferredProvider, 'codex');
}

function testRejectsUnknownProvider(): void {
  const broken = structuredClone(VALID_PROJECT);
  broken.threads[0]!.sessionReferences[0]!.provider = 'gemini';
  assert.throws(() => parseProjectRecord(broken), /must be claude or codex/);
}

function testRejectsMissingThreads(): void {
  const { threads: _threads, ...broken } = VALID_PROJECT;
  assert.throws(() => parseProjectRecord(broken), /threads must be an array/);
}

testValidProject();
testRejectsUnknownProvider();
testRejectsMissingThreads();
console.log('PASS');
