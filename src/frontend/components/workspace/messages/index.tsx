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
  type TunnelEnvelope,
} from '../../../lib/tunnelModel/index.js';
import {
  advanceCursor,
  saveLane,
  savedLane,
  unreadCountFor,
  useReadCursors,
} from '../../../lib/readCursor/index.js';
import {
  DENSITY_SCALE,
  MESSAGING_SETTINGS,
  clampRailWidth,
  composerTargetsFor,
  knownAgentsFor,
  loadRailWidths,
  reviewLanesFor,
  roomLabelFor,
  saveRailWidths,
  restoreDecision,
  workingAgentFor,
  type RailWidths,
} from './model.js';
import { SHELL_STYLE, resolveStyle } from './styles/index.js';
import { postJson, useLaneFlows } from './flows/index.js';
import { RoomsRail } from './rail/index.js';
import { MessageFeed, messageRowId } from './thread/index.js';
import { ComposerBar } from './composer/index.js';
import { ContextPanel } from './context/index.js';
import './index.css';

interface MessagesViewProps {
  agents: AgentInfo[];
  /** Roster hydration signal — the D3 restore machine waits on it (S7). */
  agentsLoaded: boolean;
  projects: ProjectRecord[];
  project: ProjectRecord | null;
  openRequest?: MessagesOpenRequest | null;
}

export interface MessagesOpenRequest {
  id: string;
  nonce: number;
}

