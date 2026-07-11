import React, { useState, useEffect } from 'react';
import { GitBranch, CornerDownLeft, FileText } from 'lucide-react';
import { TranscriptEvent } from '../index.js';
import { EventRow } from '../board/index.js';
import { EventDetailBody, EventNav, formatClock } from '../details/index.js';
import { getChipLabel } from '../board/timelineModel.js';
import { costOf, formatCost, formatTokens, tokensOf, type CostSettings, type SessionUsage } from '../../lib/cost/index.js';

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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

export interface SubagentState {
  subagents: SubagentMeta[];
  selected: SubagentMeta | null;
  selectAgent: (agentId: string | null) => void;
  subEvents: TranscriptEvent[];
}

/**
 * Shared state for the sub timeline + subagent inspector columns. Selecting a
 * spawn event in the main timeline switches to that spawn's subagent; the
 * picker dropdown can select any subagent directly.
 */
export function useSubagentState(projectDir: string | null, sessionId: string | null, selectedEvent?: TranscriptEvent): SubagentState {
  const [subagents, setSubagents] = useState<SubagentMeta[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [subEvents, setSubEvents] = useState<TranscriptEvent[]>([]);

  // Reload the subagent list whenever the session changes, dropping any selection.
  useEffect(() => {
    let ignore = false;
    setSubagents([]);
    setSelectedAgentId(null);
    if (!projectDir || !sessionId) return;
    fetch(`/api/subagents?project=${projectDir}&session=${sessionId}`)
      .then(res => res.json())
      .then((data: SubagentMeta[]) => { if (!ignore) setSubagents(data); })
      .catch(() => { if (!ignore) setSubagents([]); });
    return () => { ignore = true; };
  }, [projectDir, sessionId]);

  // Clicking a spawn in the main timeline focuses that subagent.
  useEffect(() => {
    if (!selectedEvent?.isAgentSpawn) return;
    const meta = subagents.find(m => m.toolUseId === selectedEvent.toolUseId);
    if (meta) setSelectedAgentId(meta.agentId);
  }, [selectedEvent, subagents]);

  useEffect(() => {
    let ignore = false;
    setSubEvents([]);
    if (!selectedAgentId || !projectDir || !sessionId) return;
    fetch(`/api/subagent-transcript?project=${projectDir}&session=${sessionId}&agent=${selectedAgentId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: TranscriptEvent[]) => { if (!ignore) setSubEvents(data.filter(event => event.kind !== 'usage')); })
      .catch(() => { if (!ignore) setSubEvents([]); });
    return () => { ignore = true; };
  }, [selectedAgentId, projectDir, sessionId]);

  return {
    subagents,
    selected: subagents.find(m => m.agentId === selectedAgentId) ?? null,
    selectAgent: setSelectedAgentId,
    subEvents,
  };
}

interface SubTimelineProps extends SubagentState {
  onSelectSubEvent: (event: TranscriptEvent | null) => void;
  selectedSubEventUuid: string | null;
}

/** Third column: subagent picker + that subagent's event chips. */
export function SubTimeline({ subagents, selected, selectAgent, subEvents, onSelectSubEvent, selectedSubEventUuid }: SubTimelineProps) {
  return (
    <div className="tl-col" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <select
        className="sub-picker"
        value={selected?.agentId ?? ''}
        onChange={(domEvent) => { selectAgent(domEvent.target.value || null); onSelectSubEvent(null); }}
        disabled={subagents.length === 0}
      >
        <option value="">{subagents.length === 0 ? 'no subagents' : '— select subagent —'}</option>
        {subagents.map((meta) => (
          <option key={meta.agentId} value={meta.agentId}>
            {meta.agentType || 'agent'}: {meta.description || meta.agentId}
          </option>
        ))}
      </select>
      <div className="tl-col-title">Sub Timeline</div>
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
              key={event.eventKey || event.uuid || index}
              event={event}
              selected={selectedSubEventUuid === event.uuid}
              onSelect={() => onSelectSubEvent(event)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(events: TranscriptEvent[]): string {
  const stamps = events.map((event) => new Date(event.ts).getTime()).filter((ms) => !Number.isNaN(ms));
  if (stamps.length < 2) return '';
  const totalSeconds = Math.round((Math.max(...stamps) - Math.min(...stamps)) / 1000);
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
  if (!meta) {
    return (
      <div className="insp-col" style={{ borderRight: 'none' }}>
        <div className="insp-header"><span className="insp-title">Subagent Inspector</span></div>
        <div className="tl-col-hint">
          <GitBranch size={24} strokeWidth={1.5} />
          <span>Select a subagent</span>
        </div>
      </div>
    );
  }

  const returnEvent = mainEvents.find(e => e.kind === 'tool_result' && e.toolUseId === meta.toolUseId);
  const subUsage = sessionUsage?.subagents.find(subagent => subagent.agentId === meta.agentId) ?? null;
  const stats = [
    subUsage ? `${formatTokens(tokensOf(subUsage))} tok · ${formatCost(costOf(subUsage, costSettings), costSettings.currency)}` : '',
    formatDuration(subEvents),
  ].filter(Boolean).join(' · ');

  return (
    <div className="insp-col" style={{ borderRight: 'none' }}>
      <div className="insp-header">
        <span className="insp-title">Subagent Inspector</span>
        <span className="insp-subtitle" title={meta.description}>
          <GitBranch size={12} color="var(--kind-tool)" />
          {meta.description || 'subagent'}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
          <CornerDownLeft size={11} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Return</span>
        </div>
        {returnEvent ? (
          <pre style={{ color: returnEvent.isError ? 'var(--kind-error)' : 'var(--text-primary)' }}>
            {truncate(returnEvent.content || '', 600)}
          </pre>
        ) : (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>no return recorded</span>
        )}
      </div>
    </div>
  );
}
