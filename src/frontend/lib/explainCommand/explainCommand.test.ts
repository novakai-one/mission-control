// Run with `npx tsx src/frontend/lib/explainCommand/explainCommand.test.ts`
import assert from 'node:assert/strict';
import { explainCommand } from './index.js';

const REAL_EXAMPLE = `cd /Users/christopherdasca/Programming/html-builder && git status -sb 2>&1 | head -5; git remote -v; echo ---; ls package.json eslint* .eslintrc* 2>/dev/null; echo --- MC ---; ls /Users/christopherdasca/Programming/mission-control | head; cat /Users/christopherdasca/Programming/mission-control/package.json | head -50`;

const bullets = explainCommand(REAL_EXAMPLE);
assert.ok(bullets.length > 0, 'real example should produce bullets');
assert.ok(bullets.some((bullet) => bullet.includes('enter') && bullet.includes('html-builder')), 'missing cd bullet');
assert.ok(bullets.some((bullet) => bullet.includes('check git status')), 'missing git status bullet');
assert.ok(bullets.some((bullet) => bullet.includes('show git remotes')), 'missing git remote bullet');
assert.ok(bullets.some((bullet) => bullet.includes('show contents of') && bullet.includes('package.json')), 'missing cat bullet');

assert.ok(explainCommand('ls').some((bullet) => bullet.includes('list')), 'ls should produce a list bullet');

assert.deepEqual(explainCommand('frobnicate --xyz'), ['frobnicate --xyz'], 'unknown binary falls back to raw segment');

console.log('explainCommand.test.ts passed');
