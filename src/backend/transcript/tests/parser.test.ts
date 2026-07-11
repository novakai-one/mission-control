// Parser regression tests. Run with `npx tsx src/backend/transcript/tests/parser.test.ts`.
import assert from 'node:assert/strict';
import { appendFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionWatcher, parseJsonlLine, readSession, stampEventKeys, type TranscriptEvent } from '../parser.js';

const tmpFile = path.join(tmpdir(), `parser-test-${Date.now()}.jsonl`);

function userLine(text: string): string {
  return JSON.stringify({
    type: 'user',
    uuid: `u-${text}`,
    sessionId: 'sess1',
    timestamp: '2026-07-10T00:00:00.000Z',
    message: { role: 'user', content: text },
  });
}

function watchFile(): { watcher: SessionWatcher; events: TranscriptEvent[]; poll: () => Promise<void> } {
  const watcher = new SessionWatcher(tmpFile);
  const events: TranscriptEvent[] = [];
  watcher.on('event', (event: TranscriptEvent) => events.push(event));
  watcher.on('error', (error: Error) => { throw error; });
  const poll = async () => {
    (watcher as any).check();
    await new Promise((resolve) => setTimeout(resolve, 50));
  };
  return { watcher, events, poll };
}

// SessionWatcher must not drop a JSONL line polled mid-write (no trailing
// '\n' yet), and must not double-emit it once the rest arrives later.
async function testTailPartialLine() {
  const secondLine = userLine('second-event-marker');
  const cutPoint = Math.floor(secondLine.length / 2);
  writeFileSync(tmpFile, userLine('first') + '\n' + secondLine.slice(0, cutPoint));

  const { watcher, events, poll } = watchFile();
  await poll();
  assert.equal(events.length, 1, 'only the complete first line should emit');
  assert.equal((events[0] as any).text, 'first');

  appendFileSync(tmpFile, secondLine.slice(cutPoint) + '\n');
  await poll();
  const secondMatches = events.filter((event: any) => event.text === 'second-event-marker');
  assert.equal(events.length, 2, 'second event should now have emitted, exactly once total');
  assert.equal(secondMatches.length, 1, 'second event must emit exactly once, not zero or twice');
  watcher.stop();
}

// Regression (bug: disappearing first message): SessionWatcher must replay
// lines already in the file when it attaches — a prompt written before the
// watcher started was previously skipped ("start from end"). Replayed events
// must carry the same eventKeys readSession produces (including uuid-less
// meta lines) so the frontend upsert dedupes the overlap.
async function testReplayFromStart() {
  // No uuid: eventKey falls back to the line index, which must match readSession's.
  const summaryLine = JSON.stringify({ type: 'summary', sessionId: 'sess1', summary: 'a summary' });
  writeFileSync(tmpFile, userLine('the prompt') + '\n' + summaryLine + '\n');
  const initial = readSession(tmpFile);

  const { watcher, events, poll } = watchFile();
  await poll();
  assert.equal(events.length, initial.length, 'watcher must replay all pre-existing lines');
  assert.deepEqual(
    events.map((event) => event.eventKey),
    initial.map((event) => event.eventKey),
    'replayed eventKeys must match readSession so the frontend upsert dedupes',
  );
  assert.ok(events.some((event: any) => event.text === 'the prompt'), 'the pre-watcher prompt must be emitted');
  watcher.stop();
}

// Sibling content blocks within one line get distinct, re-emit-stable eventKeys.
function testStampEventKeys() {
  const rawLine = {
    type: 'assistant',
    uuid: 'u1',
    sessionId: 's1',
    message: {
      id: 'm1',
      role: 'assistant',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
      ],
    },
  };
  const events = stampEventKeys(rawLine, 'k0', parseJsonlLine(rawLine, 'k0', '') ?? []);
  assert.equal(events.length, 2);
  assert.equal(events[0].eventKey, 'u1#0');
  assert.equal(events[1].eventKey, 'u1#1');
  // Re-emit: same line parsed again must yield the same eventKey.
  const reEmitted = stampEventKeys(rawLine, 'k0', parseJsonlLine(rawLine, 'k0', '') ?? []);
  assert.equal(reEmitted[0].eventKey, 'u1#0');
  // A second line of the SAME API message (streamed blocks share message.id)
  // must get a distinct key — colliding keys broke React reconciliation.
  const siblingLine = { ...rawLine, uuid: 'u2', message: { ...rawLine.message, content: [{ type: 'text', text: 'more' }] } };
  const siblingEvents = stampEventKeys(siblingLine, 'k1', parseJsonlLine(siblingLine, 'k1', '') ?? []);
  assert.equal(siblingEvents[0].eventKey, 'u2#0');
}

// System lines carry their subtype through to the event (missing subtype stays undefined).
function testSystemSubtype() {
  const rawLine = {
    type: 'system',
    subtype: 'turn_duration',
    uuid: 'sys1',
    sessionId: 's1',
    timestamp: '2026-07-10T00:00:00.000Z',
    message: 'Turn duration: 3s',
  };
  const events = parseJsonlLine(rawLine, 'k0', '') ?? [];
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'system');
  assert.equal((events[0] as any).subtype, 'turn_duration');
  const bare = parseJsonlLine({ ...rawLine, subtype: undefined }, 'k1', '') ?? [];
  assert.equal((bare[0] as any).subtype, undefined);
  const nonString = parseJsonlLine({ ...rawLine, subtype: 42 }, 'k2', '') ?? [];
  assert.equal((nonString[0] as any).subtype, undefined, 'non-string subtype is dropped');
}

async function main() {
  await testTailPartialLine();
  unlinkSync(tmpFile);
  await testReplayFromStart();
  unlinkSync(tmpFile);
  testStampEventKeys();
  testSystemSubtype();
  console.log('PASS');
}

main().catch((error) => {
  try { unlinkSync(tmpFile); } catch {}
  console.error(error);
  process.exit(1);
});
