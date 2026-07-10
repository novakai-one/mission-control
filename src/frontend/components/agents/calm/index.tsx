import React, { useEffect, useRef, useState } from 'react';
import { GitBranch, Radio } from 'lucide-react';
import * as agentSocket from '../../../lib/agentSocket/index.js';
import type { SubagentSummary } from '../../../lib/agentSocket/index.js';
import { upsertEvent } from '../../../lib/upsertEvents.js';
import { EVENT_ICONS, getEventLabel } from '../../board/index.js';
import './index.css';

// Mirrors src/frontend/components/index.tsx TranscriptEvent — duplicated locally
// (rather than imported) because that file is owned by a parallel task and this
// dir's import surface is restricted to agentSocket/upsertEvents/board/react.
interface CalmEvent {
  kind: string;
  eventKey?: string;
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  ts: string;
  isSidechain?: boolean;
  text?: string;
  tool?: string;
  toolUseId?: string;
  input?: unknown;
  isAgentSpawn?: boolean;
  agentDescription?: string;
  agentPrompt?: string;
  agentType?: string;
  content?: string;
  isError?: boolean;
  hookName?: string;
  hookEvent?: string;
  mode?: string;
  permissionMode?: string;
  summary?: string;
}

interface SubagentEntry {
  summary: SubagentSummary;
  lastEvent: CalmEvent | null;
  count: number;
  seenKeys: Set<string>;
}

interface CalmAgent {
  agentId: string;
  sessionId: string;
  projectDir: string;
  title: string;
}

interface CalmViewProps {
  agent: CalmAgent;
  visible: boolean;
}

const NEAR_BOTTOM_PIXELS = 120;

function mergeSubagentSummaries(
  previous: Record<string, SubagentEntry>,
  summaries: SubagentSummary[],
): Record<string, SubagentEntry> {
  const next: Record<string, SubagentEntry> = {};
  for (const summary of summaries) {
    const existing = previous[summary.subagentId];
    next[summary.subagentId] = existing
      ? { ...existing, summary }
      : { summary, lastEvent: null, count: 0, seenKeys: new Set() };
  }
  return next;
}

// Reconnect re-watches from offset 0 (SessionWatcher), which can re-emit
// subagent-events already counted before the drop — dedupe by eventKey so
// count/lastEvent don't double-advance on reconnect.
function recordSubagentEvent(
  previous: Record<string, SubagentEntry>,
  subagentId: string,
  event: CalmEvent,
): Record<string, SubagentEntry> {
  const existing = previous[subagentId];
  if (!existing) return previous;
  const eventKey = event.eventKey;
  if (eventKey && existing.seenKeys.has(eventKey)) return previous;
  const seenKeys = eventKey ? new Set(existing.seenKeys).add(eventKey) : existing.seenKeys;
  const entry: SubagentEntry = { summary: existing.summary, lastEvent: event, count: existing.count + 1, seenKeys };
  return { ...previous, [subagentId]: entry };
}

function isSubagentDone(events: CalmEvent[], toolUseId: string): boolean {
  return events.some(event => event.kind === 'tool_result' && event.toolUseId === toolUseId);
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function EventRow({ event }: { event: CalmEvent }): React.JSX.Element {
  const icon = EVENT_ICONS[event.kind] ?? <Radio size={11} color="var(--text-muted)" />;
  const isAssistantText = event.kind === 'assistant_text';

  return (
    <div className="calm-row">
      <span className="calm-row-time">{formatTime(event.ts)}</span>
      <span className="calm-row-icon">{icon}</span>
      {isAssistantText ? (
        <p className={`calm-row-text calm-kind-${event.kind}`}>{event.text}</p>
      ) : (
        <span className={`calm-row-label calm-kind-${event.kind}`}>{getEventLabel(event)}</span>
      )}
    </div>
  );
}

function SubagentRow({ entry, done }: { entry: SubagentEntry; done: boolean }): React.JSX.Element {
  const { summary, lastEvent, count } = entry;
  const preview = lastEvent ? getEventLabel(lastEvent) : 'waiting for activity…';

  return (
    <div className="calm-subagent-row">
      <div className="calm-subagent-head">
        <GitBranch size={11} color="#c9b57a" />
        <span className="calm-subagent-desc">{summary.description || 'subagent'}</span>
        <span className="calm-subagent-type">{summary.agentType || 'default'}</span>
      </div>
      <div className="calm-subagent-activity">{preview}</div>
      <div className="calm-subagent-footer">
        <span className={done ? 'calm-status-done' : 'calm-status-running'}>{done ? '✓ done' : '● running'}</span>
        <span className="calm-subagent-count">{count} events</span>
      </div>
    </div>
  );
}

export function CalmView({ agent, visible }: CalmViewProps): React.JSX.Element {
  const [events, setEvents] = useState<CalmEvent[]>([]);
  const [subagents, setSubagents] = useState<Record<string, SubagentEntry>>({});
  const feedRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  // Mount once per agent (this component stays mounted for the agent's lifetime,
  // hidden via CSS — see AgentsView). Reconnect re-watching is handled inside the
  // lib; unsubscribe on unmount so a remount doesn't accumulate duplicate listeners.
  useEffect(() => {
    agentSocket.watchSession(agent.projectDir, agent.sessionId);

    const unsubTranscript = agentSocket.onTranscriptEvent((sessionId, event) => {
      if (sessionId !== agent.sessionId) return;
      setEvents(previous => upsertEvent(previous, event as CalmEvent));
    });

    const unsubSubagentsChanged = agentSocket.onSubagentsChanged((sessionId, summaries) => {
      if (sessionId !== agent.sessionId) return;
      setSubagents(previous => mergeSubagentSummaries(previous, summaries));
    });

    const unsubSubagentEvent = agentSocket.onSubagentEvent((sessionId, subagentId, event) => {
      if (sessionId !== agent.sessionId) return;
      setSubagents(previous => recordSubagentEvent(previous, subagentId, event as CalmEvent));
    });

    return () => {
      unsubTranscript();
      unsubSubagentsChanged();
      unsubSubagentEvent();
    };
  }, [agent.projectDir, agent.sessionId]);

  // Auto-scroll to newest only when visible and the viewer was already near the bottom.
  useEffect(() => {
    if (!visible) return;
    const node = feedRef.current;
    if (!node || !stickToBottomRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [events, visible]);

  function handleFeedScroll(): void {
    const node = feedRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottomRef.current = distance < NEAR_BOTTOM_PIXELS;
  }

  const subagentList = Object.values(subagents);
  const rootClass = visible ? 'calm-view' : 'calm-view calm-view-hidden';

  return (
    <div className={rootClass}>
      <div className="calm-feed" ref={feedRef} onScroll={handleFeedScroll}>
        {events.length === 0 ? (
          <div className="calm-empty">waiting for activity…</div>
        ) : (
          events.map(event => <EventRow key={event.eventKey ?? event.uuid} event={event} />)
        )}
      </div>
      {subagentList.length > 0 && (
        <div className="calm-subagents">
          <div className="calm-subagents-heading">subagents</div>
          <div className="calm-subagents-list">
            {subagentList.map(entry => (
              <SubagentRow
                key={entry.summary.subagentId}
                entry={entry}
                done={isSubagentDone(events, entry.summary.toolUseId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
