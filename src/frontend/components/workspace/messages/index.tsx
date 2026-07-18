// Messages tab — rebuilt to the storyboard vision (docs/plans/messaging-ui-rebuild.md).
// This view is a lens over the canonical tunnel feed, rooms, roster and read
// cursors; it owns no message store. All visual decisions live in tokens.css,
// all derived behavior in model.ts — the components only render and wire.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ProjectRecord } from '../../../../shared/project/schema.js';
import type { AgentInfo } from '../../../lib/agentSocket/index.js';
import {
  buildAttentionQueue,
  messageItemId,
  updateAttentionQueue,
} from '../../../lib/attention/index.js';
import { buildTargets } from '../../../lib/mentions/index.js';
import {
  buildConversations,
  liveRoster,
  messagesFor,
  useTunnelFeed,
  useTunnelRooms,
  type Conversation,
  type ConversationId,
  type TunnelRoom,
} from '../../../lib/tunnelModel/index.js';
import {
  advanceCursor,
  saveLane,
  savedLane,
  unreadCountFor,
  useReadCursors,
} from '../../../lib/readCursor/index.js';
import { DENSITY_SCALE, MESSAGING_SETTINGS, roomLabelFor, workingAgentFor } from './model.js';
import { RoomsRail } from './rail/index.js';
import { MessageFeed, messageRowId } from './thread/index.js';
import { ComposerBar } from './composer/index.js';
import { ContextPanel } from './context/index.js';
import './index.css';

interface MessagesViewProps {
  agents: AgentInfo[];
  projects: ProjectRecord[];
  project: ProjectRecord | null;
  openRequest?: MessagesOpenRequest | null;
}

export interface MessagesOpenRequest {
  id: string;
  nonce: number;
}

async function postJson(path: string, payload: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { error?: string; roster?: string[] } | null;
    const rosterHint = failure?.roster?.length ? ` (live: ${failure.roster.join(', ')})` : '';
    throw new Error(`${failure?.error ?? `HTTP ${response.status}`}${rosterHint}`);
  }
  return response.json();
}

export function MessagesView({ agents, projects, openRequest }: MessagesViewProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const { feed, loadConversation } = useTunnelFeed();
  const { rooms, ingestRoom } = useTunnelRooms();
  const cursors = useReadCursors();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<ConversationId | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(false);

  const roster = useMemo(() => liveRoster(agents), [agents]);
  const conversations = useMemo(
    () => buildConversations(feed, rooms, roster),
    [feed, rooms, roster],
  );
  const targets = useMemo(
    () => buildTargets(agents, projects.flatMap((entry) => entry.threads)),
    [agents, projects],
  );

  // Unread per lane — DERIVED from feed past each ReadCursor (C21).
  const unread = useMemo(() => {
    const counts: Record<ConversationId, number> = {};
    for (const lane of conversations) counts[lane.id] = unreadCountFor(feed, lane.id, cursors);
    return counts;
  }, [feed, conversations, cursors]);

  // The density knob (owner decision): one CSS var rescales the whole tab.
  useLayoutEffect(() => {
    rootRef.current?.style.setProperty('--msg-scale', String(DENSITY_SCALE[MESSAGING_SETTINGS.density]));
  }, []);

  // Keep the app-wide amber engine fed — unchanged behavior (§6.9).
  useEffect(() => {
    updateAttentionQueue(buildAttentionQueue(null, feed, dismissed));
  }, [feed, dismissed]);

  // First open restores the lane Chris was in; else the freshest lane.
  useEffect(() => {
    if (selectedId || conversations.length === 0) return;
    const remembered = savedLane();
    const restored = remembered && conversations.find((lane) => lane.id === remembered);
    setSelectedId(restored ? restored.id : conversations[0].id);
  }, [selectedId, conversations]);

  useEffect(() => {
    if (!openRequest || !conversations.some((lane) => lane.id === openRequest.id)) return;
    setSelectedId(openRequest.id);
    saveLane(openRequest.id);
  }, [openRequest?.nonce, conversations]);

  useEffect(() => {
    if (selectedId) loadConversation(selectedId);
  }, [selectedId, loadConversation]);

  const selected = conversations.find((lane) => lane.id === selectedId) ?? null;

  function select(conversation: Conversation): void {
    setSelectedId(conversation.id);
    saveLane(conversation.id);
    setRailOpen(false); // phone layout: picking a lane dismisses the rail overlay
  }

  async function startChat(members: string[], name: string): Promise<void> {
    const data = (await postJson('/api/user/rooms', { name, members })) as { room: TunnelRoom };
    ingestRoom(data.room);
    setSelectedId(data.room.roomId);
    saveLane(data.room.roomId);
  }

  async function send(body: string): Promise<void> {
    if (!selected) return;
    const recipient = selected.kind === 'dm' ? selected.title : selected.id;
    await postJson('/api/user/messages', { 'to': recipient, delivery: 'normal', body });
  }

  // Review = scroll the thread to the failed row AND resolve its amber item.
  function review(envelopeId: string): void {
    setDismissed((current) => new Set(current).add(messageItemId(envelopeId)));
    document.getElementById(messageRowId(envelopeId))?.scrollIntoView({ block: 'center' });
  }

  const laneMessages = selected ? messagesFor(feed, selected.id) : [];
  const working = workingAgentFor(laneMessages, agents, Date.now());
  const viewClass = `msg-view${contextOpen ? '' : ' msg-context-closed'}${railOpen ? ' msg-rail-open' : ''}`;

  return (
    <section className={viewClass} ref={rootRef} aria-label="Messages">
      <RoomsRail
        conversations={conversations}
        unread={unread}
        selectedId={selectedId}
        agents={agents}
        roster={roster}
        onSelect={select}
        onStartChat={startChat}
      />
      <main className="msg-thread">
        {selected && (
          <div className="msg-thread-topbar">
            <button
              type="button"
              className="msg-ghost"
              aria-label="Show conversations"
              title="Show conversations"
              onClick={() => setRailOpen((current) => !current)}
            >
              <span className="msg-ghost-glyph" aria-hidden="true" />
            </button>
            <span className="msg-thread-title">
              {selected.kind === 'dm' ? `@ ${selected.title}` : `# ${roomLabelFor(selected)}`}
            </span>
          </div>
        )}
        {selected ? (
          <>
            <MessageFeed
              conversation={selected}
              messages={laneMessages}
              feed={feed}
              agents={agents}
              targets={targets}
              onSeen={(seenCreatedAt) => advanceCursor(selected.id, seenCreatedAt)}
            />
            <ComposerBar conversation={selected} onSend={send} />
          </>
        ) : (
          <div className="msg-temp">No conversations yet</div>
        )}
        {!contextOpen && (
          <button
            type="button"
            className="msg-ghost msg-context-reopen"
            aria-label="Show context panel"
            title="Show context panel"
            onClick={() => setContextOpen(true)}
          >
            <span className="msg-ghost-glyph" aria-hidden="true" />
          </button>
        )}
      </main>
      {selected && contextOpen && (
        <ContextPanel
          conversation={selected}
          messages={laneMessages}
          agents={agents}
          unreadCount={unread[selected.id] ?? 0}
          working={working}
          onReview={review}
          onCollapse={() => setContextOpen(false)}
        />
      )}
    </section>
  );
}
