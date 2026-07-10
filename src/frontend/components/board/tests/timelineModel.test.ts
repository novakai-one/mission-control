// Timeline model tests. Run with `npx tsx src/frontend/components/board/tests/timelineModel.test.ts`.
import assert from 'node:assert/strict';
import type { TranscriptEvent } from '../../index.js';
import {
  SIDECHAIN_KEY,
  buildToolPairs,
  classifyEvent,
  compressNoiseRuns,
  getToolLabel,
  groupIntoTurns,
  isContextNoise,
  masterState,
  noiseSummary,
  visibilityPredicate,
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

function classKey(event: TranscriptEvent): string {
  const parsed = classifyEvent(event);
  return `${parsed.section}|${parsed.category}/${parsed.child}`;
}

function testClassifyConversation() {
  assert.equal(classKey(makeEvent('user_text', { text: 'do the thing' })), 'CONVERSATION|user-prompts/user-prompts');
  assert.equal(classKey(makeEvent('user_text', { text: '[Image #1]' })), 'CONVERSATION|user-prompts/user-prompts', 'images are genuine prompts');
  assert.equal(classKey(makeEvent('assistant_text', { text: 'done' })), 'CONVERSATION|assistant-replies/assistant-replies');
  assert.equal(classKey(makeEvent('assistant_thinking', { text: 'hmm' })), 'CONVERSATION|thinking/thinking');
}

function testClassifyTools() {
  assert.equal(classKey(makeEvent('tool_use', { tool: 'Bash', toolUseId: 't1', input: {} })), 'TOOLS|tool-calls/Bash', 'tool child is the tool name');
  assert.equal(classKey(makeEvent('tool_use', { tool: 'Agent', toolUseId: 't2', input: {}, isAgentSpawn: true })), 'TOOLS|spawns/spawns');
  assert.equal(classKey(makeEvent('tool_result', { toolUseId: 't1', content: 'ok', isError: false })), 'TOOLS|tool-results/results-ok');
  assert.equal(classKey(makeEvent('tool_result', { toolUseId: 't1', content: 'boom', isError: true })), 'TOOLS|tool-results/results-error');
}

function testClassifyInjections() {
  assert.equal(classKey(makeEvent('hook_event', { hookName: 'SessionStart:startup', hookEvent: 'hook_success' })), 'CONTEXT INJECTIONS|hooks/SessionStart:startup', 'hook child is the hookName');
  assert.equal(classKey(makeEvent('hook_event', { hookName: '', hookEvent: 'todo_reminder' })), 'CONTEXT INJECTIONS|reminders/todo_reminder');
  assert.equal(classKey(makeEvent('user_text', { text: '<system-reminder>x</system-reminder>' })), 'CONTEXT INJECTIONS|reminders/system-reminder');
  assert.equal(classKey(makeEvent('hook_event', { hookName: '', hookEvent: 'skill_listing' })), 'CONTEXT INJECTIONS|capability-deltas/skill_listing');
  assert.equal(classKey(makeEvent('user_text', { text: '<command-name>/foo</command-name>' })), 'CONTEXT INJECTIONS|commands/slash-commands');
  assert.equal(classKey(makeEvent('user_text', { text: '<local-command-stdout></local-command-stdout>' })), 'CONTEXT INJECTIONS|commands/slash-commands');
  assert.equal(classKey(makeEvent('hook_event', { hookName: '', hookEvent: 'queued_command' })), 'CONTEXT INJECTIONS|commands/queued_command');
  assert.equal(classKey(makeEvent('hook_event', { hookName: '', hookEvent: 'plan_mode' })), 'CONTEXT INJECTIONS|mode-transitions/plan_mode');
  assert.equal(classKey(makeEvent('hook_event', { hookName: '', hookEvent: 'edited_text_file' })), 'CONTEXT INJECTIONS|files-ide/edited_text_file');
  assert.equal(classKey(makeEvent('user_text', { text: '<ide_opened_file>f</ide_opened_file>' })), 'CONTEXT INJECTIONS|files-ide/ide_opened_file');
}

function testClassifyInterruptsAndCatchAll() {
  assert.equal(classKey(makeEvent('user_text', { text: '[Request interrupted by user]' })), 'CONTEXT INJECTIONS|interrupts-notifications/request-interrupted');
  assert.equal(classKey(makeEvent('user_text', { text: '<task-notification>done</task-notification>' })), 'CONTEXT INJECTIONS|interrupts-notifications/task-notification');
  assert.equal(classKey(makeEvent('hook_event', { hookName: '', hookEvent: 'date_change' })), 'CONTEXT INJECTIONS|other-injections/date_change', 'unmapped attachment types are catch-all');
  assert.equal(classKey(makeEvent('user_text', { text: '<mystery-tag>x</mystery-tag>' })), 'CONTEXT INJECTIONS|other-injections/mystery-tag', 'unknown tags are catch-all');
}

function testClassifySessionMeta() {
  assert.equal(classKey(makeEvent('session_meta', { mode: 'normal' })), 'SESSION META|mode-permissions/mode');
  assert.equal(classKey(makeEvent('session_meta', { permissionMode: 'default' })), 'SESSION META|mode-permissions/permissions');
  assert.equal(classKey(makeEvent('session_meta', { summary: 'a summary' })), 'SESSION META|summaries/summaries');
  assert.equal(classKey(makeEvent('system', { text: 'took 3s', subtype: 'turn_duration' })), 'SESSION META|system-messages/turn_duration');
  assert.equal(classKey(makeEvent('system', { text: 'note' })), 'SESSION META|system-messages/other', 'missing subtype buckets as other');
}

function testMasterState() {
  const children = ['tool-calls/Bash', 'tool-calls/Read'];
  assert.equal(masterState(children, new Set()), 'on');
  assert.equal(masterState(children, new Set(['tool-calls/Bash'])), 'mixed');
  assert.equal(masterState(children, new Set(children)), 'off');
  assert.equal(masterState(children, new Set(['unrelated/key'])), 'on', 'hidden keys outside the category are ignored');
}

function testVisibilityPredicate() {
  const bash = makeEvent('tool_use', { tool: 'Bash', toolUseId: 't1', input: {} });
  const read = makeEvent('tool_use', { tool: 'Read', toolUseId: 't2', input: {} });
  const sidechainReply = makeEvent('assistant_text', { text: 'sc', isSidechain: true });
  const allEvents = [bash, read, sidechainReply];
  assert.deepEqual(allEvents.filter(visibilityPredicate(new Set())), allEvents, 'empty hidden set keeps everything');
  assert.deepEqual(allEvents.filter(visibilityPredicate(new Set(['tool-calls/Bash']))), [read, sidechainReply]);
  assert.deepEqual(allEvents.filter(visibilityPredicate(new Set([SIDECHAIN_KEY]))), [bash, read], 'sidechain toggle hides across categories');
}

function main() {
  testGetToolLabel();
  testIsContextNoise();
  testBuildToolPairs();
  testGroupIntoTurns();
  testNoiseSummary();
  testCompressNoiseRuns();
  testClassifyConversation();
  testClassifyTools();
  testClassifyInjections();
  testClassifyInterruptsAndCatchAll();
  testClassifySessionMeta();
  testMasterState();
  testVisibilityPredicate();
  console.log('PASS');
}

main();
