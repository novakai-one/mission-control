import assert from 'node:assert/strict';
import { encodeCwd } from '../parser.js';

assert.equal(encodeCwd('/Users/me/my-repo'), '-Users-me-my-repo');
assert.equal(encodeCwd('/Users/me/.gemini/x'), '-Users-me--gemini-x');
assert.equal(encodeCwd('/a/b.c/d'), '-a-b-c-d');

console.log('PASS');
