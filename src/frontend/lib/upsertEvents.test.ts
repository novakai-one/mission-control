import assert from 'node:assert/strict';
import { mergeEvents, upsertEvent } from './upsertEvents.js';

let list: { eventKey: string; value: number }[] = [];
list = upsertEvent(list, { eventKey: 'a', value: 1 });
assert.equal(list.length, 1);

list = upsertEvent(list, { eventKey: 'b', value: 2 });
assert.equal(list.length, 2);
assert.deepEqual(list.map(entry => entry.eventKey), ['a', 'b']);

list = upsertEvent(list, { eventKey: 'a', value: 9 });
assert.equal(list.length, 2);
assert.deepEqual(list.map(entry => entry.eventKey), ['a', 'b']);
assert.equal(list.find(entry => entry.eventKey === 'a')?.value, 9);

const merged = mergeEvents(
  [{ eventKey: 'a', value: 1 }, { eventKey: 'b', value: 2 }],
  [{ eventKey: 'b', value: 20 }, { eventKey: 'c', value: 3 }, { eventKey: 'c', value: 30 }],
);
assert.deepEqual(merged, [
  { eventKey: 'a', value: 1 },
  { eventKey: 'b', value: 20 },
  { eventKey: 'c', value: 30 },
]);

console.log('PASS');
