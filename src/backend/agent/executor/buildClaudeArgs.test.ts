import assert from 'node:assert/strict';
import { buildClaudeArgs } from './index.js';

// New session: --session-id, no --resume
const newArgs = buildClaudeArgs('hi', {}, 'sid-123');
assert.equal(newArgs[0], '-p');
assert.equal(newArgs[1], 'hi');
assert.equal(newArgs[newArgs.indexOf('--session-id') + 1], 'sid-123');
assert.ok(!newArgs.includes('--resume'));
assert.equal(newArgs[newArgs.indexOf('--permission-mode') + 1], 'bypassPermissions');

// Resume: --resume, no --session-id
const resumeArgs = buildClaudeArgs('hi', { resumeSessionId: 'old' }, 'old');
assert.equal(resumeArgs[resumeArgs.indexOf('--resume') + 1], 'old');
assert.ok(!resumeArgs.includes('--session-id'));

// systemPrompt
const sysArgs = buildClaudeArgs('hi', { systemPrompt: 'sys' }, 'x');
assert.equal(sysArgs[sysArgs.indexOf('--system-prompt') + 1], 'sys');

console.log('PASS');
