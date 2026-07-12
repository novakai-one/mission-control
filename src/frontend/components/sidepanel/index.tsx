import React, { useEffect, useRef, useState } from 'react';
import { Archive, PanelLeftClose, PanelLeftOpen, Plus, Square } from 'lucide-react';
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
  onRename(agentId: string, title: string): void;
  onKill(agentId: string): void;
  onArchive(agentId: string): void;
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

interface RenameInputProps {
  title: string;
  onCommit(title: string): void;
  onCancel(): void;
}

function RenameInput({ title, onCommit, onCancel }: RenameInputProps) {
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function commit(): void {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) onCommit(trimmed);
    else onCancel();
  }

  function cancel(): void {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    // Keys must not bubble to the row's role=button handler — it preventDefaults
    // ' ' (select semantics), which would swallow spaces typed into the title.
    event.stopPropagation();
    if (event.key === 'Enter') commit();
    else if (event.key === 'Escape') cancel();
  }

  return (
    <input
      ref={inputRef}
      className="sidepanel-rename-input"
      value={value}
      onChange={event => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      onClick={event => event.stopPropagation()}
    />
  );
}

interface RowActionsProps {
  agent: SidePanelAgent;
  onKill(agentId: string): void;
  onArchive(agentId: string): void;
}

function RowActions({ agent, onKill, onArchive }: RowActionsProps) {
  function handleKill(event: React.MouseEvent): void {
    event.stopPropagation();
    if (window.confirm('Kill this agent? The running turn is lost; the transcript is kept.')) {
      onKill(agent.agentId);
    }
  }

  function handleArchive(event: React.MouseEvent): void {
    event.stopPropagation();
    const running = agent.status === 'running';
    if (running && !window.confirm('Archive this agent? It will be killed and hidden from the panel.')) return;
    onArchive(agent.agentId);
  }

  return (
    <div className="sidepanel-row-actions">
      {agent.status === 'running' && (
        <button type="button" className="sidepanel-action-btn" onClick={handleKill} title="Kill agent" aria-label="Kill agent">
          <Square size={12} />
        </button>
      )}
      <button type="button" className="sidepanel-action-btn" onClick={handleArchive} title="Archive agent" aria-label="Archive agent">
        <Archive size={12} />
      </button>
    </div>
  );
}

interface AgentRowProps {
  agent: SidePanelAgent;
  active: boolean;
  collapsed: boolean;
  onSelect(agentId: string): void;
  onRename(agentId: string, title: string): void;
  onKill(agentId: string): void;
  onArchive(agentId: string): void;
}

function AgentRow({ agent, active, collapsed, onSelect, onRename, onKill, onArchive }: AgentRowProps) {
  const [renaming, setRenaming] = useState(false);
  const rowClass = `sidepanel-agent${active ? ' sidepanel-agent-active' : ''}${collapsed ? ' sidepanel-agent-collapsed' : ''}`;

  function handleSelect(): void {
    onSelect(agent.agentId);
  }

  if (collapsed) {
    return (
      <button type="button" className={rowClass} onClick={handleSelect} aria-label={agent.title} title={agent.title}>
        <span className="sidepanel-avatar">{initialsOf(agent.title)}</span>
      </button>
    );
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect();
    }
  }

  function handleRenameCommit(title: string): void {
    setRenaming(false);
    onRename(agent.agentId, title);
  }

  function startRenaming(event: React.MouseEvent): void {
    event.stopPropagation();
    setRenaming(true);
  }

  return (
    <div
      className={rowClass}
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      aria-label={agent.title}
      aria-pressed={active}
    >
      <StatusDot status={agent.status} />
      {renaming ? (
        <RenameInput title={agent.title} onCommit={handleRenameCommit} onCancel={() => setRenaming(false)} />
      ) : (
        <span className="sidepanel-agent-title u-truncate" onDoubleClick={startRenaming}>
          {agent.title}
        </span>
      )}
      <RowActions agent={agent} onKill={onKill} onArchive={onArchive} />
    </div>
  );
}

export function SidePanel(props: SidePanelProps) {
  const { agents, activeAgentId, collapsed, onToggle, onSelect, onCreate, onRename, onKill, onArchive } = props;
  const panelClass = `sidepanel glass-panel${collapsed ? ' sidepanel-collapsed' : ''}`;
  const toggleLabel = collapsed ? 'Expand agent panel' : 'Collapse agent panel';

  return (
    <div className={panelClass}>
      <div className="sidepanel-header">
        <button type="button" className="sidepanel-toggle" onClick={onToggle} aria-label={toggleLabel}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        {!collapsed && <span className="u-section-title sidepanel-heading">Agents</span>}
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
            onRename={onRename}
            onKill={onKill}
            onArchive={onArchive}
          />
        ))}
      </div>
    </div>
  );
}
