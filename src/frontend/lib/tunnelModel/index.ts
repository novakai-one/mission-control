// Tunnel feed read model. Agent↔agent envelopes (DMs + #team posts) rendered
// in the anti-prose grammar: tiny mono route label, body, delivery state in
// the meta line. History comes from GET /api/messages; live envelopes ride
// the shared ws as { event: 'message-envelope', payload } frames. Status
// amendments reuse the envelope id — the feed folds by id, later wins.
import { useEffect, useState } from 'react';
import { connect, onMessageEnvelope } from '../agentSocket/index.js';

/** Frontend mirror of src/backend/messaging/types.ts MessageEnvelope. */
export interface TunnelEnvelope {
  id: string;
  from: string;
  to: string;
  delivery: 'normal' | 'interrupt';
  body: string;
  threadId?: string;
  createdAt: string;
  status: 'queued' | 'delivered' | 'failed';
}

/** Same id replaces in place (status amendment); a new id appends. */
export function upsertEnvelope(feed: TunnelEnvelope[], envelope: TunnelEnvelope): TunnelEnvelope[] {
  const index = feed.findIndex((entry) => entry.id === envelope.id);
  if (index === -1) return [...feed, envelope];
  const next = feed.slice();
  next[index] = envelope;
  return next;
}

/** History snapshot under any live frames that landed while it was in flight. */
export function mergeFeed(history: TunnelEnvelope[], live: TunnelEnvelope[]): TunnelEnvelope[] {
  return live.reduce(upsertEnvelope, history);
}

/** "claude-1 → codex-2" / "claude-1 → #team" — the tiny mono route label. */
export function formatRoute(envelope: TunnelEnvelope): string {
  return `${envelope.from} → ${envelope.to}`;
}

/** Meta-line delivery state. A failure names who IS reachable — the roster
 * hint — because the fix is almost always a misspelled agent name. */
export function statusMeta(envelope: TunnelEnvelope, liveNames: string[]): string {
  if (envelope.status !== 'failed') return envelope.status;
  return liveNames.length > 0 ? `failed — live: ${liveNames.join(', ')}` : 'failed — no live agents';
}

function isEnvelope(payload: unknown): payload is TunnelEnvelope {
  const candidate = payload as TunnelEnvelope | null;
  return typeof candidate?.id === 'string' && typeof candidate.from === 'string'
    && typeof candidate.to === 'string' && typeof candidate.createdAt === 'string';
}

/** Live tunnel feed: one fetch of history on mount, then ws frames upserted
 * over it. The agentSocket singleton carries the frames; connect() is
 * idempotent so this hook never races the rest of the app. */
export function useTunnelFeed(): TunnelEnvelope[] {
  const [feed, setFeed] = useState<TunnelEnvelope[]>([]);

  useEffect(() => {
    let cancelled = false; connect();
    fetch('/api/messages')
      .then((response) => response.json())
      .then((data: { messages?: TunnelEnvelope[] }) => {
        if (!cancelled) setFeed((live) => mergeFeed(data.messages ?? [], live));
      })
      .catch(() => {});
    const unsubscribe = onMessageEnvelope((payload) => {
      if (!cancelled && isEnvelope(payload)) setFeed((current) => upsertEnvelope(current, payload));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return feed;
}
