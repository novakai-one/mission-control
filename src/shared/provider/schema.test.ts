import assert from 'node:assert/strict';
import { orderCanonicalEvents, type CanonicalEvent } from './schema.js';

const event = (id: string, timestamp: string): CanonicalEvent => ({
  id,
  provider: 'claude',
  sessionId: 'session',
  kind: 'assistant',
  timestamp,
  text: id,
  rawType: 'assistant',
});

const ordered = orderCanonicalEvents([
  event('later', '2026-07-16T00:00:02.000Z'),
  event('second', '2026-07-16T00:00:01.000Z'),
  event('first', '2026-07-16T00:00:01.000Z'),
]);

assert.deepEqual(ordered.map((item) => item.id), ['first', 'second', 'later']);
console.log('PASS');
