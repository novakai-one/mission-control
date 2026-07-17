// Run with `node tools/deploy.test.mjs`.
// Covers the dep-skew guard + snapshot helpers that gate a safe prod boot.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { shortSha, lockfileHash, depsMatch } from './deploy.mjs';

function tempWorkspace(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-test-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

// shortSha truncates to 12 chars.
assert.equal(shortSha('0123456789abcdef0123456789abcdef'), '0123456789ab');

// lockfileHash prefers package-lock.json and is deterministic.
{
  const ws = tempWorkspace({ 'package-lock.json': '{"a":1}', 'package.json': '{}' });
  const first = lockfileHash(ws);
  const second = lockfileHash(ws);
  assert.equal(first.name, 'package-lock.json');
  assert.equal(first.hash, second.hash, 'same lockfile -> same hash');
  rmSync(ws, { recursive: true, force: true });
}

// lockfileHash falls back to package.json when no lockfile exists.
{
  const ws = tempWorkspace({ 'package.json': '{"deps":true}' });
  assert.equal(lockfileHash(ws).name, 'package.json');
  rmSync(ws, { recursive: true, force: true });
}

// depsMatch: matching manifest passes, drifted lockfile fails loud.
{
  const ws = tempWorkspace({ 'package-lock.json': '{"v":1}' });
  const lock = lockfileHash(ws);
  const goodManifest = { lockfile: lock.name, lockfileHash: lock.hash };
  assert.equal(depsMatch(goodManifest, ws), true, 'unchanged deps match');

  writeFileSync(path.join(ws, 'package-lock.json'), '{"v":2}'); // simulate a dep bump
  assert.equal(depsMatch(goodManifest, ws), false, 'drifted deps must be detected');
  rmSync(ws, { recursive: true, force: true });
}

// depsMatch also fails when the lockfile TYPE changes (lock removed).
{
  const ws = tempWorkspace({ 'package-lock.json': '{"v":1}' });
  const lock = lockfileHash(ws);
  const manifest = { lockfile: lock.name, lockfileHash: lock.hash };
  rmSync(path.join(ws, 'package-lock.json'));
  writeFileSync(path.join(ws, 'package.json'), '{}');
  assert.equal(depsMatch(manifest, ws), false, 'lockfile type change is skew');
  rmSync(ws, { recursive: true, force: true });
}

console.log('deploy.test.mjs: all assertions passed');
