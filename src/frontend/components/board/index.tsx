import React from 'react';
import { Network, Brain, Wrench, GitBranch, FileText, AlertTriangle, Radio } from 'lucide-react';
import { TranscriptEvent } from '../index.js';

interface AgentBoardProps {
  events: TranscriptEvent[];
  onSelectEvent: (uuid: string | null) => void;
  selectedEventUuid: string | null;
}

export const EVENT_ICONS: Record<string, React.ReactNode> = {
  user_text: <FileText size={11} color="var(--text-secondary)" />,
  assistant_text: <FileText size={11} color="#7a9ec9" />,
  assistant_thinking: <Brain size={11} color="#9a7ac9" />,
  tool_use: <Wrench size={11} color="#c9b57a" />,
  tool_result: <Wrench size={11} color="#7ac98f" />,
  hook_event: <AlertTriangle size={11} color="#c97a7a" />,
  system: <Radio size={11} color="var(--text-muted)" />,
  session_meta: <Radio size={11} color="var(--text-muted)" />,
};

export const EVENT_COLORS: Record<string, string> = {
  user_text: 'var(--text-secondary)',
  assistant_text: '#7a9ec9',
  assistant_thinking: '#9a7ac9',
  tool_use: '#c9b57a',
  tool_result: '#7ac98f',
  hook_event: '#c97a7a',
  system: 'var(--text-muted)',
  session_meta: 'var(--text-muted)',
};

export function getEventLabel(ev: TranscriptEvent): string {
  switch (ev.kind) {
    case 'user_text': return ev.text?.substring(0, 80) || '';
    case 'assistant_text': return ev.text?.substring(0, 80) || '';
    case 'assistant_thinking': return ev.text?.substring(0, 80) || '';
    case 'tool_use':
      if (ev.isAgentSpawn) return `Spawn: ${ev.agentDescription || ev.agentType || 'subagent'}`;
      return `${ev.tool}(${Object.keys(ev.input || {}).slice(0, 3).join(', ')})`;
    case 'tool_result': 
      return ev.isError ? 'ERROR' : (ev.content?.substring(0, 80) || '');
    case 'hook_event': return `${ev.hookName || ev.hookEvent}`;
    case 'system': return ev.text?.substring(0, 80) || '';
    case 'session_meta': return ev.mode || ev.permissionMode || ev.summary || '';
    default: return '';
  }
}

export function AgentBoard({ events, onSelectEvent, selectedEventUuid }: AgentBoardProps) {
  const subagentSpawns = events.filter(e => e.kind === 'tool_use' && e.isAgentSpawn);
  const sidechainEvents = events.filter(e => e.isSidechain);

  return (
    <div style={{
      display: 'flex', flex: 1, minWidth: '320px', backgroundColor: 'var(--bg-primary)',
      borderRight: '1px solid var(--border-color)', overflowY: 'auto', padding: '1.5rem',
      flexDirection: 'column', gap: '1rem'
    }}>
      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="glass-panel" style={{ padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Events</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{events.length}</span>
        </div>
        <div className="glass-panel" style={{ padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Subagents</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#c9b57a' }}>{subagentSpawns.length}</span>
        </div>
        <div className="glass-panel" style={{ padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sidechain</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{sidechainEvents.length}</span>
        </div>
      </div>

      {/* Subagent spawn tree */}
      {subagentSpawns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <GitBranch size={12} color="var(--text-secondary)" />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Subagent Spawns</span>
          </div>
          {subagentSpawns.map((spawn) => (
            <div
              key={spawn.uuid}
              onClick={() => onSelectEvent(spawn.uuid)}
              className="glass-panel"
              style={{
                padding: '0.5rem 0.8rem', cursor: 'pointer',
                backgroundColor: selectedEventUuid === spawn.uuid ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                borderColor: selectedEventUuid === spawn.uuid ? 'var(--border-active)' : 'var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <GitBranch size={10} color="#c9b57a" />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 500 }}>{spawn.agentDescription || 'subagent'}</span>
              </div>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{spawn.agentType || ''} · {new Date(spawn.ts).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Event timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
          <Network size={12} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Event Timeline</span>
        </div>
        {events.length === 0 ? (
          <div style={{
            display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text-muted)', gap: '0.8rem'
          }}>
            <Network size={28} strokeWidth={1.5} />
            <span style={{ fontSize: '0.75rem' }}>Select a session to view transcript</span>
          </div>
        ) : (
          events.map((ev, i) => (
            <div
              key={ev.eventKey || ev.uuid || i}
              onClick={() => onSelectEvent(ev.uuid)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.3rem 0.5rem',
                borderRadius: '4px', cursor: 'pointer',
                backgroundColor: selectedEventUuid === ev.uuid ? 'var(--bg-tertiary)' : 'transparent',
                border: selectedEventUuid === ev.uuid ? '1px solid var(--border-active)' : '1px solid transparent',
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
              {ev.isSidechain && (
                <span style={{ fontSize: '0.55rem', color: '#c9b57a', backgroundColor: 'rgba(201,181,122,0.1)', padding: '0 0.3rem', borderRadius: '2px' }}>SC</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
