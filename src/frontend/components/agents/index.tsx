import React, { useCallback, useEffect, useState } from 'react';
import * as agentSocket from '../../lib/agentSocket/index.js';
import type { AgentInfo } from '../../lib/agentSocket/index.js';
import { AgentTerminal } from './terminal.js';
import { CalmView } from './calm/index.js';
import './index.css';

const COLLAPSE_STORAGE_KEY = 'mc-sidepanel-collapsed';

export interface AgentsState {
  agents: AgentInfo[];
  activeAgentId: string | null;
  setActiveAgentId: (agentId: string | null) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
  createAgent: () => Promise<void>;
}

export function useAgentsState(): AgentsState {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true'
  );

  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => setAgents(data.agents ?? []))
      .catch(() => {});
    agentSocket.connect();
    agentSocket.onAgentsChanged(setAgents);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const createAgent = useCallback(async () => {
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const created: AgentInfo = await response.json();
    setActiveAgentId(created.agentId);
  }, []);

  return { agents, activeAgentId, setActiveAgentId, collapsed, toggleCollapsed, createAgent };
}

type RawCalmMode = 'raw' | 'calm';

export interface AgentsViewProps {
  agents: AgentInfo[];
  activeAgentId: string | null;
  onCreate: () => void;
}

interface AgentPaneProps {
  agent: AgentInfo;
  active: boolean;
  mode: RawCalmMode;
  onModeChange: (agentId: string, mode: RawCalmMode) => void;
}

function AgentPane({ agent, active, mode, onModeChange }: AgentPaneProps) {
  const paneClass = active ? 'agent-pane agent-pane-visible' : 'agent-pane';
  const rawActive = mode === 'raw';
  const rawButtonClass = rawActive ? 'agent-toggle-btn agent-toggle-btn-active' : 'agent-toggle-btn';
  const calmButtonClass = rawActive ? 'agent-toggle-btn' : 'agent-toggle-btn agent-toggle-btn-active';

  return (
    <div className={paneClass}>
      <div className="agent-pane-toolbar">
        <span className="agent-pane-title">{agent.title}</span>
        <div className="agent-toggle">
          <button type="button" className={rawButtonClass} onClick={() => onModeChange(agent.agentId, 'raw')}>
            Raw
          </button>
          <button type="button" className={calmButtonClass} onClick={() => onModeChange(agent.agentId, 'calm')}>
            Calm
          </button>
        </div>
      </div>
      <div className="agent-pane-body">
        <AgentTerminal agent={agent} visible={active && rawActive} />
        <CalmView agent={agent} visible={active && !rawActive} />
      </div>
    </div>
  );
}

interface AgentsEmptyProps {
  onCreate: () => void;
}

function AgentsEmpty({ onCreate }: AgentsEmptyProps) {
  return (
    <div className="agents-empty">
      <p className="agents-empty-hint">No agents yet. Start one to get a persistent Claude session.</p>
      <button type="button" className="agents-empty-create" onClick={onCreate}>
        New agent
      </button>
    </div>
  );
}

export function AgentsView({ agents, activeAgentId, onCreate }: AgentsViewProps) {
  const [modes, setModes] = useState<Map<string, RawCalmMode>>(new Map());

  const setModeFor = useCallback((agentId: string, mode: RawCalmMode) => {
    setModes(prev => new Map(prev).set(agentId, mode));
  }, []);

  if (agents.length === 0) return <AgentsEmpty onCreate={onCreate} />;

  return (
    <div className="agents-view">
      {agents.map(agent => (
        <AgentPane
          key={agent.agentId}
          agent={agent}
          active={agent.agentId === activeAgentId}
          mode={modes.get(agent.agentId) ?? 'raw'}
          onModeChange={setModeFor}
        />
      ))}
    </div>
  );
}
