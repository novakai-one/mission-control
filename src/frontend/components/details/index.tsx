import React, { useEffect, useRef } from 'react';
import { Terminal, Brain, Wrench, FileText, AlertTriangle, Radio, GitBranch } from 'lucide-react';
import { TranscriptEvent } from '../index.js';

interface SelectedInspectorProps {
  event?: TranscriptEvent;
  events: TranscriptEvent[];
}

const KIND_LABELS: Record<string, string> = {
  user_text: 'USER MESSAGE',
  assistant_text: 'ASSISTANT TEXT',
  assistant_thinking: 'ASSISTANT THINKING',
  tool_use: 'TOOL CALL',
  tool_result: 'TOOL RESULT',
  hook_event: 'HOOK / GATE EVENT',
  system: 'SYSTEM MESSAGE',
  session_meta: 'SESSION METADATA',
};

const KIND_ICONS: Record<string, React.ReactNode> = {
  user_text: <FileText size={14} color="var(--text-secondary)" />,
  assistant_text: <FileText size={14} color="#7a9ec9" />,
  assistant_thinking: <Brain size={14} color="#9a7ac9" />,
  tool_use: <Wrench size={14} color="#c9b57a" />,
  tool_result: <Wrench size={14} color="#7ac98f" />,
  hook_event: <AlertTriangle size={14} color="#c97a7a" />,
  system: <Radio size={14} color="var(--text-muted)" />,
  session_meta: <Radio size={14} color="var(--text-muted)" />,
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

export function SelectedInspector({ event }: SelectedInspectorProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [event?.uuid]);

  if (!event) {
    return (
      <div style={{
        display: 'flex', width: '100%', backgroundColor: 'var(--bg-secondary)',
        alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
        flexDirection: 'column', gap: '0.8rem', padding: '2rem', textAlign: 'center'
      }}>
        <Terminal size={24} strokeWidth={1.5} />
        <span style={{ fontSize: '0.75rem' }}>SELECT AN EVENT FROM THE TIMELINE TO VIEW DETAILS</span>
      </div>
    );
  }

  const icon = KIND_ICONS[event.kind] || <FileText size={14} color="var(--text-muted)" />;
  const label = KIND_LABELS[event.kind] || event.kind.toUpperCase();

  // Build content based on event kind
  let contentBody: React.ReactNode = null;

  if (event.kind === 'tool_use') {
    if (event.isAgentSpawn) {
      contentBody = (
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
            <pre style={{ fontSize: '0.7rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.3rem', margin: 0, maxHeight: '400px', overflowY: 'auto' }}>
              {event.agentPrompt}
            </pre>
          </div>
        </div>
      );
    } else {
      contentBody = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tool</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{event.tool}</span>
          </div>
          <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Input Arguments</span>
            <pre style={{ fontSize: '0.7rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.3rem', margin: 0, maxHeight: '300px', overflowY: 'auto' }}>
              {JSON.stringify(event.input, null, 2)}
            </pre>
          </div>
        </div>
      );
    }
  } else if (event.kind === 'tool_result') {
    contentBody = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tool Use ID</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{event.toolUseId}</span>
        </div>
        <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.6rem', color: event.isError ? '#c97a7a' : 'var(--text-muted)', textTransform: 'uppercase' }}>
            {event.isError ? 'Error Output' : 'Result'}
          </span>
          <pre style={{ fontSize: '0.7rem', color: event.isError ? '#c97a7a' : 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.3rem', margin: 0, maxHeight: '400px', overflowY: 'auto' }}>
            {truncate(event.content || '', 50000)}
          </pre>
        </div>
      </div>
    );
  } else if (event.kind === 'hook_event') {
    contentBody = (
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
          <pre style={{ fontSize: '0.7rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.3rem', margin: 0, maxHeight: '400px', overflowY: 'auto' }}>
            {truncate(event.content || '', 50000)}
          </pre>
        </div>
      </div>
    );
  } else {
    // Text-based events (user_text, assistant_text, assistant_thinking, system)
    contentBody = (
      <div className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Content</span>
        <pre style={{ fontSize: '0.75rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', lineHeight: '1.4rem', margin: 0, maxHeight: '500px', overflowY: 'auto' }}>
          {truncate(event.text || '', 50000)}
        </pre>
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={{
      display: 'flex', flexDirection: 'column', width: '100%',
      backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)',
      overflowY: 'auto'
    }}>
      {/* Header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          {icon}
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          <span>{new Date(event.ts).toLocaleString()}</span>
          {event.isSidechain && (
            <span style={{ color: '#c9b57a', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <GitBranch size={10} /> sidechain
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        {contentBody}
      </div>
    </div>
  );
}
