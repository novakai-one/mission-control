// transcripts tests — real provider event shapes captured 2026-07-20.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assistantTexts,
  findCodexTranscript,
  findKimiTranscript,
  locateTranscript,
  readEvents,
  userTurns,
} from './transcripts.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nvk-transcripts-'));

// --- readEvents: torn lines tolerated, never fatal -------------------------
const jsonl = path.join(tmp, 'events.jsonl');
fs.writeFileSync(jsonl, '{"a":1}\n{"a":2}\n{"a":3\n\n{"a":4}\n');
assert.deepEqual(readEvents(jsonl), [{ a: 1 }, { a: 2 }, { a: 4 }]);
assert.deepEqual(readEvents(path.join(tmp, 'missing.jsonl')), []);

// --- userTurns: real shapes -------------------------------------------------
const kimiEvents = [
  { type: 'metadata' },
  { type: 'turn.prompt', input: [{ type: 'text', text: 'hello kimi' }], time: 100 },
  { type: 'context.append_loop_event', event: { type: 'content.part', part: { type: 'text', text: 'kimi reply' } }, time: 200 },
];
assert.deepEqual(userTurns(kimiEvents, 'kimi'), [{ text: 'hello kimi', time: 100 }]);
assert.deepEqual(assistantTexts(kimiEvents, 'kimi'), [{ text: 'kimi reply', time: 200 }]);

const claudeEvents = [
  { type: 'user', message: { content: 'real typed turn' } },
  { type: 'user', message: { content: [{ type: 'tool_result', content: 'echoes hello kimi marker' }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'claude reply' }] } },
];
assert.deepEqual(userTurns(claudeEvents, 'claude'), [{ text: 'real typed turn', time: null }]);
assert.deepEqual(assistantTexts(claudeEvents, 'claude'), [{ text: 'claude reply', time: null }]);

const codexEvents = [
  { type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'not a user turn' }] } },
  { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'codex user turn' }] } },
  { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'codex reply' }] } },
];
assert.deepEqual(userTurns(codexEvents, 'codex'), [{ text: 'codex user turn', time: null }]);
assert.deepEqual(assistantTexts(codexEvents, 'codex'), [{ text: 'codex reply', time: null }]);

// --- locateTranscript -------------------------------------------------------
const kimiHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nvk-kimi-home-'));
const sessionDir = path.join(kimiHome, '.kimi-code', 'sessions', 'wd_x', 'session_abc');
fs.mkdirSync(path.join(sessionDir, 'agents', 'main'), { recursive: true });
const wire = path.join(sessionDir, 'agents', 'main', 'wire.jsonl');
fs.writeFileSync(wire, '{"type":"metadata"}\n');
fs.writeFileSync(
  path.join(kimiHome, '.kimi-code', 'session_index.jsonl'),
  `${JSON.stringify({ sessionId: 'session_abc', sessionDir, workDir: '/x' })}\n`,
);
assert.equal(findKimiTranscript('session_abc', kimiHome), wire);
assert.equal(findKimiTranscript('session_missing', kimiHome), null);
assert.equal(locateTranscript({ provider: 'kimi', sessionId: 'session_abc' }, { home: kimiHome }), wire);

const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nvk-codex-home-'));
const rollout = path.join(codexHome, '.codex', 'archived_sessions', '2026', '07', 'rollout-2026-07-20T20-43-28-019f7f1f.jsonl');
fs.mkdirSync(path.dirname(rollout), { recursive: true });
fs.writeFileSync(rollout, '{}\n');
assert.equal(findCodexTranscript('019f7f1f', codexHome), rollout);

const claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nvk-claude-home-'));
const claudeFile = path.join(claudeHome, '.claude', 'projects', '-proj-x', 'sess-1.jsonl');
fs.mkdirSync(path.dirname(claudeFile), { recursive: true });
fs.writeFileSync(claudeFile, '{}\n');
assert.equal(
  locateTranscript({ provider: 'claude', sessionId: 'sess-1', projectDir: '-proj-x' }, { home: claudeHome }),
  claudeFile,
);
assert.equal(locateTranscript({ provider: 'kimi', sessionId: '' }, { home: kimiHome }), null);

console.log('transcripts tests passed');
