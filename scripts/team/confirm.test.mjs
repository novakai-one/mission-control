// confirm tests — fake typer against a fixture kimi transcript.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sendAndConfirm } from './confirm.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nvk-confirm-home-'));
const sessionDir = path.join(home, '.kimi-code', 'sessions', 'wd_x', 'session_c');
fs.mkdirSync(path.join(sessionDir, 'agents', 'main'), { recursive: true });
const wire = path.join(sessionDir, 'agents', 'main', 'wire.jsonl');
fs.writeFileSync(wire, '{"type":"metadata"}\n');
fs.writeFileSync(
  path.join(home, '.kimi-code', 'session_index.jsonl'),
  `${JSON.stringify({ sessionId: 'session_c', sessionDir, workDir: '/x' })}\n`,
);
const agent = { provider: 'kimi', sessionId: 'session_c' };

const appendUserTurn = (text) => fs.appendFileSync(
  wire,
  `${JSON.stringify({ type: 'turn.prompt', input: [{ type: 'text', text }], time: Date.now() })}\n`,
);

/** Fake TUI: holds typed text; submits it as a user turn only when \r arrives. */
const fakeTyper = ({ submitOnEnter = true } = {}) => {
  let buffer = '';
  const typed = [];
  return {
    typed,
    type(data) {
      typed.push(data);
      if (data === '\r') {
        if (submitOnEnter && buffer) appendUserTurn(buffer);
        buffer = '';
      } else {
        buffer += data;
      }
    },
    close() {},
  };
};

// 1. confirmed: text settles, \r submits, transcript shows the full body.
{
  const typer = fakeTyper();
  const result = await sendAndConfirm({ agent, body: 'ping one', typer, home, settleMs: 20, pollMs: 30 });
  assert.equal(result.status, 'confirmed');
  assert.deepEqual(typedOrder(typer.typed), ['line', 'enter']);
  assert.ok(typer.typed[0].includes('ping one'));
  assert.ok(typer.typed[0].startsWith('[nvk-live from nvk-agent id live_'));
}

// 2. unconfirmed: the TUI swallows every \r — exactly the M1 lie, caught honestly.
{
  const typer = fakeTyper({ submitOnEnter: false });
  const result = await sendAndConfirm({ agent, body: 'ping two', typer, home, settleMs: 20, pollMs: 30, flushAtMs: 100, timeoutMs: 400 });
  assert.equal(result.status, 'unconfirmed');
  assert.equal(result.evidence.transcript, wire);
  assert.equal(countEnters(typer.typed), 2, 'settle-\\r plus one flush-\\r, no more');
}

// 3. a different new turn does NOT confirm the message (no partial credit).
{
  const typer = {
    typed: [],
    type(data) {
      this.typed.push(data);
      if (data === '\r') appendUserTurn('some unrelated turn');
    },
    close() {},
  };
  const result = await sendAndConfirm({ agent, body: 'ping three', typer, home, settleMs: 20, pollMs: 30, timeoutMs: 300 });
  assert.equal(result.status, 'unconfirmed');
  assert.equal(result.evidence.newTurnsSeen, 1);
}

// 4. multi-line bodies are rejected — the TUI submits at newlines.
{
  await assert.rejects(
    () => sendAndConfirm({ agent, body: 'line one\nline two', typer: fakeTyper(), home }),
    /single-line/,
  );
}

function typedOrder(typed) {
  return typed.map((data) => (data === '\r' ? 'enter' : 'line'));
}
function countEnters(typed) {
  return typed.filter((data) => data === '\r').length;
}

console.log('confirm tests passed');
