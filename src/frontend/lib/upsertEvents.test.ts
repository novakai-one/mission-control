import assert from 'node:assert/strict';
import { upsertEvent } from './upsertEvents.js';

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

console.log('PASS');
