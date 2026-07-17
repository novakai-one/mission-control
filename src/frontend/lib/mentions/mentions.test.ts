import assert from 'node:assert/strict';
import { buildTargets, firstMentionObjectId, splitMentions } from './index.js';

const targets = buildTargets(
  [{ title: 'claude-1' }, { title: 'codex-1' }],
  [{ id: 't1', title: 'Renderer registry' }, { id: 't2', title: 'ok' }],
);

// Short labels are dropped — "ok" would turn half the chat into mentions.
assert.deepEqual(targets.map((target) => target.objectId), ['agent:claude-1', 'agent:codex-1', 'thread:t1']);

// Mid-sentence agent mention becomes a targeted segment.
const dmParts = splitMentions('Ask codex-1 to take the schema half.', targets);
assert.deepEqual(dmParts.map((segment) => segment.text), ['Ask ', 'codex-1', ' to take the schema half.']);
assert.equal(dmParts[1].target?.objectId, 'agent:codex-1');
assert.equal(dmParts[0].target, null);

// Whole-word only: "codex-10" is not a mention of codex-1.
const noHit = splitMentions('codex-10 is not codex-1x either', targets);
assert.equal(noHit.every((segment) => segment.target === null), true);

// Thread titles match case-insensitively.
const thread = splitMentions('The renderer registry needs your call.', targets);
assert.equal(thread[1].text, 'renderer registry');
assert.equal(thread[1].target?.objectId, 'thread:t1');

// Multiple mentions split in order; text with none stays one plain segment.
const both = splitMentions('claude-1 pinged codex-1', targets);
assert.deepEqual(both.map((segment) => segment.target?.objectId ?? null), ['agent:claude-1', null, 'agent:codex-1']);
assert.deepEqual(splitMentions('nothing to see', targets), [{ text: 'nothing to see', target: null }]);
assert.deepEqual(splitMentions('', targets), [{ text: '', target: null }]);

// Row seam: the first resolvable mention, or null.
assert.equal(firstMentionObjectId('waiting on codex-1', targets), 'agent:codex-1');
assert.equal(firstMentionObjectId('npm run migrate', targets), null);

console.log('mentions: all assertions passed');
