import React, { useEffect, useRef } from 'react';
import { Terminal, Cpu, Clock, Layers } from 'lucide-react';
import { AgentInstance, AgentStep } from '../index.js';

interface SelectedInspectorProps {
  agent?: AgentInstance;
  stdout: string;
  steps: AgentStep[];
}

export function SelectedInspector({ agent, stdout, steps }: SelectedInspectorProps) {
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [stdout]);

  if (!agent) {
    return (
      <div style={{
        display: 'flex', width: '380px', backgroundColor: 'var(--bg-secondary)',
        alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
        flexDirection: 'column', gap: '0.8rem', padding: '2rem', textAlign: 'center'
      }}>
        <Terminal size={24} strokeWidth={1.5} />
        <span style={{ fontSize: '0.75rem' }}>SELECT AN AGENT NODE TO VIEW RUNTIME STREAMS AND TELEMETRY</span>
      </div>
    );
  }

  const thoughts = steps.filter((step) => step.type === 'thought');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '380px',
      backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)',
      overflowY: 'auto'
    }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <Cpu size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{agent.role}</span>
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ID: {agent.id}</span>
      </div>

      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <div className="glass-panel" style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
            <span style={{ color: agent.status === 'running' ? '#5d7c9a' : 'var(--text-primary)', fontWeight: 600 }}>{agent.status}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Estimated Cost:</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{agent.tokensSpent} tokens</span>
          </div>
          {agent.parentAgentId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Parent Agent:</span>
              <span style={{ color: 'var(--text-muted)' }}>{agent.parentAgentId}</span>
            </div>
          )}
        </div>

        {thoughts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>AGENT INTERNAL REASONING</span>
            <div className="glass-panel" style={{
              padding: '0.8rem', maxHeight: '120px', overflowY: 'auto',
              fontSize: '0.7rem', color: 'var(--text-primary)', lineHeight: '1.2rem'
            }}>
              {thoughts[thoughts.length - 1].content}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Terminal size={12} color="var(--text-secondary)" />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>CONSOLE OUTPUT STREAM</span>
          </div>
          <div style={{
            backgroundColor: '#0a0b0d', borderRadius: '4px', padding: '0.8rem',
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#c5c6c8',
            height: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column',
            gap: '0.25rem', border: '1px solid var(--border-color)', lineHeight: '1rem'
          }}>
            {stdout ? (
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                {stdout}
              </pre>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Awaiting terminal pipe streams...</span>
            )}
            <div ref={terminalBottomRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
