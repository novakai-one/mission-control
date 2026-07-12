import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, CornerDownLeft, FileText } from 'lucide-react';
import { TranscriptEvent } from '../index.js';
import { EventRow } from '../board/index.js';
import { EventDetailBody, EventNav, formatClock, truncate } from '../details/index.js';
import { getChipLabel, selKey } from '../board/timelineModel.js';
import { upsertEvent } from '../../lib/upsertEvents.js';
import { costOf, formatCost, formatTokens, tokensOf, type CostSettings, type SessionUsage } from '../../lib/cost/index.js';
import './index.css';

// SubagentMeta lives backend-side (src/backend/transcript/parser.ts) and cannot be
// imported by the frontend build — kept in sync with the frozen API contract by hand.
export interface SubagentMeta {
  agentId: string;
  agentType: string;
  description: string;
  toolUseId: string;
  spawnDepth: number;
  modified: number;
  size: number;
}

export interface SubagentState {
  subagents: SubagentMeta[];
  selected: SubagentMeta | null;
  selectAgent: (agentId: string | null) => void;
  focusSpawn: (toolUseId: string) => void;
  onLiveEvent: (subagentId: string, event: TranscriptEvent) => void;
  subEvents: TranscriptEvent[];
}

/**
 * Shared state for the sub timeline + subagent inspector columns.
 *
 * Selection changes only on explicit user action: the picker dropdown
 * (selectAgent) or clicking a spawn in the main timeline (focusSpawn) — never
 * as a side effect of live websocket traffic, which previously snapped the
 * dropdown back to the last-clicked spawn on every frame.
 */
