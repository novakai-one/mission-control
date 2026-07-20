// confirm.mjs — proof that a message actually landed.
// Single responsibility: deliver, then verify the full body appears as a NEW
// user turn in the recipient's own session transcript. "delivered" (bytes
// written to a PTY) is never reported as "confirmed" (agent received it).
//
// Delivery reality (learned 2026-07-20, M1 dogfood): provider TUIs swallow an
// \r sent immediately after typed text — the kimi TUI treats it as a newline
// or drops it, and the text sits unsubmitted in the input box. A bare \r on a
// settled box submits. So: type the line, let the box settle, then \r; if no
// turn appears, one more bare \r flushes it. Confirmation is always decided by
// the transcript, never by the write.
import { WebSocket } from 'ws';
import { composeLiveLine, websocketUrl } from './channel.mjs';
import { locateTranscript, readEvents, userTurns } from './transcripts.mjs';

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** One websocket held open for the whole confirm window (text, settle-\r, flush-\r). */
async function openTyper(agent) {
  const socket = new WebSocket(websocketUrl(agent.backend));
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error(`WebSocket delivery failed: ${agent.backend}`)), { once: true });
  });
  return {
    type(data) {
      socket.send(JSON.stringify({ type: 'agent-input', agentId: agent.agentId, data }));
    },
    close() {
      socket.close();
    },
  };
}

/**
 * Send `body` to `agent` and confirm receipt via its transcript.
 * Returns { status: 'confirmed', messageId, latencyMs, transcript }
 *      or { status: 'unconfirmed', messageId, evidence }.
 *
 * Bodies must be single-line: provider TUIs submit at embedded newlines, so a
 * multi-line body splits across turns (or is mangled) — the exact failure this
 * module exists to expose. Long briefs go in a file; send the path instead.
 */
export async function sendAndConfirm({
  agent,
  body,
  from = 'nvk-agent',
  timeoutMs = 30_000,
  pollMs = 500,
  settleMs = 900,
  flushAtMs = 6_000,
  typer,
  home,
} = {}) {
  if (!body?.trim()) throw new Error('Message body is required');
  if (/\r|\n/.test(body)) {
    throw new Error('Body must be single-line — the TUI submits at newlines and the rest is lost. Put long briefs in a file and send the path.');
  }
  const locateOptions = home ? { home } : {};
  const transcriptBefore = locateTranscript(agent, locateOptions);
  const seenBefore = new Set(
    transcriptBefore ? userTurns(readEvents(transcriptBefore), agent.provider).map((turn) => turn.text) : [],
  );

  const startedAt = Date.now();
  const messageId = `live_${crypto.randomUUID()}`;
  const line = composeLiveLine(from, messageId, body);
  const writer = typer ?? await openTyper(agent);

  let transcript = transcriptBefore;
  let newTurnTexts = [];
  let flushed = false;
  try {
    writer.type(line);
    await wait(settleMs);
    writer.type('\r');
    const deadline = startedAt + timeoutMs;
    while (Date.now() <= deadline) {
      if (!transcript) transcript = locateTranscript(agent, locateOptions);
      if (transcript) {
        const turns = userTurns(readEvents(transcript), agent.provider);
        newTurnTexts = turns.filter((turn) => !seenBefore.has(turn.text)).map((turn) => turn.text);
        // Full-body assertion, not just the marker: a partial submit never confirms.
        if (newTurnTexts.some((text) => text.includes(body))) {
          return { status: 'confirmed', messageId, latencyMs: Date.now() - startedAt, transcript };
        }
      }
      if (!flushed && Date.now() - startedAt >= flushAtMs) {
        writer.type('\r'); // a bare \r on a settled box flushes unsubmitted input
        flushed = true;
      }
      await wait(pollMs);
    }
  } finally {
    writer.close?.();
  }
  return {
    status: 'unconfirmed',
    messageId,
    evidence: {
      transcript: transcript ?? null,
      transcriptExisted: Boolean(transcript),
      newTurnsSeen: newTurnTexts.length,
      newTurnPreviews: newTurnTexts.slice(-3).map((text) => text.slice(0, 120)),
      waitedMs: Date.now() - startedAt,
    },
  };
}
