import React, { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Terminal, Brain, Wrench, FileText, AlertTriangle, Radio, GitBranch } from 'lucide-react';
import { TranscriptEvent } from '../index.js';
import { getChipLabel, selKey } from '../board/timelineModel.js';
import { explainCommand } from '../../lib/explainCommand/index.js';
import { currentTimeZone } from '../../lib/timezone/index.js';
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

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

export function formatClock(stamp: string): string {
  return new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: currentTimeZone() });
}

/** Kind-specific detail panels for one event; shared by both inspector columns. */
export function EventDetailBody({ event }: { event: TranscriptEvent }) {
  if (event.kind === 'tool_use') {
    if (event.isAgentSpawn) {
      return (
        <div className="insp-fields">
          <div className="insp-spawn-hint">↳ Opened in the Sub Timeline →</div>
          <div className="glass-panel insp-field">
            <span className="insp-field-label">Description</span>
            <span className="insp-field-value">{event.agentDescription}</span>
          </div>
          <div className="glass-panel insp-field">
            <span className="insp-field-label">Type</span>
            <span className="insp-field-value">{event.agentType || 'default'}</span>
          </div>
          <div className="glass-panel insp-field">
            <span className="insp-field-label">Prompt (Handover Contract)</span>
            <pre className="insp-pre">{event.agentPrompt}</pre>
          </div>
        </div>
      );
    }
    const bashCommand = event.tool === 'Bash' && typeof event.input?.command === 'string' ? event.input.command : '';
    return (
      <div className="insp-fields">
        <div className="glass-panel insp-field">
          <span className="insp-field-label">Tool</span>
          <span className="insp-field-value">{event.tool}</span>
        </div>
        {bashCommand && (
          <div className="glass-panel insp-field">
            <span className="insp-field-label">Explanation</span>
            <div className="insp-explain">
              {explainCommand(bashCommand).map((line) => (
                <div key={line} className="insp-explain-line">• {line}</div>
              ))}
            </div>
          </div>
        )}
        <div className="glass-panel insp-field">
          <span className="insp-field-label">Input Arguments</span>
          <pre className="insp-pre">{JSON.stringify(event.input, null, 2)}</pre>
        </div>
      </div>
    );
  }
  if (event.kind === 'tool_result') {
    return (
      <div className="insp-fields">
        <div className="glass-panel insp-field">
          <span className="insp-field-label">Tool Use ID</span>
          <span className="insp-field-value-sm">{event.toolUseId}</span>
        </div>
        <div className="glass-panel insp-field">
          <span className={`insp-field-label${event.isError ? ' insp-field-label-error' : ''}`}>
            {event.isError ? 'Error Output' : 'Result'}
          </span>
          <pre className={`insp-pre${event.isError ? ' insp-pre-error' : ''}`}>
            {truncate(event.content || '', 50000)}
          </pre>
        </div>
      </div>
    );
  }
  if (event.kind === 'hook_event') {
    return (
      <div className="insp-fields">
        <div className="glass-panel insp-field">
          <span className="insp-field-label">Hook Name</span>
          <span className="insp-field-value">{event.hookName}</span>
        </div>
        <div className="glass-panel insp-field">
          <span className="insp-field-label">Hook Event</span>
          <span className="insp-field-value">{event.hookEvent}</span>
        </div>
        <div className="glass-panel insp-field">
          <span className="insp-field-label">Content</span>
          <pre className="insp-pre">{truncate(event.content || '', 50000)}</pre>
        </div>
      </div>
    );
  }
  if (event.kind === 'session_meta') {
    if (!event.summary && !event.mode && !event.permissionMode) {
      return (
        <div className="glass-panel insp-field">
          <span className="insp-field-label">Session Meta</span>
          <span className="insp-field-value">session metadata</span>
        </div>
      );
    }
    return (
      <div className="insp-fields">
        {event.summary && (
          <div className="glass-panel insp-field">
            <span className="insp-field-label">Summary</span>
            <span className="insp-field-value">{event.summary}</span>
          </div>
        )}
        {event.mode && (
          <div className="glass-panel insp-field">
            <span className="insp-field-label">Mode</span>
            <span className="insp-field-value">{event.mode}</span>
          </div>
        )}
        {event.permissionMode && (
          <div className="glass-panel insp-field">
            <span className="insp-field-label">Permission Mode</span>
            <span className="insp-field-value">{event.permissionMode}</span>
          </div>
        )}
      </div>
    );
  }
  // Text-based events (user_text, assistant_text, assistant_thinking, system)
  return (
    <div className="glass-panel insp-field">
      <span className="insp-field-label">Content</span>
      {event.text ? (
        <pre className="insp-pre insp-pre-text">{truncate(event.text, 50000)}</pre>
      ) : (
        <span className="insp-empty">
          {event.kind === 'assistant_thinking' ? 'thinking not recorded (encrypted)' : '(no content)'}
        </span>
      )}
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
  // O(n) over the full timeline — skip it on renders where neither input moved (live frames, resize drags).
  const index = useMemo(() => events.findIndex((event) => selKey(event) === selKey(current)), [events, current]);
  const prev = index > 0 ? events[index - 1] : null;
  // index -1 = current was filtered out of the list after selection; offer the first visible event as an escape hatch.
  const next = index === -1 ? (events[0] ?? null) : index < events.length - 1 ? events[index + 1] : null;
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

  // Keyed on selKey, not uuid: sibling blocks of one jsonl line share a uuid
  // but are distinct events, and live re-emits swap the object identity.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [event ? selKey(event) : null]);

  return (
    <div className="insp-col">
      <div className="insp-header">
        <span className="u-section-title">Agent Inspector</span>
        {event && (
          <span className="insp-subtitle">
            <span className="insp-author">main agent</span>
            {KIND_ICONS[event.kind] || <FileText size={14} color="var(--text-muted)" />}
            {getChipLabel(event)} · {formatClock(event.ts)}
            {event.isSidechain && (
              <span className="insp-sidechain">
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
