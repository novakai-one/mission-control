import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Terminal, Brain, Wrench, FileText, AlertTriangle, Radio, GitBranch } from 'lucide-react';
import { TranscriptEvent } from '../index.js';
import { getChipLabel } from '../board/timelineModel.js';
import './index.css';

const KIND_ICONS: Record<string, React.ReactNode> = {
  user_text: <FileText size={14} color="var(--text-secondary)" />,
  assistant_text: <FileText size={14} color="var(--kind-assistant)" />,
  assistant_thinking: <Brain size={14} color="var(--kind-thinking)" />,
  tool_use: <Wrench size={14} color="var(--kind-tool)" />,
  tool_result: <Wrench size={14} color="var(--kind-result)" />,
  hook_event: <AlertTriangle size={14} color="var(--kind-error)" />,
  system: <Radio size={14} color="var(--text-muted)" />,
  session_meta: <Radio size={14} color="var(--text-muted)" />,
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

export function formatClock(stamp: string): string {
  return new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Kind-specific detail panels for one event; shared by both inspector columns. */
export function EventDetailBody({ event }: { event: TranscriptEvent }) {
  if (event.kind === 'tool_use') {
    if (event.isAgentSpawn) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{event.agentDescription}</span>
          </div>
          <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{event.agentType || 'default'}</span>
          </div>
          <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Prompt (Handover Contract)</span>
            <pre style={{ fontSize: '0.7rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.3rem', margin: 0 }}>
              {event.agentPrompt}
            </pre>
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tool</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{event.tool}</span>
        </div>
        <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Input Arguments</span>
          <pre style={{ fontSize: '0.7rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.3rem', margin: 0 }}>
            {JSON.stringify(event.input, null, 2)}
          </pre>
        </div>
      </div>
    );
  }
  if (event.kind === 'tool_result') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tool Use ID</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{event.toolUseId}</span>
        </div>
        <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.6rem', color: event.isError ? 'var(--kind-error)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
            {event.isError ? 'Error Output' : 'Result'}
          </span>
          <pre style={{ fontSize: '0.7rem', color: event.isError ? 'var(--kind-error)' : 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.3rem', margin: 0 }}>
            {truncate(event.content || '', 50000)}
          </pre>
        </div>
      </div>
    );
  }
  if (event.kind === 'hook_event') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hook Name</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{event.hookName}</span>
        </div>
        <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hook Event</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{event.hookEvent}</span>
        </div>
        <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Content</span>
          <pre style={{ fontSize: '0.7rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.3rem', margin: 0 }}>
            {truncate(event.content || '', 50000)}
          </pre>
        </div>
      </div>
    );
  }
  // Text-based events (user_text, assistant_text, assistant_thinking, system)
  return (
    <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Content</span>
      <pre style={{ fontSize: '0.75rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.4rem', margin: 0 }}>
        {truncate(event.text || '', 50000)}
      </pre>
    </div>
  );
}

interface EventNavProps {
  events: TranscriptEvent[];
  current: TranscriptEvent;
  onNavigate: (event: TranscriptEvent) => void;
  extra?: React.ReactNode;
}

/** Footer strip: ◀ prev event · next event ▶, plus optional trailing stats. */
export function EventNav({ events, current, onNavigate, extra }: EventNavProps) {
  const index = events.findIndex((event) => event.uuid === current.uuid);
  const prev = index > 0 ? events[index - 1] : null;
  const next = index >= 0 && index < events.length - 1 ? events[index + 1] : null;
  return (
    <div className="insp-nav">
      <button className="insp-nav-btn" disabled={!prev} onClick={() => prev && onNavigate(prev)}>
        <ChevronLeft size={12} /> prev event
      </button>
      <span className="insp-nav-sep">·</span>
      <button className="insp-nav-btn" disabled={!next} onClick={() => next && onNavigate(next)}>
        next event <ChevronRight size={12} />
      </button>
      {extra && <span className="insp-nav-extra">{extra}</span>}
    </div>
  );
}

interface SelectedInspectorProps {
  event?: TranscriptEvent;
  events: TranscriptEvent[];
  onNavigate: (event: TranscriptEvent) => void;
}

/** Second column: detail view of the selected main-timeline event. */
export function SelectedInspector({ event, events, onNavigate }: SelectedInspectorProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [event?.uuid]);

  return (
    <div className="insp-col">
      <div className="insp-header">
        <span className="insp-title">Agent Inspector</span>
        {event && (
          <span className="insp-subtitle">
            {KIND_ICONS[event.kind] || <FileText size={14} color="var(--text-muted)" />}
            {getChipLabel(event)} · {formatClock(event.ts)}
            {event.isSidechain && (
              <span style={{ color: 'var(--kind-tool)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                <GitBranch size={10} /> sidechain
              </span>
            )}
          </span>
        )}
      </div>
      {event ? (
        <>
          <div ref={scrollRef} className="insp-body">
            <EventDetailBody event={event} />
          </div>
          <EventNav events={events} current={event} onNavigate={onNavigate} />
        </>
      ) : (
        <div className="tl-col-hint">
          <Terminal size={24} strokeWidth={1.5} />
          <span>Select an event from the timeline to view details</span>
        </div>
      )}
    </div>
  );
}
