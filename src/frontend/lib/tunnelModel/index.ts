// Tunnel feed read model. Agent↔agent envelopes (DMs + #team posts) rendered
// in the anti-prose grammar: tiny mono route label, body, delivery state in
// the meta line. History comes from GET /api/messages; live envelopes ride
// the shared ws as { event: 'message-envelope', payload } frames. Status
// amendments reuse the envelope id — the feed folds by id, later wins.
import { useEffect, useRef, useState } from 'react';
import { connect, onMessageEnvelope, onRoomsChanged, type AgentInfo } from '../agentSocket/index.js';

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

/** Reserved member name: Chris has no PTY — the studio ws push is his copy. */
export const CHRIS = 'chris';
export const TEAM_CHANNEL = '#team';

/** Frontend mirror of the Room shape in the tunnel-rooms API contract. */
export interface TunnelRoom {
  roomId: string;          // room_<uuid>
  name: string;
  members: string[];       // agent names + 'chris'
  createdBy: string;
  createdAt: string;
  archived: boolean;
}

export type ConversationId = string; // 'room_<id>' | '#team' | 'dm:<agentName>'

export interface Conversation {
  id: ConversationId;
  kind: 'room' | 'channel' | 'dm';
  title: string;               // room name / '#team' / agent name
  members?: string[];
  lastMessageAt?: string;
}

export function isRoomId(recipient: string): boolean {
  return recipient.startsWith('room_');
}

export function dmId(agentName: string): ConversationId {
  return `dm:${agentName}`;
}

/** Every lane an envelope belongs to. A room post lives in its room, a #team
 * post in the channel; a DM lands in the lane of each non-chris party —
 * sender's lane first — so chris↔agent traffic folds into the agent's single
 * lane and an agent↔agent DM is visible from both agents' lanes. */
export function conversationIdsFor(envelope: TunnelEnvelope): ConversationId[] {
  if (isRoomId(envelope.to)) return [envelope.to];
  if (envelope.to === TEAM_CHANNEL) return [TEAM_CHANNEL];
  const parties = [envelope.from, envelope.to].filter((party) => party !== CHRIS);
  return [...new Set(parties)].map(dmId);
}

export function messagesFor(feed: TunnelEnvelope[], id: ConversationId): TunnelEnvelope[] {
  return feed.filter((envelope) => conversationIdsFor(envelope).includes(id));
}

export interface RosterEntry {
  name: string;
  provider: 'claude' | 'codex';
}

export function liveRoster(agents: Pick<AgentInfo, 'title' | 'provider' | 'status'>[]): RosterEntry[] {
  return agents
    .filter((agent) => agent.status === 'running')
    .map((agent) => ({ name: agent.title, provider: agent.provider }));
}

/** Same roomId replaces in place (amended copy); a new room appends. */
export function upsertRoom(rooms: TunnelRoom[], room: TunnelRoom): TunnelRoom[] {
  const index = rooms.findIndex((entry) => entry.roomId === room.roomId);
  if (index === -1) return [...rooms, room];
  const next = rooms.slice();
  next[index] = room;
  return next;
}

/** Newest activity first, quiet lanes at the end (alphabetical there). */
function byRecency(left: Conversation, right: Conversation): number {
  if (left.lastMessageAt && right.lastMessageAt) return right.lastMessageAt.localeCompare(left.lastMessageAt);
  if (left.lastMessageAt) return -1;
  if (right.lastMessageAt) return 1;
  return left.title.localeCompare(right.title);
}

/** The unified chats list: #team + non-archived rooms + one DM lane per live
 * agent (plus lanes only history knows about, so exited agents' words stay
 * reachable). */
