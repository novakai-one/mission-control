// Run with `npx tsx src/backend/transcript/usage/usage.test.ts`.
import assert from 'node:assert/strict';
import { parseJsonlLine, type TranscriptEvent } from '../parser.js';
import { aggregateUsage } from './index.js';

function assistantLine(msgId: string, blocks: any[], usage: any, uuid = `u-${msgId}`): any {
  return {
    type: 'assistant',
    uuid,
    sessionId: 'sess1',
    timestamp: '2026-07-11T00:00:00.000Z',
    message: { id: msgId, model: 'claude-fable-5', role: 'assistant', content: blocks, usage },
  };
}

const USAGE = {
  input_tokens: 100,
  cache_creation_input_tokens: 50,
  cache_read_input_tokens: 1000,
  output_tokens: 20,
  cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 40 },
};

// Usage event emitted, appended LAST (sibling eventKeys must not shift), with the 5m/1h split.
{
  const events = parseJsonlLine(assistantLine('m1', [{ type: 'text', text: 'hi' }], USAGE), '0', '') as TranscriptEvent[];
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, 'assistant_text');
  const usageEvent = events[1];
  assert.equal(usageEvent.kind, 'usage');
  assert.deepEqual(usageEvent.kind === 'usage' && usageEvent.usage, {
    input: 100, cacheWrite5m: 10, cacheWrite1h: 40, cacheRead: 1000, output: 20,
  });
  assert.equal(usageEvent.kind === 'usage' && usageEvent.model, 'claude-fable-5');
}

// Old transcript shape without cache_creation split -> total billed as 5m.
{
  const events = parseJsonlLine(
    assistantLine('m2', [{ type: 'text', text: 'x' }], { input_tokens: 1, cache_creation_input_tokens: 7, cache_read_input_tokens: 0, output_tokens: 2 }),
    '0', '') as TranscriptEvent[];
  const usageEvent = events[1];
  assert.ok(usageEvent.kind === 'usage' && usageEvent.usage.cacheWrite5m === 7 && usageEvent.usage.cacheWrite1h === 0);
}

// Assistant line with usage but no renderable blocks still yields the usage event.
{
  const events = parseJsonlLine(assistantLine('m3', [], USAGE), '0', '') as TranscriptEvent[];
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'usage');
}

// Aggregation dedupes by msgId (one API message spans multiple lines; last wins),
// counts distinct messages, and groups per model.
{
  const line1 = parseJsonlLine(assistantLine('m1', [{ type: 'thinking', thinking: 't' }], USAGE), '0', '') as TranscriptEvent[];
  const line2 = parseJsonlLine(assistantLine('m1', [{ type: 'thinking', thinking: 't' }, { type: 'text', text: 'hi' }], USAGE, 'u-m1b'), '1', '') as TranscriptEvent[];
  const line3 = parseJsonlLine(assistantLine('m2', [{ type: 'text', text: 'y' }], { input_tokens: 5, output_tokens: 5 }), '2', '') as TranscriptEvent[];
  const { perModel } = aggregateUsage([...line1, ...line2, ...line3]);
  const totals = perModel['claude-fable-5'];
  assert.equal(totals.requests, 2);          // m1 counted once despite two lines
  assert.equal(totals.input, 105);           // 100 + 5, not 205
  assert.equal(totals.cacheRead, 1000);
  assert.equal(totals.output, 25);
}

console.log('usage tests passed');
