// Timeline model tests. Run with `npx tsx src/frontend/components/board/tests/timelineModel.test.ts`.
import assert from 'node:assert/strict';
import type { TranscriptEvent } from '../../index.js';
import {
  buildToolPairs,
  compressNoiseRuns,
  getToolLabel,
  groupIntoTurns,
  isContextNoise,
  noiseSummary,
} from '../timelineModel.js';

let counter = 0;

function makeEvent(kind: string, extra: Partial<TranscriptEvent> = {}): TranscriptEvent {
  counter += 1;
  const base = { kind, uuid: `u${counter}`, parentUuid: null, sessionId: 'sess' } as TranscriptEvent;
  base.ts = '2026-07-11T00:00:00.000Z';
  return { ...base, ...extra };
}

function testGetToolLabel() {
  const bash = makeEvent('tool_use', { tool: 'Bash', toolUseId: 't1', input: { command: 'ls -la', description: 'list' } });
  assert.equal(getToolLabel(bash), 'Bash  ls -la');
  const read = makeEvent('tool_use', { tool: 'Read', toolUseId: 't2', input: { file_path: '/tmp/a.txt' } });
  assert.equal(getToolLabel(read), 'Read  /tmp/a.txt');
  const truncated = makeEvent('tool_use', { tool: 'Bash', toolUseId: 't3', input: { command: 'x'.repeat(100) } });
  assert.equal(getToolLabel(truncated), `Bash  ${'x'.repeat(80)}…`);
  const fallback = makeEvent('tool_use', { tool: 'Mystery', toolUseId: 't4', input: { thing: 'hello' } });
  assert.equal(getToolLabel(fallback), 'Mystery  hello');
  const noStrings = makeEvent('tool_use', { tool: 'Mystery', toolUseId: 't5', input: { count: 3, flag: true } });
  assert.equal(getToolLabel(noStrings), 'Mystery(count, flag)');
  const spawn = makeEvent('tool_use', { tool: 'Agent', toolUseId: 't6', input: {}, isAgentSpawn: true, agentDescription: 'do stuff' });
  assert.equal(getToolLabel(spawn), 'Spawn: do stuff');
}

function testIsContextNoise() {
  assert.equal(isContextNoise(makeEvent('session_meta', { mode: 'normal' })), true);
  assert.equal(isContextNoise(makeEvent('session_meta', { permissionMode: 'default' })), true);
  assert.equal(isContextNoise(makeEvent('session_meta', { summary: 'a summary' })), false);
  assert.equal(isContextNoise(makeEvent('hook_event', { hookName: '', hookEvent: 'deferred_tools_delta' })), true);
  assert.equal(isContextNoise(makeEvent('hook_event', { hookName: 'SessionStart:startup', hookEvent: 'hook_success' })), false);
  assert.equal(isContextNoise(makeEvent('user_text', { text: 'hi' })), false);
}

function testBuildToolPairs() {
  const toolUse = makeEvent('tool_use', { tool: 'Bash', toolUseId: 'tu-1', input: {} });
  const result = makeEvent('tool_result', { toolUseId: 'tu-1', content: 'ok', isError: false });
  const orphan = makeEvent('tool_result', { toolUseId: 'tu-2', content: 'late', isError: false });
  const pairs = buildToolPairs([toolUse, result, orphan]);
  assert.equal(pairs.toolUseIds.has('tu-1'), true);
  assert.equal(pairs.toolUseIds.has('tu-2'), false, 'no tool_use for tu-2 in the slice');
  assert.equal(pairs.results.get('tu-1'), result);
  assert.equal(pairs.results.get('tu-2'), orphan);
}

function testGroupIntoTurns() {
  const preamble = makeEvent('session_meta', { mode: 'normal' });
  const reminder = makeEvent('user_text', { text: '<system-reminder>stuff</system-reminder>' });
  const prompt = makeEvent('user_text', { text: 'do the thing' });
  const thinking = makeEvent('assistant_thinking', { text: 'hmm' });
  const reply = makeEvent('assistant_text', { text: 'done' });
  const turns = groupIntoTurns([preamble, reminder, prompt, thinking, reply]);
  assert.equal(turns.length, 3);
  assert.equal(turns[0].header, null, 'pre-header events form a session-start turn');
  assert.deepEqual(turns[0].children, [preamble, reminder], 'synthetic user_text is not a header');
  assert.equal(turns[1].header, prompt);
  assert.deepEqual(turns[1].children, [], 'thinking left the prompt turn');
  assert.equal(turns[2].header, reply);
  assert.deepEqual(turns[2].children, [thinking], 'thinking moves forward into the turn it precedes');
  const interrupted = makeEvent('user_text', { text: '[Request interrupted by user]' });
  assert.equal(groupIntoTurns([prompt, interrupted]).length, 1, 'interrupt marker is not a header');
}

function testNoiseSummary() {
  const items = [
    makeEvent('hook_event', { hookName: '', hookEvent: 'skill_listing' }),
    makeEvent('hook_event', { hookName: '', hookEvent: 'task_reminder' }),
    makeEvent('session_meta', { mode: 'normal' }),
    makeEvent('session_meta', { permissionMode: 'default' }),
  ];
  assert.equal(noiseSummary(items), '2 context updates · mode normal · perms default');
  assert.equal(noiseSummary([makeEvent('hook_event', { hookName: '', hookEvent: 'plan_mode' })]), '1 context update');
}

function testCompressNoiseRuns() {
  const noiseA = makeEvent('session_meta', { mode: 'normal' });
  const noiseB = makeEvent('hook_event', { hookName: '', hookEvent: 'skill_listing' });
  const text = makeEvent('user_text', { text: 'hello' });
  const chunks = compressNoiseRuns([noiseA, noiseB, text, noiseA]);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], { noiseRun: [noiseA, noiseB] });
  assert.equal(chunks[1], text);
  assert.deepEqual(chunks[2], { noiseRun: [noiseA] });
}

function main() {
  testGetToolLabel();
  testIsContextNoise();
  testBuildToolPairs();
  testGroupIntoTurns();
  testNoiseSummary();
  testCompressNoiseRuns();
  console.log('PASS');
}

main();