export function buildConversations(
  feed: TunnelEnvelope[],
  rooms: TunnelRoom[],
  roster: RosterEntry[],
): Conversation[] {
  const lastAt = new Map<ConversationId, string>();
  for (const envelope of feed) {
    for (const id of conversationIdsFor(envelope)) {
      const seen = lastAt.get(id);
      if (!seen || envelope.createdAt >= seen) lastAt.set(id, envelope.createdAt);
    }
  }
  const dmNames = new Set(roster.map((entry) => entry.name));
  for (const id of lastAt.keys()) {
    if (id.startsWith('dm:')) dmNames.add(id.slice(3));
  }
  const conversations: Conversation[] = [
    { id: TEAM_CHANNEL, kind: 'channel', title: TEAM_CHANNEL, lastMessageAt: lastAt.get(TEAM_CHANNEL) },
    ...rooms
      .filter((room) => !room.archived)
      .map((room): Conversation => ({
        id: room.roomId,
        kind: 'room',
        title: room.name,
        members: room.members,
        lastMessageAt: lastAt.get(room.roomId),
      })),
    ...[...dmNames].map((name): Conversation => ({
      id: dmId(name),
      kind: 'dm',
      title: name,
      lastMessageAt: lastAt.get(dmId(name)),
    })),
  ];
  return conversations.sort(byRecency);
}

const CHRIS_MENTION = /\bchris\b/i;

export interface ChrisQuestion {
  envelopeId: string;
  conversationId: ConversationId;
  since: string;
}

/** The ONE amber candidate: the most recent conversation whose LATEST message
 * mentions Chris — his name spoken by someone else, still the newest word in
 * that lane. A later message in the lane supersedes it (the need passed); an
 * agent↔agent DM lights only the sender's lane. */
export function latestChrisQuestion(feed: TunnelEnvelope[]): ChrisQuestion | null {
  const latest = new Map<ConversationId, TunnelEnvelope>();
  for (const envelope of feed) {
    for (const id of conversationIdsFor(envelope)) {
      const seen = latest.get(id);
      if (!seen || envelope.createdAt >= seen.createdAt) latest.set(id, envelope);
    }
  }
  let winner: ChrisQuestion | null = null;
  for (const [id, envelope] of latest) {
    if (envelope.from === CHRIS || !CHRIS_MENTION.test(envelope.body)) continue;
    if (conversationIdsFor(envelope)[0] !== id) continue;
    if (!winner || envelope.createdAt > winner.since) {
      winner = { envelopeId: envelope.id, conversationId: id, since: envelope.createdAt };
    }
  }
  return winner;
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

function isTunnelRoom(candidate: unknown): candidate is TunnelRoom {
  const room = candidate as TunnelRoom | null;
  return typeof room?.roomId === 'string' && typeof room.name === 'string' && Array.isArray(room.members);
}

/** Live room roster: one fetch on mount, then `rooms-changed` snapshots over
 * the shared ws. Resilience fallback: a post addressed to a room this client
 * has never seen means the roster moved while we weren't looking — refetch.
 * ingestRoom folds a POST /api/rooms response in without waiting for the ws. */
export function useTunnelRooms(): { rooms: TunnelRoom[]; ingestRoom: (room: TunnelRoom) => void } {
  const [rooms, setRooms] = useState<TunnelRoom[]>([]);
  const known = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false; connect();
    const apply = (next: TunnelRoom[]): void => {
      if (cancelled) return;
      known.current = new Set(next.map((entry) => entry.roomId));
      setRooms(next);
    };
    const refresh = (): void => {
      fetch('/api/rooms')
        .then((response) => response.json())
        .then((data: { rooms?: unknown[] }) => apply((data.rooms ?? []).filter(isTunnelRoom)))
        .catch(() => {});
    };
    refresh();
    const unsubscribeRooms = onRoomsChanged((payload) => {
      if (Array.isArray(payload)) apply(payload.filter(isTunnelRoom));
    });
    const unsubscribeEnvelopes = onMessageEnvelope((payload) => {
      if (isEnvelope(payload) && isRoomId(payload.to) && !known.current.has(payload.to)) refresh();
    });
    return () => {
      cancelled = true;
      unsubscribeRooms();
      unsubscribeEnvelopes();
    };
  }, []);

  function ingestRoom(room: TunnelRoom): void {
    known.current.add(room.roomId);
    setRooms((current) => upsertRoom(current, room));
  }

  return { rooms, ingestRoom };
}
