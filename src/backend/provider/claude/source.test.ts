import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encodeCwd } from '../../transcript/parser.js';
import { ClaudeSessionSource } from './source.js';

const cwd = '/tmp/novakai';
const sessionId = 'claude-session';
const root = mkdtempSync(path.join(tmpdir(), 'claude-source-'));
const projectDir = path.join(root, encodeCwd(cwd));
mkdirSync(projectDir);
writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), [
  JSON.stringify({
    type: 'user', sessionId, uuid: 'user-1', timestamp: '2026-07-16T00:00:00.000Z',
    message: { role: 'user', content: 'Build the provider seam' },
  }),
  JSON.stringify({
    type: 'assistant', sessionId, uuid: 'assistant-1', timestamp: '2026-07-16T00:00:01.000Z',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Starting now' }] },
  }),
  JSON.stringify({
    type: 'attachment', sessionId, uuid: 'attachment-1', timestamp: '2026-07-16T00:00:02.000Z',
    attachment: {
      type: 'task_reminder',
      itemCount: 2,
      content: [
        { id: '1', subject: 'Build the seam', description: '', activeForm: 'Building the seam', status: 'completed', blocks: [], blockedBy: [] },
        { id: '2', subject: 'Verify in browser', description: '', activeForm: 'Verifying in browser', status: 'in_progress', blocks: [], blockedBy: [] },
      ],
    },
  }),
].join('\n'));

const source = new ClaudeSessionSource(root);
const snapshot = source.read({ provider: 'claude', sessionId, cwd });
assert.deepEqual(snapshot.events.map((event) => event.kind), ['user', 'assistant', 'task']);
assert.equal(snapshot.events[1]?.text, 'Starting now');
const taskEvent = snapshot.events[2];
assert.equal(typeof taskEvent?.text, 'string', 'canonical text must stay a string');
assert.equal(taskEvent?.tasks?.length, 2);
assert.equal(taskEvent?.tasks?.[1]?.subject, 'Verify in browser');
assert.equal(taskEvent?.tasks?.[1]?.status, 'in_progress');
assert.throws(
  () => source.read({ provider: 'claude', sessionId: 'missing', cwd }),
  /claude session not found/,
);

// Input-needing tools must surface as approval events (AskUserQuestion /
// ExitPlanMode were collapsed to 'tool' and filtered out of the chat —
// Chris never saw questions that needed him).
const approvalSession = 'claude-approval-session';
writeFileSync(path.join(projectDir, `${approvalSession}.jsonl`), [
  JSON.stringify({
    type: 'assistant', sessionId: approvalSession, uuid: 'ask-1', timestamp: '2026-07-17T00:00:00.000Z',
    message: {
      role: 'assistant',
      content: [{
        type: 'tool_use', id: 'toolu_ask', name: 'AskUserQuestion',
        input: {
          questions: [{
            question: 'Which chat model should rooms use?',
            header: 'Chat model',
            multiSelect: false,
            options: [
              { label: 'Ad-hoc rooms', description: 'You assemble each room' },
              { label: 'One standing group', description: 'Single persistent room' },
            ],
          }],
        },
      }],
    },
  }),
  JSON.stringify({
    type: 'assistant', sessionId: approvalSession, uuid: 'plan-1', timestamp: '2026-07-17T00:00:01.000Z',
    message: {
      role: 'assistant',
      content: [{
        type: 'tool_use', id: 'toolu_plan', name: 'ExitPlanMode',
        input: { plan: '# Tunnel Rooms Plan\n\nDetails follow.' },
      }],
    },
  }),
  JSON.stringify({
    type: 'assistant', sessionId: approvalSession, uuid: 'bash-1', timestamp: '2026-07-17T00:00:02.000Z',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_bash', name: 'Bash', input: { command: 'ls' } }],
    },
  }),
].join('\n'));

const approvalEvents = source.read({ provider: 'claude', sessionId: approvalSession, cwd }).events;

const askEvent = approvalEvents[0];
assert.equal(askEvent?.kind, 'approval', 'AskUserQuestion must be an approval event');
assert.equal(askEvent?.text, 'Which chat model should rooms use?');
assert.deepEqual(askEvent?.approval, {
  reason: 'Chat model',
  writes: [],
  options: ['Ad-hoc rooms', 'One standing group'],
});

const plan = approvalEvents[1];
assert.equal(plan?.kind, 'approval', 'ExitPlanMode must be an approval event');
assert.equal(plan?.text, 'Plan ready — Tunnel Rooms Plan');
assert.deepEqual(plan?.approval, { writes: [] });

// Ordinary tools keep their quiet 'tool' kind (chat filters them by design).
assert.equal(approvalEvents[2]?.kind, 'tool');
assert.equal(approvalEvents[2]?.text, 'Bash');

console.log('PASS');
