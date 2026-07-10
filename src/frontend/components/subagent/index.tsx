import React, { useState, useEffect } from 'react';
import { GitBranch, CornerDownLeft, FileText } from 'lucide-react';
import { TranscriptEvent } from '../index.js';
import { EVENT_ICONS, EVENT_COLORS, getEventLabel } from '../board/index.js';

// SubagentMeta lives backend-side (src/backend/transcript/parser.ts) and cannot be
// imported by the frontend build — kept in sync with the frozen API contract by hand.
interface SubagentMeta {
  agentId: string;
  agentType: string;
  description: string;
  toolUseId: string;
  spawnDepth: number;
  modified: number;
  size: number;
}

interface SubagentInspectorProps {
  projectDir: string | null;
  sessionId: string | null;
  selectedEvent?: TranscriptEvent;
  mainEvents: TranscriptEvent[];
  onSelectSubEvent: (ev: TranscriptEvent | null) => void;
  selectedSubEventUuid: string | null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

export function SubagentInspector({ projectDir, sessionId, selectedEvent, mainEvents, onSelectSubEvent, selectedSubEventUuid }: SubagentInspectorProps) {
  const [subagents, setSubagents] = useState<SubagentMeta[]>([]);
  const [subEvents, setSubEvents] = useState<TranscriptEvent[] | null>(null);

  // Reload the subagent list whenever the session changes, and drop any loaded transcript.
  useEffect(() => {
    let ignore = false;
    setSubagents([]);
    setSubEvents(null);
    if (!projectDir || !sessionId) return;
    fetch(`/api/subagents?project=${projectDir}&session=${sessionId}`)
      .then(res => res.json())
      .then((data: SubagentMeta[]) => { if (!ignore) setSubagents(data); })
      .catch(() => { if (!ignore) setSubagents([]); });
    return () => { ignore = true; };
  }, [projectDir, sessionId]);

  const matchedMeta = selectedEvent?.isAgentSpawn
    ? subagents.find(m => m.toolUseId === selectedEvent.toolUseId)
    : undefined;

  useEffect(() => {
    let ignore = false;
    setSubEvents(null);
    if (!matchedMeta || !projectDir || !sessionId) return;
    fetch(`/api/subagent-transcript?project=${projectDir}&session=${sessionId}&agent=${matchedMeta.agentId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: TranscriptEvent[]) => { if (!ignore) setSubEvents(data); })
      .catch(() => { if (!ignore) setSubEvents([]); });
    return () => { ignore = true; };
  }, [matchedMeta?.agentId, projectDir, sessionId]);

  const containerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', width: '100%',
    backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)',
    overflow: 'hidden',
  };

  if (!selectedEvent?.isAgentSpawn) {
    return (
      <div style={{
        ...containerStyle, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
        gap: '0.8rem', padding: '2rem', textAlign: 'center',
      }}>
        <GitBranch size={24} strokeWidth={1.5} />
        <span style={{ fontSize: '0.75rem' }}>SELECT A SUBAGENT SPAWN</span>
      </div>
    );
  }

  if (!matchedMeta) {
    return (
      <div style={{
        ...containerStyle, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
        gap: '0.8rem', padding: '2rem', textAlign: 'center',
      }}>
        <GitBranch size={24} strokeWidth={1.5} />
        <span style={{ fontSize: '0.75rem' }}>NO SUBAGENT TRANSCRIPT FOUND FOR THIS SPAWN</span>
      </div>
    );
  }

  const returnEvent = mainEvents.find(e => e.kind === 'tool_result' && e.toolUseId === matchedMeta.toolUseId);
  const events = subEvents ?? [];

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <GitBranch size={14} color="#c9b57a" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {matchedMeta.description || 'subagent'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          <span>{matchedMeta.agentType || 'default'}</span>
          <span>{events.length} events</span>
        </div>
      </div>

      {/* Subagent event timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {events.length === 0 ? (
          <div style={{
            display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text-muted)', gap: '0.8rem'
          }}>
            <FileText size={22} strokeWidth={1.5} />
            <span style={{ fontSize: '0.7rem' }}>No events</span>
          </div>
        ) : (
          events.map((ev, i) => (
            <div
              key={ev.uuid || i}
              onClick={() => onSelectSubEvent(ev)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.3rem 0.5rem',
                borderRadius: '4px', cursor: 'pointer',
                backgroundColor: selectedSubEventUuid === ev.uuid ? 'var(--bg-tertiary)' : 'transparent',
                border: selectedSubEventUuid === ev.uuid ? '1px solid var(--border-active)' : '1px solid transparent',
                transition: 'all 0.1s ease',
              }}
            >
              <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: '52px', marginTop: '1px' }}>
                {new Date(ev.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{ marginTop: '1px' }}>{EVENT_ICONS[ev.kind] || <FileText size={11} color="var(--text-muted)" />}</span>
              <span style={{ fontSize: '0.68rem', color: EVENT_COLORS[ev.kind] || 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getEventLabel(ev)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Return summary, pinned at bottom */}
      <div style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', padding: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
          <CornerDownLeft size={11} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Return</span>
        </div>
        {returnEvent ? (
          <pre style={{
            fontSize: '0.65rem', color: returnEvent.isError ? '#c97a7a' : 'var(--text-primary)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)',
            lineHeight: '1.25rem', margin: 0, maxHeight: '140px', overflowY: 'auto',
          }}>
            {truncate(returnEvent.content || '', 600)}
          </pre>
        ) : (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>no return recorded</span>
        )}
      </div>
    </div>
  );
}
