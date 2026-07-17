// Workspace presentation model tests. Run with
// `npx tsx src/frontend/components/workspace/model/tests/model.test.ts`.
import assert from 'node:assert/strict';
import type { CanonicalEvent } from '../../../../../shared/provider/schema.js';
import { eventKindLabel, groupTimelineEvents, isDense, summaryLine } from '../index.js';

let counter = 0;

function makeEvent(kind: CanonicalEvent['kind'], extra: Partial<CanonicalEvent> = {}): CanonicalEvent {
  counter += 1;
  return {
    id: `ev${counter}`,
    provider: 'claude',
    sessionId: 'sess-a',
    kind,
    timestamp: '2026-07-17T09:30:00.000Z',
    text: '',
    rawType: kind,
    ...extra,
  };
}

function testConsecutiveSameVoiceMerges() {
  const groups = groupTimelineEvents([
    makeEvent('assistant', { text: 'first' }),
    makeEvent('tool', { text: 'Bash' }),
    makeEvent('assistant', { text: 'second' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].events.length, 3);
  assert.equal(groups[0].author, 'claude-1');
  assert.equal(groups[0].fromYou, false);
}

function testUserBreaksTheRun() {
  const groups = groupTimelineEvents([
    makeEvent('user', { text: 'do it' }),
    makeEvent('assistant', { text: 'done' }),
    makeEvent('user', { text: 'thanks' }),
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].author, 'You');
  assert.equal(groups[0].fromYou, true);
  assert.equal(groups[1].author, 'claude-1');
}

function testDistinctSessionsSplitAndName() {
  const groups = groupTimelineEvents([
    makeEvent('assistant', { sessionId: 'sess-a' }),
    makeEvent('assistant', { sessionId: 'sess-b' }),
    makeEvent('assistant', { provider: 'codex', sessionId: 'sess-c' }),
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((group) => group.author), ['claude-1', 'claude-2', 'codex-1']);
}

function testGroupKeyAndTimeComeFromFirstEvent() {
  const first = makeEvent('assistant', { text: 'lead' });
  const groups = groupTimelineEvents([first, makeEvent('tool', { text: 'Read' })]);
  assert.equal(groups[0].groupKey, first.id);
  assert.notEqual(groups[0].time, '');
}

function testEventKindLabel() {
  assert.equal(eventKindLabel(makeEvent('tool', { rawType: 'tool_use' })), 'tool');
  assert.equal(eventKindLabel(makeEvent('tool', { rawType: 'tool_result' })), 'result');
  assert.equal(eventKindLabel(makeEvent('tool', { rawType: 'custom_tool_call' })), 'tool');
  assert.equal(eventKindLabel(makeEvent('tool', { rawType: 'custom_tool_call_output' })), 'result');
  assert.equal(eventKindLabel(makeEvent('tool', { rawType: 'function_call_output' })), 'result');
  assert.equal(eventKindLabel(makeEvent('system', { rawType: 'hook_event' })), 'system');
}

function testIsDense() {
  assert.equal(isDense('short line'), false);
  assert.equal(isDense('two\nlines'), true);
  assert.equal(isDense('x'.repeat(97)), true);
  assert.equal(isDense('trailing newline\n'), false);
}

function testSummaryLine() {
  assert.equal(summaryLine('  first line \nsecond'), 'first line');
  assert.equal(summaryLine('x'.repeat(120)), `${'x'.repeat(96)}…`);
  assert.equal(summaryLine('plain'), 'plain');
}

function main() {
  testConsecutiveSameVoiceMerges();
  testUserBreaksTheRun();
  testDistinctSessionsSplitAndName();
  testGroupKeyAndTimeComeFromFirstEvent();
  testEventKindLabel();
  testIsDense();
  testSummaryLine();
  console.log('PASS');
}

main();
