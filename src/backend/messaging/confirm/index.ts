// Provider-neutral effect confirmation (D1, rulings S6/M9): proof that a
// message actually landed as a NEW user turn in the recipient's own session
// transcript. "accepted" (bytes written to a PTY) is never reported as
// "delivered" for an interrupt until this module finds the turn. Correlation
// is by the FULL inbound marker (`[nvk-msg from <name> id <msgId>]`) — never
// body text alone, so an agent reading its own logs can't false-confirm.
// The per-provider transcript knowledge is ported from scripts/team/
// transcripts.mjs into adapters behind one interface.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** What the confirmer needs to know about the recipient's Presence. */
export interface ConfirmTarget {
  provider: string;
  sessionId: string;
  /** Claude project-slug directory; other providers ignore it. */
  projectDir?: string;
}

/** Proof of effect: when it was seen and which transcript event proved it. */
export interface EffectProof {
  confirmedAt: string;
  transcriptEvent: string;
}

export interface EffectConfirmer {
  confirm(target: ConfirmTarget, marker: string, options?: { timeoutMs?: number; pollMs?: number }): Promise<EffectProof | null>;
}

interface UserTurn {
  text: string;
  time: number | null;
  index: number;
}

/** Read a JSONL file tolerantly: torn/trailing lines are skipped, never fatal. */
function readEvents(filePath: string): Array<Record<string, unknown>> {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const events: Array<Record<string, unknown>> = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // torn line (writer mid-append) — ignore
    }
  }
  return events;
}

function walkFiles(root: string, limit = 4000): string[] {
  const collected: string[] = [];
  const stack = [root];
  while (stack.length > 0 && collected.length < limit) {
    const current = stack.pop() as string;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) collected.push(full);
    }
  }
  return collected;
}

function eventTime(event: Record<string, unknown>): number | null {
  return typeof event.time === 'number' ? event.time : null;
}

/** One provider adapter: locate the transcript, normalize its user turns. */
interface ProviderTranscript {
  locate(target: ConfirmTarget, home: string): string | null;
  userTurns(events: Array<Record<string, unknown>>): Array<{ text: string; time: number | null }>;
}

const claudeTranscript: ProviderTranscript = {
  locate(target, home) {
    if (!target.sessionId || !target.projectDir) return null;
    const file = path.join(home, '.claude', 'projects', target.projectDir, `${target.sessionId}.jsonl`);
    return existsSync(file) ? file : null;
  },
  userTurns(events) {
    const turns: Array<{ text: string; time: number | null }> = [];
    for (const event of events) {
      const message = event.message as { content?: unknown } | undefined;
      // tool_result arrays are NOT user turns — string content only, so tool
      // output echoing the marker can't false-confirm.
      if (event.type === 'user' && typeof message?.content === 'string') {
        turns.push({ text: message.content, time: eventTime(event) });
      }
    }
    return turns;
  },
};

const kimiTranscript: ProviderTranscript = {
  locate(target, home) {
    if (!target.sessionId) return null;
    const index = path.join(home, '.kimi-code', 'session_index.jsonl');
    for (const entry of readEvents(index)) {
      if (entry.sessionId === target.sessionId && typeof entry.sessionDir === 'string') {
        const wire = path.join(entry.sessionDir, 'agents', 'main', 'wire.jsonl');
        return existsSync(wire) ? wire : null;
      }
    }
    return null;
  },
  userTurns(events) {
    const turns: Array<{ text: string; time: number | null }> = [];
    for (const event of events) {
      if (event.type === 'turn.prompt' && Array.isArray(event.input)) {
        const text = (event.input as Array<{ type?: string; text?: string }>)
          .filter((part) => part?.type === 'text').map((part) => part.text ?? '').join('');
        if (text) turns.push({ text, time: eventTime(event) });
      }
    }
    return turns;
  },
};

const codexTranscript: ProviderTranscript = {
  locate(target, home) {
    if (!target.sessionId) return null;
    for (const rootName of ['sessions', 'archived_sessions']) {
      const root = path.join(home, '.codex', rootName);
      if (!existsSync(root)) continue;
      const match = walkFiles(root).find((file) => file.endsWith(`${target.sessionId}.jsonl`));
      if (match) return match;
    }
    return null;
  },
  userTurns(events) {
    const turns: Array<{ text: string; time: number | null }> = [];
    for (const event of events) {
      const payload = event.payload as { type?: string; role?: string; content?: unknown } | undefined;
      if (event.type === 'response_item' && payload?.type === 'message' && payload.role === 'user'
        && Array.isArray(payload.content)) {
        const text = (payload.content as Array<{ type?: string; text?: string }>)
          .filter((part) => part?.type === 'input_text').map((part) => part.text ?? '').join('');
        if (text) turns.push({ text, time: eventTime(event) });
      }
    }
    return turns;
  },
};

const ADAPTERS: Record<string, ProviderTranscript> = {
  claude: claudeTranscript,
  kimi: kimiTranscript,
  codex: codexTranscript,
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Polls the recipient's transcript for a user turn containing the marker,
 * bounded by timeoutMs. Runs OUTSIDE the request path — callers fire it
 * asynchronously and amend the envelope when it resolves (M9).
 */
export class TranscriptEffectConfirmer implements EffectConfirmer {
  constructor(private readonly home: string = homedir()) {}

  async confirm(
    target: ConfirmTarget,
    marker: string,
    { timeoutMs = 15_000, pollMs = 500 }: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<EffectProof | null> {
    const adapter = ADAPTERS[target.provider];
    if (!adapter || !target.sessionId) return null;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const proof = this.checkOnce(adapter, target, marker);
      if (proof) return proof;
      if (Date.now() >= deadline) return null;
      await delay(pollMs);
    }
  }

  private checkOnce(adapter: ProviderTranscript, target: ConfirmTarget, marker: string): EffectProof | null {
    const transcript = adapter.locate(target, this.home);
    if (!transcript) return null;
    const turn = this.findMarker(adapter, transcript, marker);
    if (!turn) return null;
    return {
      confirmedAt: new Date().toISOString(),
      transcriptEvent: turn.time !== null ? `time:${turn.time}` : `turn-index:${turn.index}`,
    };
  }

  private findMarker(adapter: ProviderTranscript, transcript: string, marker: string): UserTurn | null {
    const turns = adapter.userTurns(readEvents(transcript));
    for (let index = 0; index < turns.length; index += 1) {
      if (turns[index].text.includes(marker)) return { ...turns[index], index };
    }
    return null;
  }
}
