// Run with `npx tsx src/frontend/components/studio/chat/parity/parity.test.ts`.
import assert from 'node:assert/strict';
import { appliedModelOption } from './model.js';

const options = ['fable', 'opus', 'sonnet', 'haiku'].map((id) => ({ id }));

assert.equal(appliedModelOption('claude-opus-4-8', options), 'opus');
assert.equal(appliedModelOption('claude-fable-5', options), 'fable');
assert.equal(appliedModelOption('sonnet', options), 'sonnet');
assert.equal(appliedModelOption('unknown-provider-model', options), '');
assert.equal(appliedModelOption(null, options), '');

console.log('parity telemetry tests passed');
