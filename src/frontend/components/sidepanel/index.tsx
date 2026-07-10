import React from 'react';
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import './index.css';

export interface SidePanelAgent {
  agentId: string;
  title: string;
  status: 'running' | 'exited';
}

export interface SidePanelProps {
  agents: SidePanelAgent[];
  activeAgentId: string | null;
  collapsed: boolean;
  onToggle(): void;
  onSelect(agentId: string): void;
  onCreate(): void;
}

function initialsOf(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface StatusDotProps {
  status: SidePanelAgent['status'];
}

function StatusDot({ status }: StatusDotProps) {
  const dotClass = status === 'running' ? 'sidepanel-dot blink-dot' : 'sidepanel-dot sidepanel-dot-exited';
  return <span className={dotClass} />;
}

interface AgentRowProps {
  agent: SidePanelAgent;
  active: boolean;
  collapsed: boolean;
  onSelect(agentId: string): void;
}

function AgentRow({ agent, active, collapsed, onSelect }: AgentRowProps) {
  const rowClass = `sidepanel-agent${active ? ' sidepanel-agent-active' : ''}${collapsed ? ' sidepanel-agent-collapsed' : ''}`;
  const handleClick = () => onSelect(agent.agentId);

  if (collapsed) {
    return (
      <button type="button" className={rowClass} onClick={handleClick} aria-label={agent.title} title={agent.title}>
        <span className="sidepanel-avatar">{initialsOf(agent.title)}</span>
      </button>
    );
  }

  return (
    <button type="button" className={rowClass} onClick={handleClick} aria-label={agent.title}>
      <StatusDot status={agent.status} />
      <span className="sidepanel-agent-title">{agent.title}</span>
    </button>
  );
}

export function SidePanel(props: SidePanelProps) {
  const { agents, activeAgentId, collapsed, onToggle, onSelect, onCreate } = props;
  const panelClass = `sidepanel glass-panel${collapsed ? ' sidepanel-collapsed' : ''}`;
  const toggleLabel = collapsed ? 'Expand agent panel' : 'Collapse agent panel';

  return (
    <div className={panelClass}>
      <div className="sidepanel-header">
        <button type="button" className="sidepanel-toggle" onClick={onToggle} aria-label={toggleLabel}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        {!collapsed && <span className="sidepanel-heading">Agents</span>}
      </div>

      <button
        type="button"
        className={collapsed ? 'sidepanel-new sidepanel-new-collapsed' : 'sidepanel-new'}
        onClick={onCreate}
        aria-label="New agent"
      >
        <Plus size={14} />
        {!collapsed && <span>New agent</span>}
      </button>

      <div className="sidepanel-list">
        {agents.map((agent) => (
          <AgentRow
            key={agent.agentId}
            agent={agent}
            active={agent.agentId === activeAgentId}
            collapsed={collapsed}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
