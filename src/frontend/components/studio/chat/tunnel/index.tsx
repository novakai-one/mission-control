// Tunnel lens — the unified messenger inside the AI panel. Left rail carries
// presence + every conversation (rooms, DMs, #team as one list); the center
// is the selected lane's transcript and composer, where Chris posts as
// 'chris'. Calm grammar throughout: near-monochrome, at most ONE amber across
// the messenger (the lane whose newest word asks for Chris — selecting it
// releases the accent), 700ms motion.
import React, { useEffect, useMemo, useState } from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import { messageItemId, useAttention } from '../../../../lib/attention/index.js';
import {
  CHRIS,
  buildConversations,
  conversationIdsFor,
  latestChrisQuestion,
  liveRoster,
  messagesFor,
  useTunnelRooms,
  type Conversation,
  type ConversationId,
  type TunnelEnvelope,
  type TunnelRoom,
} from '../../../../lib/tunnelModel/index.js';
import type { MentionTarget } from '../../../../lib/mentions/index.js';
import {
  advanceCursor,
  saveLane,
  savedLane,
  unreadCountFor,
  useReadCursors,
} from '../../../../lib/readCursor/index.js';
import { MessengerRail } from './rail/index.js';
import { MessengerComposer, Transcript } from './transcript/index.js';
import './index.css';

interface TunnelMessengerProps {
  /** The live feed — owned by the panel so attention works on every lens. */
  feed: TunnelEnvelope[];
  /** Every known agent — presence roster and the failed-send roster hint. */
  agents: AgentInfo[];
  /** Mention universe: object names in bodies become linked mentions. */
  targets: MentionTarget[];
  /** Resolving an attention item releases the app's single amber. */
  onResolve(itemId: string): void;
  /** Backfills one lane's history when it is opened. */
  onLoadConversation(id: ConversationId): void;
}

async function postJson(path: string, payload: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(failure?.error ?? `HTTP ${response.status}`);
  }
  return response.json();
}

/** The lane a message-attention item points at (its sender's lane). */
function laneOf(feed: TunnelEnvelope[], attentionId: string | null): ConversationId | null {
  if (!attentionId?.startsWith('message:')) return null;
  const envelopeId = attentionId.slice('message:'.length);
  const envelope = feed.find((entry) => entry.id === envelopeId);
  return envelope ? conversationIdsFor(envelope)[0] ?? null : null;
}

export function TunnelMessenger({ feed, agents, targets, onResolve, onLoadConversation }: TunnelMessengerProps) {
  const { rooms, ingestRoom } = useTunnelRooms();
  const roster = useMemo(() => liveRoster(agents), [agents]);
  const conversations = useMemo(() => buildConversations(feed, rooms, roster), [feed, rooms, roster]);
  const [selectedId, setSelectedId] = useState<ConversationId | null>(null);
  const attention = useAttention();
  const cursors = useReadCursors();

  // Unread per lane — DERIVED from feed past each ReadCursor (C21), never a
  // second store.
  const unread = useMemo(() => {
    const counts: Record<ConversationId, number> = {};
    for (const lane of conversations) counts[lane.id] = unreadCountFor(feed, lane.id, cursors);
    return counts;
  }, [feed, conversations, cursors]);

  // First open restores the lane Chris was in (reload is not a reset); with
  // no memory it lands on the freshest lane. Selection by default never
  // resolves anything — only an explicit click may release the amber.
  useEffect(() => {
    if (selectedId || conversations.length === 0) return;
    const remembered = savedLane();
    const restored = remembered && conversations.find((lane) => lane.id === remembered);
    setSelectedId(restored ? restored.id : conversations[0].id);
  }, [selectedId, conversations]);

  useEffect(() => {
    if (selectedId) onLoadConversation(selectedId);
  }, [selectedId, onLoadConversation]);

  const selected = conversations.find((entry) => entry.id === selectedId) ?? null;
  const goldLane = useMemo(() => laneOf(feed, attention.goldId), [feed, attention.goldId]);
  const settlingLane = useMemo(() => laneOf(feed, attention.settlingId), [feed, attention.settlingId]);
  const question = useMemo(() => latestChrisQuestion(feed), [feed]);

  function select(conversation: Conversation): void {
    setSelectedId(conversation.id);
    saveLane(conversation.id);
    // Answering the ask: opening the asking lane IS the resolution. A failed
    // send keeps its explicit transcript-row resolve instead — seeing the
    // lane is not the same as dealing with the failure.
    if (question && attention.goldId === messageItemId(question.envelopeId)
      && conversation.id === question.conversationId) {
      onResolve(messageItemId(question.envelopeId));
    }
  }

  async function startChat(members: string[], name: string): Promise<void> {
    const data = (await postJson('/api/rooms', {
      name,
      members: [...members, CHRIS],
      from: CHRIS,
    })) as { room: TunnelRoom };
    ingestRoom(data.room);
    setSelectedId(data.room.roomId);
  }

  async function send(body: string): Promise<void> {
    if (!selected) return;
    const recipient = selected.kind === 'dm' ? selected.title : selected.id;
    await postJson('/api/messages', { from: CHRIS, 'to': recipient, delivery: 'normal', body });
  }

  const liveNames = roster.map((entry) => entry.name);

  return (
    <div className="st-ms">
      <MessengerRail
        roster={roster}
        conversations={conversations}
        unread={unread}
        selectedId={selectedId}
        goldId={goldLane}
        settlingId={settlingLane}
        onSelect={select}
        onStartChat={startChat}
      />
      <div className="st-ms-main">
        {selected ? (
          <>
            <div className="st-ms-head">
              <div className="st-ms-title">{selected.title}</div>
              {selected.members && <div className="st-ms-members">{selected.members.join(' · ')}</div>}
            </div>
            <Transcript
              conversation={selected}
              messages={messagesFor(feed, selected.id)}
              liveNames={liveNames}
              targets={targets}
              onResolve={onResolve}
              onSeen={(seenCreatedAt) => advanceCursor(selected.id, seenCreatedAt)}
            />
            <MessengerComposer conversation={selected} onSend={send} />
          </>
        ) : (
          <div className="st-ai-quiet">No conversations yet</div>
        )}
      </div>
    </div>
  );
}
