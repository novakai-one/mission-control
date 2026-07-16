import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectRecord } from '../../../shared/project/schema.js';
import { ProjectStore } from './store.js';

function project(id: string, name: string): ProjectRecord {
  return {
    schemaVersion: 1,
    id,
    name,
    rootPath: `/tmp/${id}`,
    threads: [],
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  };
}

function fixtureRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'novakai-projects-'));
}

function testSaveLoadAndList(): void {
  const store = new ProjectStore(fixtureRoot());
  store.save(project('zeta', 'Zeta'));
  store.save(project('alpha', 'Alpha'));
  assert.equal(store.load('alpha')?.name, 'Alpha');
  assert.deepEqual(store.list().map((entry) => entry.id), ['alpha', 'zeta']);
}

function testMissingProject(): void {
  const store = new ProjectStore(fixtureRoot());
  assert.equal(store.load('missing'), null);
}

function testRejectsTraversal(): void {
  const store = new ProjectStore(fixtureRoot());
  assert.throws(() => store.load('../outside'), /unsupported characters/);
}

function testReportsCorruptProject(): void {
  const root = fixtureRoot();
  mkdirSync(path.join(root, 'broken'));
  writeFileSync(path.join(root, 'broken', 'project.json'), '{broken');
  const store = new ProjectStore(root);
  assert.throws(() => store.load('broken'), /invalid project file/);
}

testSaveLoadAndList();
testMissingProject();
testRejectsTraversal();
testReportsCorruptProject();
console.log('PASS');
