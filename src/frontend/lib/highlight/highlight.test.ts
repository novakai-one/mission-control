import assert from 'node:assert/strict';
import {
  getHighlightedObject,
  glowObject,
  pinObject,
  resetHighlightForTest,
  subscribeHighlight,
} from './index.js';

// Hover glows; hover-out clears.
glowObject('thread:t1');
assert.equal(getHighlightedObject(), 'thread:t1');
glowObject(null);
assert.equal(getHighlightedObject(), null);

// Click pins; a transient glow may not steal a pinned object.
pinObject('agent:claude-1');
glowObject('thread:t1');
assert.equal(getHighlightedObject(), 'agent:claude-1');
glowObject(null);
assert.equal(getHighlightedObject(), 'agent:claude-1');

// A new pin replaces the old; re-clicking the pinned object releases it.
pinObject('thread:t2');
assert.equal(getHighlightedObject(), 'thread:t2');
pinObject('thread:t2');
assert.equal(getHighlightedObject(), null);

// Subscribers fire per change and can unsubscribe.
resetHighlightForTest();
let fired = 0;
const unsubscribe = subscribeHighlight(() => { fired += 1; });
glowObject('thread:t1');
pinObject('thread:t1');
assert.equal(fired, 2);
unsubscribe();
glowObject(null);
assert.equal(fired, 2);

console.log('highlight: all assertions passed');
