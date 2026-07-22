// Append-only JSONL message store — the audit record of every send
// (docs/agent-messaging.md R3). Status transitions append an amended copy of
// the envelope (same id) rather than rewriting history; readers fold by id,
// last line wins. The folded index lives in memory and is maintained from
// appends; a size/mtime probe on the file triggers a re-fold when an outside
// writer (hand edit, nvk-msg file fallback) changed it. Writes stay
// synchronous inside one process — the event loop is the single writer.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { TEAM_CHANNEL } from '../types.js';
import type { ChannelQuery, MessageEnvelope, MessageQuery } from '../types.js';

interface FileFingerprint {
  size: number;
  mtimeMs: number;
}

export class MessageStore {
  private appendListener: ((envelope: MessageEnvelope) => void) | null = null;
  private byId: Map<string, MessageEnvelope> | null = null;
  private fingerprint: FileFingerprint | null = null;

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
    if (this.byId) {
      // Snapshot: the router mutates the routed envelope's status after
      // appending, and the index must hold what was recorded.
      this.byId.set(envelope.id, { ...envelope });
      this.fingerprint = this.probe();
    }
    // Notify with a snapshot: the router mutates the routed envelope's status
    // after appending, and listeners must see what was recorded, not what the
    // object became later.
    this.appendListener?.({ ...envelope });
  }

  /** Append an amended copy with the new status; returns it, or null if the id is unknown. */
  updateStatus(id: string, status: MessageEnvelope['status']): MessageEnvelope | null {
    const current = this.folded().get(id);
    if (!current) return null;
    const updated: MessageEnvelope = { ...current, status };
    this.append(updated);
    return updated;
  }

  history(query: MessageQuery = {}): MessageEnvelope[] {
    let envelopes = Array.from(this.fresh().values());
    if (query.withAgent !== undefined) {
      const agent = query.withAgent;
      envelopes = envelopes.filter((message) => message.from === agent || message.to === agent);
    }
    if (query.withRoom !== undefined) {
      const room = query.withRoom;
      envelopes = envelopes.filter((message) => message.to === room);
    }
    if (query.threadId !== undefined)
      envelopes = envelopes.filter((message) => message.threadId === query.threadId);
    if (query.missionId !== undefined)
      envelopes = envelopes.filter((message) => message.missionId === query.missionId);
    if (query.since !== undefined) {
      const since = query.since;
      envelopes = envelopes.filter((message) => message.createdAt >= since);
    }
    if (query.limit !== undefined && query.limit > 0)
      envelopes = envelopes.slice(-query.limit);
    return envelopes;
  }

  /** #team is pull-only: readers query the record, nothing is pushed (§4). */
  readChannel(query: ChannelQuery = {}): MessageEnvelope[] {
    return this.history({ withAgent: TEAM_CHANNEL, ...query });
  }

  /** The in-memory index as-is — folds once, never re-probes (updateStatus stays atomic). */
  private folded(): Map<string, MessageEnvelope> {
    if (!this.byId) this.refold();
    return this.byId!;
  }

  /** The index, re-folded first when the file changed under us (hand edits, CLI fallback). */
  private fresh(): Map<string, MessageEnvelope> {
    const probe = this.probe();
    const unchanged = probe !== null
      && this.fingerprint !== null
      && probe.size === this.fingerprint.size
      && probe.mtimeMs === this.fingerprint.mtimeMs;
    if (!this.byId || !unchanged) this.refold();
    return this.byId!;
  }

  private refold(): void {
    const folded = new Map<string, MessageEnvelope>();
    for (const line of this.readLines()) folded.set(line.id, line);
    this.byId = folded;
    this.fingerprint = this.probe();
  }

  private probe(): FileFingerprint | null {
    if (!existsSync(this.storePath)) return null;
    const stats = statSync(this.storePath);
    return { size: stats.size, mtimeMs: stats.mtimeMs };
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
