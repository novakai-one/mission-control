// Append-only JSONL message store — the audit record of every send
// (docs/agent-messaging.md R3). Status transitions append an amended copy of
// the envelope (same id) rather than rewriting history; readers fold by id,
// last line wins. The file is re-read on every query so writes from the
// file-fallback CLI stay visible while the server runs.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { TEAM_CHANNEL } from '../types.js';
import type { ChannelQuery, MessageEnvelope, MessageQuery } from '../types.js';

export class MessageStore {
  private appendListener: ((envelope: MessageEnvelope) => void) | null = null;

  constructor(
    private readonly storePath = path.join(process.cwd(), '.novakai-command', 'messages.jsonl'),
  ) {}

  /** Fires on every appended line — sends AND status transitions. */
  onAppend(listener: (envelope: MessageEnvelope) => void): void {
    this.appendListener = listener;
  }

  append(envelope: MessageEnvelope): void {
    mkdirSync(path.dirname(this.storePath), { recursive: true });
    appendFileSync(this.storePath, JSON.stringify(envelope) + '\n');
    // Notify with a snapshot: the router mutates the routed envelope's status
    // after appending, and listeners must see what was recorded, not what the
    // object became later.
    this.appendListener?.({ ...envelope });
  }

  /** Append an amended copy with the new status; returns it, or null if the id is unknown. */
  updateStatus(id: string, status: MessageEnvelope['status']): MessageEnvelope | null {
    const current = this.fold().get(id);
    if (!current) return null;
    const updated: MessageEnvelope = { ...current, status };
    this.append(updated);
    return updated;
  }

  history(query: MessageQuery = {}): MessageEnvelope[] {
    let envelopes = Array.from(this.fold().values());
    if (query.withAgent !== undefined) {
      const agent = query.withAgent;
      envelopes = envelopes.filter((message) => message.from === agent || message.to === agent);
    }
    if (query.threadId !== undefined) {
      envelopes = envelopes.filter((message) => message.threadId === query.threadId);
    }
    if (query.since !== undefined) {
      const since = query.since;
      envelopes = envelopes.filter((message) => message.createdAt >= since);
    }
    if (query.limit !== undefined && query.limit > 0) {
      envelopes = envelopes.slice(-query.limit);
    }
    return envelopes;
  }

  /** #team is pull-only: readers query the record, nothing is pushed (§4). */
  readChannel(query: ChannelQuery = {}): MessageEnvelope[] {
    return this.history({ withAgent: TEAM_CHANNEL, ...query });
  }

  /** Fold the entry lines by id — later lines (status amendments) win, first-seen order kept. */
  private fold(): Map<string, MessageEnvelope> {
    const byId = new Map<string, MessageEnvelope>();
    for (const line of this.readLines()) byId.set(line.id, line);
    return byId;
  }

  private readLines(): MessageEnvelope[] {
    if (!existsSync(this.storePath)) return [];
    const lines: MessageEnvelope[] = [];
    for (const entry of readFileSync(this.storePath, 'utf8').split('\n')) {
      if (!entry.trim()) continue;
      try {
        const parsed = JSON.parse(entry) as MessageEnvelope;
        if (typeof parsed?.id === 'string') lines.push(parsed);
      } catch {
        // a torn/corrupt line never blocks the rest of the audit record
      }
    }
    return lines;
  }
}
