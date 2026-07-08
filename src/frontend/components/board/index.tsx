import React from 'react';
import { Network, Plus, ArrowRight } from 'lucide-react';
import { AgentInstance, AgentStep } from '../index.js';

interface AgentBoardProps {
  activeAgents: AgentInstance[];
  steps: AgentStep[];
  onSelectAgent: (id: string | null) => void;
  selectedAgentId: string | null;
}

export function AgentBoard({ activeAgents, steps, onSelectAgent, selectedAgentId }: AgentBoardProps) {
  const rootAgents = activeAgents.filter((agent) => !agent.parentAgentId);

  const handleSpawnMockSubagent = (parentId: string) => {
    fetch('/api/subagents/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentAgentId: parentId,
        role: 'Subcontractor Agent',
        prompt: 'Implement additional unit tests for files',
        llmType: 'claude'
      })
    }).catch(() => {});
  };

  const renderAgentNode = (agent: AgentInstance, depth = 0) => {
    const isSelected = selectedAgentId === agent.id;
    const children = activeAgents.filter((child) => child.parentAgentId === agent.id);

    return (
      <div key={agent.id} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginLeft: `${depth * 40}px`, position: 'relative' }}>
        {depth > 0 && (
          <div style={{
            position: 'absolute', left: '-25px', top: '24px', width: '20px', height: '2px',
            backgroundColor: 'var(--border-color)'
          }} />
        )}

        <div
          onClick={() => onSelectAgent(agent.id)}
          className={`glass-panel ${isSelected ? 'glow-selected' : ''}`}
          style={{
            padding: '1rem', width: '280px', cursor: 'pointer',
            backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
            borderColor: isSelected ? 'var(--border-active)' : 'var(--border-color)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{agent.role}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div className="blink-dot" style={{
                backgroundColor: agent.status === 'running' ? '#5d7c9a' : 'var(--text-muted)',
                animation: agent.status === 'running' ? 'pulse-ring 2s infinite ease-in-out' : 'none'
              }} />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{agent.status}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.8rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ID: {agent.id}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{agent.tokensSpent} tokens</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.8rem', gap: '0.4rem' }}>
            <button
              onClick={(e) => { e.stopPropagation(); handleSpawnMockSubagent(agent.id); }}
              title="Spawn specialized subagent"
              style={{
                background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                borderRadius: '4px', padding: '0.2rem 0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center'
              }}
            >
              <Plus size={10} style={{ marginRight: '2px' }} />
              <span style={{ fontSize: '0.6rem' }}>Spawn</span>
            </button>
          </div>
        </div>

        {children.map((child) => renderAgentNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex', flex: 1, backgroundColor: 'var(--bg-primary)',
      borderRight: '1px solid var(--border-color)', overflowY: 'auto', padding: '1.5rem',
      flexDirection: 'column', gap: '1.5rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Network size={16} color="var(--text-secondary)" />
        <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02rem' }}>
          AGENT TOPOLOGY GRAPH
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
        {rootAgents.length === 0 ? (
          <div style={{
            display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text-muted)', gap: '0.8rem', height: '100%'
          }}>
            <Network size={28} strokeWidth={1.5} />
            <span style={{ fontSize: '0.75rem' }}>No active agents. Enter a prompt above to dispatch your team.</span>
          </div>
        ) : (
          rootAgents.map((root) => renderAgentNode(root))
        )}
      </div>

      {steps.length > 0 && (
        <div className="glass-panel" style={{
          padding: '1rem', marginTop: 'auto', backgroundColor: 'var(--bg-secondary)',
          display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto'
        }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>LIVE TIMELINE FEED</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {steps.slice(-3).map((step) => (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{new Date(step.timestamp).toLocaleTimeString()}</span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{step.agentId}:</span>
                <span style={{ color: 'var(--text-primary)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {step.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