export function MessagesView({ agents, agentsLoaded, projects, openRequest }: MessagesViewProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const { feed, feedLoaded, loadConversation, ingestEnvelope } = useTunnelFeed();
  const { rooms, roomsLoaded, ingestRoom } = useTunnelRooms();
  const cursors = useReadCursors();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<ConversationId | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [pendingReview, setPendingReview] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [widths, setWidths] = useState<RailWidths>(() => loadRailWidths());
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const roster = useMemo(() => liveRoster(agents), [agents]);
  const conversations = useMemo(
    () => buildConversations(feed, rooms, roster),
    [feed, rooms, roster],
  );
  // Known agents (live + exited + feed-history names) feed the M5 pickers.
  const knownAgents = useMemo(() => knownAgentsFor(agents, feed), [agents, feed]);
  const flows = useLaneFlows({
    ingestRoom,
    openLane: (laneId) => { setSelectedId(laneId); saveLane(laneId); },
  });
  const targets = useMemo(
    () => buildTargets(agents, projects.flatMap((entry) => entry.threads)),
    [agents, projects],
  );
  // The composer picker draws from the KNOWN-agents union (M8a): the live
  // roster alone leaves the picker empty whenever no agent process is up.
  const composerTargets = useMemo(() => composerTargetsFor(knownAgents), [knownAgents]);

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

  // Rail widths ride the same seam: two CSS vars, persisted as one typed object.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty('--msg-rail-w', `${widths.rail}px`);
    root.style.setProperty('--msg-context-w', `${widths.context}px`);
  }, [widths]);

  // Drag a column edge: pointer capture keeps the drag alive off-handle; the
  // width lands on pointerup. Arrow keys on the focused handle nudge ±16px.
  function beginResize(kind: keyof RailWidths) {
    return (down: React.PointerEvent<HTMLElement>) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      down.preventDefault();
      const handle = down.currentTarget;
      handle.setPointerCapture(down.pointerId);
      setResizing(true);
      const move = (event: PointerEvent) => {
        const pixels = kind === 'rail' ? event.clientX - rect.left : rect.right - event.clientX;
        setWidths((current) => ({ ...current, [kind]: clampRailWidth(kind, pixels) }));
      };
      const release = () => {
        handle.removeEventListener('pointermove', move);
        setResizing(false);
        saveRailWidths(widthsRef.current);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', release, { once: true });
    };
  }

  function nudgeWidth(kind: keyof RailWidths) {
    return (press: React.KeyboardEvent<HTMLElement>) => {
      if (press.key !== 'ArrowLeft' && press.key !== 'ArrowRight') return;
      press.preventDefault();
      const delta = (press.key === 'ArrowRight' ? 16 : -16) * (kind === 'rail' ? 1 : -1);
      const next = { ...widthsRef.current, [kind]: clampRailWidth(kind, widthsRef.current[kind] + delta) };
      setWidths(next);
      saveRailWidths(next);
    };
  }

  // Keep the app-wide amber engine fed — unchanged behavior (§6.9).
  useEffect(() => {
    updateAttentionQueue(buildAttentionQueue(null, feed, dismissed));
  }, [feed, dismissed]);

  // First open restores the lane Chris was in (D3, ruling S7): the pure
  // restore machine retains the remembered id while feed/rooms/roster hydrate
  // and falls back only after ALL of them settle. A fallback selection is
  // never saved — the remembered preference survives a broken reload.
  useEffect(() => {
    const decision = restoreDecision({
      selectedId,
      remembered: savedLane() ?? null,
      conversationIds: conversations.map((lane) => lane.id),
      feedLoaded, roomsLoaded, agentsLoaded,
    });
    if (decision.kind === 'restore' || decision.kind === 'fallback') setSelectedId(decision.id);
  }, [selectedId, conversations, feedLoaded, roomsLoaded, agentsLoaded]);

  useEffect(() => {
    if (!openRequest || !conversations.some((lane) => lane.id === openRequest.id)) return;
    setSelectedId(openRequest.id);
    saveLane(openRequest.id);
  }, [openRequest?.nonce, conversations]);

  useEffect(() => {
    if (selectedId) loadConversation(selectedId);
  }, [selectedId, loadConversation]);

  const selected = flows.resolveSelected(conversations, selectedId);

  function select(conversation: Conversation): void {
    setSelectedId(conversation.id);
    saveLane(conversation.id);
    setRailOpen(false); // phone layout: picking a lane dismisses the rail overlay
  }

  // DM flow (M5): the lane is derived, so opening it IS creating it — the
  // overlay in useLaneFlows covers the not-yet-derived lane until the first
  // envelope lands.
  function openDm(name: string): void {
    select(flows.openDm(name));
  }

  async function send(body: string): Promise<void> {
    if (!selected) return;
    const recipient = selected.kind === 'dm' ? selected.title : selected.id;
    const data = (await postJson('/api/user/messages', { 'to': recipient, delivery: 'normal', body })) as { envelope: TunnelEnvelope };
    // The 201 carries the settled envelope — the row leaves "Sending…" on the
    // response, never on the mercy of a dropped ws amendment frame.
    ingestEnvelope(data.envelope);
  }

  // Review = scroll the thread to the failed row AND resolve its amber item.
  // The row may sit outside the current lane or the loaded window: locate it
  // in the feed first, switch lane when it lives elsewhere (the lane-load
  // effect backfills its history), and scroll only once the row is actually
  // rendered. If it never renders, the panel says so — no silent no-op.
  function review(envelopeId: string): void {
    setDismissed((current) => new Set(current).add(messageItemId(envelopeId)));
    setReviewNote(null);
    const lanes = reviewLanesFor(feed, envelopeId);
    if (!lanes) {
      setReviewNote('That message is no longer in the loaded feed.');
      return;
    }
    if (!selected || !lanes.includes(selected.id)) {
      setSelectedId(lanes[0]);
      saveLane(lanes[0]);
    }
    setPendingReview(envelopeId);
  }

  const laneMessages = selected ? messagesFor(feed, selected.id) : [];
  const working = workingAgentFor(laneMessages, agents, Date.now());

  // Scroll the moment the review target's row exists — lane switches and
  // history backfills land asynchronously…
  useEffect(() => {
    if (!pendingReview) return;
    const target = document.getElementById(messageRowId(pendingReview));
    target?.scrollIntoView({ block: 'center' });
    if (target) setPendingReview(null);
  }, [pendingReview, laneMessages]);

  // …but never wait forever: past the typed timeout, say why honestly.
  useEffect(() => {
    if (!pendingReview) return;
    const timer = setTimeout(() => {
      setPendingReview(null); setReviewNote('Could not locate that message in this lane — it may sit outside the loaded history.');
    }, MESSAGING_SETTINGS.review.scrollTimeoutMs);
    return () => clearTimeout(timer);
  }, [pendingReview]);
  // Panel state is a set of style-block attachments swapped through the one
  // resolver seam (doctrine §B) — never ad-hoc class string math.
  const viewClass = resolveStyle(
    SHELL_STYLE.base,
    !contextOpen && SHELL_STYLE.contextClosed,
    railCollapsed && SHELL_STYLE.railCollapsed,
    railOpen && SHELL_STYLE.railOverlayOpen,
    resizing && SHELL_STYLE.resizing,
  );

  return (
    <section className={viewClass} ref={rootRef} aria-label="Messages">
      <RoomsRail
        conversations={conversations}
        unread={unread}
        selectedId={selectedId}
        agents={agents}
        knownAgents={knownAgents}
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((current) => !current)}
        onSelect={select}
        onStartChat={flows.startRoom}
        onOpenDm={openDm}
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
              <span className="msg-ghost-glyph msg-glyph-list" aria-hidden="true" />
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
            <ComposerBar conversation={selected} targets={composerTargets} onSend={send} />
          </>
        ) : (
          <div className="msg-temp">No conversations yet</div>
        )}
        {selected && (
          <button
            type="button"
            className="msg-ghost msg-context-reopen"
            aria-label="Show context panel"
            title="Show context panel"
            onClick={() => setContextOpen(true)}
          >
            <span className="msg-ghost-glyph msg-glyph-show-context" aria-hidden="true" />
          </button>
        )}
      </main>
      {selected && (
        <ContextPanel
          conversation={selected}
          messages={laneMessages}
          agents={agents}
          unreadCount={unread[selected.id] ?? 0}
          working={working}
          reviewNote={reviewNote}
          onReview={review}
          onCollapse={() => setContextOpen(false)}
        />
      )}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize conversations panel"
        tabIndex={0}
        className="msg-resize msg-resize-rail"
        onPointerDown={beginResize('rail')}
        onKeyDown={nudgeWidth('rail')}
      />
      {selected && contextOpen && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize context panel"
          tabIndex={0}
          className="msg-resize msg-resize-context"
          onPointerDown={beginResize('context')}
          onKeyDown={nudgeWidth('context')}
        />
      )}
    </section>
  );
}
