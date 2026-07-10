// AgentBuffer regression tests. Run with `npx tsx src/backend/terminal/tests/buffer.test.ts`.
import assert from 'node:assert/strict';
import { AgentBuffer } from '../buffer.js';

const CAP_BYTES = 2 * 1024 * 1024;

function testPushSnapshotOrdering(): void {
  const buffer = new AgentBuffer();
  buffer.push('hello ');
  buffer.push('world');
  assert.equal(buffer.snapshot(), 'hello world', 'snapshot must preserve push order');
}

function testEmptySnapshot(): void {
  const buffer = new AgentBuffer();
  assert.equal(buffer.snapshot(), '', 'a fresh buffer snapshots to an empty string');
}

function testCapDropsOldestChunks(): void {
  const buffer = new AgentBuffer();
  const chunkSize = 1024 * 1024; // 1MiB
  const first = 'a'.repeat(chunkSize);
  const second = 'b'.repeat(chunkSize);
  const third = 'c'.repeat(chunkSize);
  buffer.push(first);
  buffer.push(second);
  buffer.push(third); // total 3MiB > 2MiB cap, oldest ('a' chunk) must be dropped

  const snapshot = buffer.snapshot();
  assert.ok(snapshot.length <= CAP_BYTES, `snapshot length ${snapshot.length} must be <= cap ${CAP_BYTES}`);
  assert.ok(!snapshot.includes('a'), 'oldest chunk must have been dropped');
  assert.ok(snapshot.endsWith(third), 'snapshot must retain the newest data');
}

function testSnapshotAfterOverflowContainsNewest(): void {
  const buffer = new AgentBuffer();
  const chunkSize = 512 * 1024; // 512KiB, 5 chunks = 2.5MiB > cap
  for (const label of ['1', '2', '3', '4', '5']) {
    buffer.push(label.repeat(chunkSize));
  }
  const snapshot = buffer.snapshot();
  assert.ok(snapshot.length <= CAP_BYTES, `snapshot length ${snapshot.length} must be <= cap ${CAP_BYTES}`);
  assert.ok(snapshot.endsWith('5'.repeat(chunkSize)), 'newest chunk must survive overflow');
  assert.ok(!snapshot.includes('1'), 'oldest chunk must be evicted after overflow');
}

function main(): void {
  testPushSnapshotOrdering();
  testEmptySnapshot();
  testCapDropsOldestChunks();
  testSnapshotAfterOverflowContainsNewest();
  console.log('PASS');
}

main();
