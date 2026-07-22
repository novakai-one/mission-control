// Transition-writer proof (ruling S3): CAS, full-candidate validation against
// the post-transition snapshot, strict-instant monotonicity, crash points at
// every seam, and cross-process concurrency through the CLI. Run directly:
//   npx tsx src/backend/stores/transition.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceLine, StoreConflictError, StoreRefusalError, StoreValidationError, validateTransition } from './store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', '..', '..', 'scripts', 'nvk-store.mjs');
const KNOWN_VALID = path.join(HERE, 'fixtures', 'known-valid');
const TS = '2026-07-22T10:00:00+10:00';

function scratchStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'nvk-transition-'));
  cpSync(KNOWN_VALID, dir, { recursive: true });
  return dir;
}

function taskLine(id, extra = {}) {
  return JSON.stringify({ id, kind: 'task', ts: TS, title: `Task ${id}`, updated: TS, ...extra });
}

function seedTask(dir, id, extra = {}) {
  const line = taskLine(id, extra);
  writeFileSync(path.join(dir, 'tasks.jsonl'), readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8') + line + '\n');
  return line;
}

// --- validateTransition: strict instants, not lexical strings ---------------

{
  const current = { id: 'task_a', kind: 'task', updated: '2026-07-22T10:00:00+10:00' };
  // 01:00Z is chronologically AFTER 10:00+10:00 (= 00:00Z) but lexically before.
  const forward = { id: 'task_a', kind: 'task', status: 'done', updated: '2026-07-22T01:00:00Z' };
  assert.equal(validateTransition(current, forward).length, 0, 'chronological forward across offsets is legal');

  const equal = { id: 'task_a', kind: 'task', updated: '2026-07-22T00:00:00Z' };
  assert.ok(
    validateTransition(current, equal).some((violation) => violation.code === 'TRANSITION-INVALID'),
    'an equal instant is rejected — strictly forward only',
  );
  console.log('validateTransition instant tests passed');
}

// --- replaceLine happy path: one line changes, every other byte survives -----

{
  const dir = scratchStore();
  const raw = seedTask(dir, 'task_t1');
  const before = readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8');
  const candidate = JSON.stringify({ ...JSON.parse(raw), status: 'doing', updated: '2026-07-22T10:01:00+10:00' });
  const result = replaceLine(dir, 'tasks.jsonl', 'task_t1', candidate, { expectedRaw: raw });
  assert.equal(result.id, 'task_t1');
  const after = readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8');
  assert.equal(after, before.replace(raw, candidate), 'file is exactly old content with one line swapped');
  rmSync(dir, { recursive: true, force: true });
  console.log('replaceLine happy-path test passed');
}

// --- CAS: a stale expectedRaw is a conflict, and the file does not move ------

{
  const dir = scratchStore();
  const raw = seedTask(dir, 'task_t2');
  const first = JSON.stringify({ ...JSON.parse(raw), status: 'doing', updated: '2026-07-22T10:01:00+10:00' });
  replaceLine(dir, 'tasks.jsonl', 'task_t2', first, { expectedRaw: raw });
  const snapshotAfterFirst = readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8');
  const second = JSON.stringify({ ...JSON.parse(raw), status: 'done', updated: '2026-07-22T10:02:00+10:00' });
  assert.throws(
    () => replaceLine(dir, 'tasks.jsonl', 'task_t2', second, { expectedRaw: raw }),
    StoreConflictError,
    'stale expectedRaw must be a conflict',
  );
  assert.equal(readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8'), snapshotAfterFirst, 'conflict leaves bytes untouched');
  rmSync(dir, { recursive: true, force: true });
  console.log('replaceLine CAS test passed');
}

// --- full-candidate validation runs against the post-transition world --------

{
  const dir = scratchStore();
  const raw = seedTask(dir, 'task_t3');
  const blockedWithout = JSON.stringify({ ...JSON.parse(raw), status: 'blocked', updated: '2026-07-22T10:01:00+10:00' });
  assert.throws(
    () => replaceLine(dir, 'tasks.jsonl', 'task_t3', blockedWithout, { expectedRaw: raw }),
    StoreValidationError,
    'blocked without blockedReason is rejected by the full-candidate pass',
  );
  const blockedWith = JSON.stringify({ ...JSON.parse(raw), status: 'blocked', blockedReason: 'waiting on ruling', updated: '2026-07-22T10:01:00+10:00' });
  replaceLine(dir, 'tasks.jsonl', 'task_t3', blockedWith, { expectedRaw: raw });

  const idChange = JSON.stringify({ ...JSON.parse(blockedWith), id: 'task_other' });
  assert.throws(
    () => replaceLine(dir, 'tasks.jsonl', 'task_t3', idChange, { expectedRaw: blockedWith }),
    StoreValidationError,
    'id may never change',
  );
  rmSync(dir, { recursive: true, force: true });
  console.log('replaceLine full-candidate tests passed');
}

// --- refusals: absent id, wrong store, unterminated file ---------------------

{
  const dir = scratchStore();
  assert.throws(
    () => replaceLine(dir, 'tasks.jsonl', 'task_ghost', taskLine('task_ghost'), { expectedRaw: 'x' }),
    StoreRefusalError,
    'absent id refused — replaceLine never creates',
  );
  const raw = seedTask(dir, 'task_t4');
  assert.throws(
    () => replaceLine(dir, 'missions.jsonl', 'task_t4', raw, { expectedRaw: raw }),
    StoreRefusalError,
    'target living in a different store is refused',
  );
  const tasksPath = path.join(dir, 'tasks.jsonl');
  writeFileSync(tasksPath, readFileSync(tasksPath, 'utf8').slice(0, -1)); // strip final newline
  assert.throws(
    () => replaceLine(dir, 'tasks.jsonl', 'task_t4', raw, { expectedRaw: raw }),
    StoreRefusalError,
    'unterminated final line is refused, no repair',
  );
  rmSync(dir, { recursive: true, force: true });
  console.log('replaceLine refusal tests passed');
}

// --- crash points: every seam failure leaves the original intact -------------

{
  const dir = scratchStore();
  const raw = seedTask(dir, 'task_t5');
  const before = readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8');
  const candidate = JSON.stringify({ ...JSON.parse(raw), status: 'doing', updated: '2026-07-22T10:01:00+10:00' });

  // Crash after temp write (process dies before rename): original intact, temp cleaned.
  assert.throws(
    () => replaceLine(dir, 'tasks.jsonl', 'task_t5', candidate, {
      expectedRaw: raw, seams: { afterTempWrite: () => { throw new Error('crash: power loss before rename'); } },
    }),
    /power loss/,
  );
  assert.equal(readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8'), before, 'original intact after temp-write crash');

  // Corrupted temp content is caught BEFORE rename ever happens.
  assert.throws(
    () => replaceLine(dir, 'tasks.jsonl', 'task_t5', candidate, {
      expectedRaw: raw, seams: { afterTempWrite: (tempPath) => writeFileSync(tempPath, 'corrupt') },
    }),
    /SC5-T: temp file bytes/,
  );
  assert.equal(readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8'), before, 'original intact after temp corruption');

  // Post-rename corruption (external writer) is detected and stops, no repair.
  assert.throws(
    () => replaceLine(dir, 'tasks.jsonl', 'task_t5', candidate, {
      expectedRaw: raw, seams: { afterRename: (filePath) => writeFileSync(filePath, 'clobbered\n') },
    }),
    /SC5-T: post-transition bytes/,
  );

  const leftovers = readdirSync(dir).filter((name) => name.includes('.transition-'));
  assert.equal(leftovers.length, 0, 'no temp files left behind by any crash path');
  rmSync(dir, { recursive: true, force: true });
  console.log('replaceLine crash-point tests passed');
}

// --- concurrent writers: two processes, interleaved CLI transitions ----------

{
  const dir = scratchStore();
  seedTask(dir, 'task_race-a');
  seedTask(dir, 'task_race-b');

  function transitions(id, statuses) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, ['-e', `
        const { execFileSync } = require('node:child_process');
        for (const status of ${JSON.stringify(statuses)}) {
          execFileSync(process.execPath, [process.argv[1], 'transition-task', '--dir', process.argv[2], '--id', process.argv[3], '--status', status], { stdio: 'pipe' });
        }
      `, CLI, dir, id]);
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code) => resolve({ code, stderr }));
    });
  }

  const cycle = ['doing', 'todo', 'doing', 'todo', 'doing', 'done'];
  const results = await Promise.all([transitions('task_race-a', cycle), transitions('task_race-b', cycle)]);
  for (const result of results) assert.equal(result.code, 0, `concurrent writer failed: ${result.stderr}`);

  const finalText = readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8');
  assert.ok(finalText.endsWith('\n'), 'file stays newline-terminated under contention');
  const finalBlocks = finalText.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(finalBlocks.find((block) => block.id === 'task_race-a').status, 'done');
  assert.equal(finalBlocks.find((block) => block.id === 'task_race-b').status, 'done');
  rmSync(dir, { recursive: true, force: true });
  console.log('replaceLine concurrent-writer test passed');
}

console.log('transition writer tests passed');
