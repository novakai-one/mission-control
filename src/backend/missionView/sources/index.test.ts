// Mission Room V1 sources tests. Run with
// `npx tsx src/backend/missionView/sources/index.test.ts`.
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { isSafeMissionId, readJournal, readPacket, readRegistry, readStores } from './index.js';
import {
  agentEntry,
  envelopeLine,
  missionLine,
  taskLine,
  withRig,
  writeJournal,
  writePacketFile,
  writeRegistry,
  writeStore,
} from '../tests/fixtures.js';
import type { Rig } from '../tests/fixtures.js';

function testStoresRead(env: Rig): void {
  writeStore(env, 'missions.jsonl', [missionLine('mission_a')]);
  writeStore(env, 'tasks.jsonl', [taskLine('task_a', 'mission_a'), '{corrupt']);
  const result = readStores(env.roots.storesDir);
  assert.equal(result.records.missions.length, 1);
  assert.equal(result.records.missions[0].line, 1);
  assert.equal(result.records.tasks.length, 1, 'corrupt line is skipped, not fatal');
  assert.ok(result.problems.some((entry) => entry.includes('corrupt line skipped: tasks.jsonl:2')));
  assert.ok(result.problems.some((entry) => entry.includes('store file missing: okrs.jsonl')));
  assert.ok(result.problems.some((entry) => entry.includes('store file missing: captains-log.jsonl')));
}

function testBracketRetry(env: Rig): void {
  writeStore(env, 'missions.jsonl', [missionLine('mission_a')]);
  const target = path.join(env.roots.storesDir, 'missions.jsonl');
  const once = (attempt: number): void => {
    if (attempt === 0) appendFileSync(target, `${missionLine('mission_b')}\n`);
  };
  const result = readStores(env.roots.storesDir, once);
  assert.equal(result.records.missions.length, 2, 'one full retry re-reads after a mid-read change');
  assert.ok(!result.problems.some((entry) => entry.includes('changed during read')));
}

function testBracketDoubleMismatch(env: Rig): void {
  writeStore(env, 'missions.jsonl', [missionLine('mission_a')]);
  const target = path.join(env.roots.storesDir, 'missions.jsonl');
  let counter = 0;
  const always = (): void => {
    counter += 1;
    appendFileSync(target, `${missionLine(`mission_x${counter}`)}\n`);
  };
  const result = readStores(env.roots.storesDir, always);
  assert.ok(result.problems.some((entry) => entry.includes('changed during read twice')));
  assert.equal(result.records.missions.length, 3, 'still serves the final read honestly');
}

function testJournal(env: Rig): void {
  const missing = readJournal(env.roots.journalPath);
  assert.deepEqual(missing.envelopes, []);
  assert.ok(missing.problems[0].includes('journal missing'));
  writeJournal(env, [envelopeLine('msg_1', 'hello'), envelopeLine('msg_1', 'hello amended'), envelopeLine('msg_2', 'mission_a mentioned')]);
  const folded = readJournal(env.roots.journalPath);
  assert.equal(folded.envelopes.length, 2, 'history() folds by id, last line wins');
  assert.equal(folded.envelopes[0].body, 'hello amended');
  assert.deepEqual(folded.problems, []);
}

function testEmptyJournal(env: Rig): void {
  writeJournal(env, []);
  const result = readJournal(env.roots.journalPath);
  assert.deepEqual(result.envelopes, []);
  assert.deepEqual(result.problems, [], 'an empty journal is not a read problem');
}

function testRegistry(env: Rig): void {
  const missing = readRegistry(env.roots.registryPath);
  assert.deepEqual(missing.entries, []);
  assert.ok(missing.problems[0].includes('registry missing'));
  writeRegistry(env, [agentEntry('agent_live'), agentEntry('agent_gone', true)]);
  const result = readRegistry(env.roots.registryPath);
  assert.equal(result.entries.length, 1, 'archived entries are filtered');
  assert.equal(result.entries[0].agentId, 'agent_live');
  assert.ok(result.observedAt !== null, 'observedAt is the file mtime (L2)');
}

function testPacket(env: Rig): void {
  writePacketFile(env, 'mission_a', 'brief.md', '# contract');
  writePacketFile(env, 'mission_a', 'plan.md', '# plan');
  const result = readPacket(env.roots.workDir, 'mission_a');
  assert.equal(result.files.length, 2);
  assert.ok(result.files.every((file) => file.observedModifiedAt.length > 0));
  assert.deepEqual(readPacket(env.roots.workDir, 'mission_absent').files, [], 'missing dir is empty, not a problem');
  assert.deepEqual(readPacket(env.roots.workDir, 'a/b').files, [], 'unsafe id refused before fs touch');
  assert.ok(!isSafeMissionId('../escape'));
  assert.ok(!isSafeMissionId('a/b'));
  assert.ok(isSafeMissionId('mission_a'));
}

async function main(): Promise<void> {
  await withRig(testStoresRead);
  await withRig(testBracketRetry);
  await withRig(testBracketDoubleMismatch);
  await withRig(testJournal);
  await withRig(testEmptyJournal);
  await withRig(testRegistry);
  await withRig(testPacket);
  console.log('PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
