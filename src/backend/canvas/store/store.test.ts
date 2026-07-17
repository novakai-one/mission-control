import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARCHITECTURE_FILE, CanvasStore, StaleRevisionError } from './index.js';
import { emptyArchitecture } from '../../../shared/canvas/model/defaults.js';

const tempDir = mkdtempSync(join(tmpdir(), 'canvas-store-'));
const disk = { ...emptyArchitecture, id: 'doc', name: 'Doc', revision: 5 };
writeFileSync(join(tempDir, ARCHITECTURE_FILE), JSON.stringify(disk), 'utf8');

const store = new CanvasStore(tempDir);

// Loads what is on disk; falls back to the empty document on garbage.
assert.equal((await store.loadArchitecture()).revision, 5);
writeFileSync(join(tempDir, ARCHITECTURE_FILE), 'not json', 'utf8');
assert.equal((await store.loadArchitecture()).id, emptyArchitecture.id);
writeFileSync(join(tempDir, ARCHITECTURE_FILE), JSON.stringify(disk), 'utf8');

// CAS: a stale or equal revision must not clobber the disk copy.
await assert.rejects(
  store.saveArchitecture({ ...disk, revision: 5 }),
  (error: unknown) => error instanceof StaleRevisionError && error.diskRevision === 5,
);

// A newer revision lands atomically (no temp files left behind) and is readable.
await store.saveArchitecture({ ...disk, revision: 6 });
assert.equal((await store.loadArchitecture()).revision, 6);
assert.deepEqual(readdirSync(tempDir).filter((name) => name.endsWith('.tmp')), []);
assert.equal(readFileSync(join(tempDir, ARCHITECTURE_FILE), 'utf8').endsWith('\n'), true);

// The store remembers writing so the watcher can suppress the echo.
assert.equal(store.msSinceLastWrite() < 500, true);

// Invalid documents never reach disk.
await assert.rejects(store.saveArchitecture({ broken: true } as never), /invalid architecture document/);

// Preferences default on a missing file.
assert.equal((await store.loadPreferences()).schemaVersion, 1);

console.log('canvas store: ok');
