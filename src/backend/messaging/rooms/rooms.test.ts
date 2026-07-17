import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomStore } from './index.js';

function freshStore(): { store: RoomStore; storePath: string } {
  const storePath = join(mkdtempSync(join(tmpdir(), 'nvk-rooms-')), 'rooms.jsonl');
  return { store: new RoomStore(storePath), storePath };
}

function testCreateRoundtripAndMembership(): void {
  const { store } = freshStore();
  const room = store.create({
    name: 'Tunnel Builders',
    members: ['codex-1', 'codex-1'],
    createdBy: 'chris',
  });

  assert.match(room.roomId, /^room_/);
  assert.deepEqual(room.members, ['codex-1', 'chris']);
  assert.equal(room.archived, false);
  assert.deepEqual(store.get(room.roomId), room);
  assert.deepEqual(store.list(), [room]);
}

function testAddMembersFoldsLastLineAndKeepsOrder(): void {
  const { store, storePath } = freshStore();
  const first = store.create({ name: 'First Room', members: ['chris'], createdBy: 'chris' });
  const second = store.create({ name: 'Second Room', members: ['codex-1'], createdBy: 'codex-1' });
  const amended = store.addMembers(first.roomId, ['claude-1', 'claude-1', 'chris']);

  assert.deepEqual(amended?.members, ['chris', 'claude-1']);
  assert.deepEqual(store.get(first.roomId), amended);
  assert.deepEqual(store.list().map((room) => room.roomId), [first.roomId, second.roomId]);
  assert.equal(readFileSync(storePath, 'utf8').trim().split('\n').length, 3);
  assert.equal(store.addMembers('room_unknown', ['codex-2']), null);
}

function testCorruptLinesAreSkipped(): void {
  const { store, storePath } = freshStore();
  const room = store.create({ name: 'Valid Room', members: ['chris'], createdBy: 'chris' });
  writeFileSync(storePath, `{ torn line\n${JSON.stringify(room)}\n`);
  assert.deepEqual(store.list(), [room]);
}

function testAppendListenerGetsSnapshots(): void {
  const { store } = freshStore();
  const seen: string[][] = [];
  store.onAppend((room) => seen.push(room.members));
  const room = store.create({ name: 'Listener Room', members: ['chris'], createdBy: 'chris' });
  store.addMembers(room.roomId, ['codex-1']);
  assert.deepEqual(seen, [['chris'], ['chris', 'codex-1']]);
}

testCreateRoundtripAndMembership();
testAddMembersFoldsLastLineAndKeepsOrder();
testCorruptLinesAreSkipped();
testAppendListenerGetsSnapshots();
console.log('PASS');