export function useSubagentState(projectDir: string | null, sessionId: string | null): SubagentState {
  const [subagents, setSubagents] = useState<SubagentMeta[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [pendingSpawn, setPendingSpawn] = useState<string | null>(null);
  const [subEvents, setSubEvents] = useState<TranscriptEvent[]>([]);
  const [listNonce, setListNonce] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session switch drops all subagent state and any armed list refresh.
  useEffect(() => {
    setSubagents([]);
    setSelectedAgentId(null);
    setPendingSpawn(null);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, [projectDir, sessionId]);

  // (Re)load the list; listNonce bumps when live frames reveal agents we don't know yet.
  useEffect(() => {
    let ignore = false;
    if (!projectDir || !sessionId) return;
    fetch(`/api/subagents?project=${projectDir}&session=${sessionId}`)
      .then(res => res.json())
      .then((data: SubagentMeta[]) => { if (!ignore) setSubagents(data); })
      .catch(() => {});
    return () => { ignore = true; };
  }, [projectDir, sessionId, listNonce]);

  // A clicked spawn that the current list can't match gets ONE fresh list
  // fetch to resolve against (covers just-spawned agents). If that refreshed
  // list still lacks it, the pending focus is dropped — never left armed to
  // hijack the picker minutes later.
  const pendingListRef = useRef<SubagentMeta[] | null>(null);
  function focusSpawn(toolUseId: string): void {
    const matched = subagents.find(entry => entry.toolUseId === toolUseId);
    if (matched) {
      setSelectedAgentId(matched.agentId);
      return;
    }
    pendingListRef.current = subagents;
    setPendingSpawn(toolUseId);
    setListNonce(nonce => nonce + 1);
  }

  useEffect(() => {
    if (!pendingSpawn) return;
    const meta = subagents.find(m => m.toolUseId === pendingSpawn);
    if (meta) {
      setSelectedAgentId(meta.agentId);
      setPendingSpawn(null);
    } else if (subagents !== pendingListRef.current) {
      setPendingSpawn(null); // the refreshed list still has no such spawn
    }
  }, [pendingSpawn, subagents]);

  useEffect(() => {
    let ignore = false;
    setSubEvents([]);
    if (!selectedAgentId || !projectDir || !sessionId) return;
    fetch(`/api/subagent-transcript?project=${projectDir}&session=${sessionId}&agent=${selectedAgentId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: TranscriptEvent[]) => {
        if (ignore) return;
        // Live frames may have landed while the fetch was in flight; upsert
        // them over the file snapshot instead of discarding them.
        setSubEvents(prev => prev.reduce(
          (merged, liveEvent) => upsertEvent(merged, liveEvent),
          data.filter(event => event.kind !== 'usage'),
        ));
      })
      .catch(() => { if (!ignore) setSubEvents([]); });
    return () => { ignore = true; };
  }, [selectedAgentId, projectDir, sessionId]);

  function onLiveEvent(subagentId: string, event: TranscriptEvent): void {
    if (event?.kind === 'usage') return; // usage frames drive the cost refetch, not rows
    if (subagentId === selectedAgentId) {
      setSubEvents(prev => upsertEvent(prev, event));
    }
    if (!subagents.some(m => m.agentId === subagentId) && !refreshTimer.current) {
      // Unknown agent spawned mid-session: refresh the list. Throttle (arm
      // once, not trailing-debounce) so a fast stream can't starve the fetch.
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        setListNonce(nonce => nonce + 1);
      }, 1000);
    }
  }

  return {
    subagents,
    selected: subagents.find(m => m.agentId === selectedAgentId) ?? null,
    selectAgent: (agentId) => { setPendingSpawn(null); setSelectedAgentId(agentId); },
    focusSpawn,
    onLiveEvent,
    subEvents,
  };
}

interface SubTimelineProps extends SubagentState {
  onSelectSubEvent: (event: TranscriptEvent | null) => void;
  selectedSubKey: string | null;
}

/** Third column: subagent picker + that subagent's event chips. */
export function SubTimeline({ subagents, selected, selectAgent, subEvents, onSelectSubEvent, selectedSubKey }: SubTimelineProps) {
  return (
    <div className="tl-col">
      <div className="u-section-title tl-col-title">Sub Timeline</div>
      {subagents.length > 0 && (
        <select
          className="sub-picker"
          value={selected?.agentId ?? ''}
          onChange={(domEvent) => { selectAgent(domEvent.target.value || null); onSelectSubEvent(null); }}
        >
          <option value="" disabled>Select subagent…</option>
          {subagents.map((meta) => (
            <option key={meta.agentId} value={meta.agentId}>
              {meta.agentType || 'agent'}: {meta.description || meta.agentId}
            </option>
          ))}
        </select>
      )}
      {!selected ? (
        <div className="tl-col-hint">
          <GitBranch size={24} strokeWidth={1.5} />
          <span>{subagents.length === 0 ? 'No subagents in this session' : 'Select a subagent'}</span>
        </div>
      ) : subEvents.length === 0 ? (
        <div className="tl-col-hint">
          <FileText size={22} strokeWidth={1.5} />
          <span>No events</span>
        </div>
      ) : (
        <div className="tl-col-scroll">
          {subEvents.map((event, index) => (
            <EventRow
              key={selKey(event) || index}
              event={event}
              selected={selectedSubKey === selKey(event)}
              onSelect={() => onSelectSubEvent(event)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Transcript events are chronological, so first/last bound the duration.
function formatDuration(events: TranscriptEvent[]): string {
  if (events.length < 2) return '';
  const start = new Date(events[0].ts).getTime();
  const end = new Date(events[events.length - 1].ts).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return '';
  const totalSeconds = Math.round((end - start) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

interface SubagentInspectorProps {
  meta: SubagentMeta | null;
  subEvents: TranscriptEvent[];
  event: TranscriptEvent | null;
  onNavigate: (event: TranscriptEvent | null) => void;
  mainEvents: TranscriptEvent[];
  sessionUsage: SessionUsage | null;
  costSettings: CostSettings;
}

/** Fourth column: detail view of the selected sub-timeline event, plus the spawn's return value. */
export function SubagentInspector({ meta, subEvents, event, onNavigate, mainEvents, sessionUsage, costSettings }: SubagentInspectorProps) {
  const returnEvent = useMemo(
    () => (meta ? mainEvents.find(e => e.kind === 'tool_result' && e.toolUseId === meta.toolUseId) : undefined),
    [mainEvents, meta?.toolUseId],
  );

  if (!meta) {
    return (
      <div className="insp-col insp-col-last">
        <div className="insp-header"><span className="u-section-title">Subagent Inspector</span></div>
        <div className="tl-col-hint">
          <GitBranch size={24} strokeWidth={1.5} />
          <span>Select a subagent</span>
        </div>
      </div>
    );
  }

  const subUsage = sessionUsage?.subagents.find(subagent => subagent.agentId === meta.agentId) ?? null;
  const stats = [
    subUsage ? `${formatTokens(tokensOf(subUsage))} tok · ${formatCost(costOf(subUsage, costSettings), costSettings.currency)}` : '',
    formatDuration(subEvents),
  ].filter(Boolean).join(' · ');

  return (
    <div className="insp-col insp-col-last">
      <div className="insp-header">
        <span className="u-section-title">Subagent Inspector</span>
        <span className="insp-subtitle" title={meta.description}>
          <GitBranch size={12} color="var(--kind-tool)" />
          from: {meta.description || 'subagent'}
          {event && <> › {getChipLabel(event)} · {formatClock(event.ts)}</>}
          {meta.agentType && <> · {meta.agentType}</>}
        </span>
      </div>
      {event ? (
        <>
          <div className="insp-body">
            <EventDetailBody event={event} />
          </div>
          <EventNav events={subEvents} current={event} onNavigate={onNavigate} extra={stats || undefined} />
        </>
      ) : (
        <div className="tl-col-hint">
          <FileText size={22} strokeWidth={1.5} />
          <span>Select an event from the sub timeline</span>
        </div>
      )}
      <div className="sub-return">
        <div className="u-section-title sub-return-heading">
          <CornerDownLeft size={11} color="var(--text-secondary)" />
          <span>Return</span>
        </div>
        {returnEvent ? (
          <pre className={returnEvent.isError ? 'sub-return-error' : 'sub-return-body'}>
            {truncate(returnEvent.content || '', 600)}
          </pre>
        ) : (
          <span className="sub-return-empty">no return recorded</span>
        )}
      </div>
    </div>
  );
}
