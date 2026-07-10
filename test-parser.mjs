import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSession } from './src/backend/transcript/parser.ts';

// Fixture mirrors real Claude Code JSONL: mode/permission-mode lines carry
// no uuid and no timestamp (the bug that made them render as "new" events
// stamped at parse time, all sharing one uuid).
const fixture = [
  '{"type":"user","uuid":"u1","sessionId":"s1","timestamp":"2026-07-10T01:00:00Z","message":{"role":"user","content":"hello"}}',
  '{"type":"mode","mode":"normal","sessionId":"s1"}',
  '{"type":"permission-mode","permissionMode":"default","sessionId":"s1"}',
  '{"type":"assistant","uuid":"u2","sessionId":"s1","timestamp":"2026-07-10T01:00:05Z","message":{"role":"assistant","content":"hi"}}',
  '{"type":"mode","mode":"plan","sessionId":"s1"}',
].join('\n');

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-parser-')), 'fixture.jsonl');
fs.writeFileSync(file, fixture);

const events = readSession(file);
assert.strictEqual(events.length, 5, 'all lines parse to events');

// 1. Missing timestamps inherit the preceding event's time, never parse time.
const [, modeA, permA, , modeB] = events;
assert.strictEqual(modeA.ts, '2026-07-10T01:00:00Z', 'mode inherits prior timestamp');
assert.strictEqual(permA.ts, '2026-07-10T01:00:00Z', 'permission-mode inherits prior timestamp');
assert.strictEqual(modeB.ts, '2026-07-10T01:00:05Z', 'later mode inherits later timestamp');

// 2. Synthetic uuids are unique per line and stable across reparses.
const uuids = events.map((ev) => ev.uuid);
assert.strictEqual(new Set(uuids).size, uuids.length, 'uuids must be unique');
assert.deepStrictEqual(readSession(file).map((ev) => ev.uuid), uuids, 'uuids stable across reparses');

fs.rmSync(path.dirname(file), { recursive: true, force: true });
console.log('test-parser: all assertions passed');
