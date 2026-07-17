import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as agentSocket from '../../lib/agentSocket/index.js';
import type { AgentInfo } from '../../lib/agentSocket/index.js';
import { AgentTerminal } from './terminal.js';
import { CalmView } from './calm/index.js';
import { reconcileAgents } from './reconcile/index.js';
import './index.css';

const COLLAPSE_STORAGE_KEY = 'mc-sidepanel-collapsed';
const ACTIVE_AGENT_STORAGE_KEY = 'novakai-active-agent';

export interface AgentsState {
  agents: AgentInfo[];
  activeAgentId: string | null;
  setActiveAgentId: (agentId: string | null) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
  createAgent: () => Promise<void>;
  renameAgent: (agentId: string, title: string) => Promise<void>;
  killAgent: (agentId: string) => Promise<void>;
  archiveAgent: (agentId: string) => Promise<void>;
}

export function useAgentsState(): AgentsState {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [activeAgentId, setActiveAgentState] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_AGENT_STORAGE_KEY)
  );
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true'
  );

  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => setAgents(previous => reconcileAgents(previous, data.agents ?? [])))
      .catch(() => {})
      .finally(() => setAgentsLoaded(true));
    agentSocket.connect();
    return agentSocket.onAgentsChanged((nextAgents) => {
      setAgents(previous => reconcileAgents(previous, nextAgents));
      setAgentsLoaded(true);
    });
  }, []);

  const setActiveAgentId = useCallback((agentId: string | null) => {
    setActiveAgentState(agentId);
    if (agentId) localStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, agentId);
    else localStorage.removeItem(ACTIVE_AGENT_STORAGE_KEY);
  }, []);

  // Archived agents drop out of `agents` via the ws broadcast — if the active
  // agent was the one archived, clear the selection so nothing points at a gone pane.
  useEffect(() => {
    if (agentsLoaded && activeAgentId && !agents.some(agent => agent.agentId === activeAgentId)) {
      setActiveAgentId(null);
    }
  }, [agents, agentsLoaded, activeAgentId, setActiveAgentId]);

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
  }, [setActiveAgentId]);

  // These three only fire the request — the resulting agent list arrives
  // through the existing agents-changed ws broadcast (onAgentsChanged above).
  const renameAgent = useCallback(async (agentId: string, title: string) => {
    await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  }, []);

  const killAgent = useCallback(async (agentId: string) => {
    await fetch(`/api/agents/${agentId}/kill`, { method: 'POST' });
  }, []);

  const archiveAgent = useCallback(async (agentId: string) => {
    await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
  }, []);

  return {
    agents,
    activeAgentId,
    setActiveAgentId,
    collapsed,
    toggleCollapsed,
    createAgent,
    renameAgent,
    killAgent,
    archiveAgent,
  };
}

type RawCalmMode = 'raw' | 'calm';

export interface AgentsViewProps {
  agents: AgentInfo[];
  activeAgentId: string | null;
  onCreate: () => void;
  /** Stays mounted across tab switches (terminals survive); hidden via CSS when false. */
  visible: boolean;
}

interface AgentPaneProps {
  agent: AgentInfo;
  active: boolean;
  mode: RawCalmMode;
  onModeChange: (agentId: string, mode: RawCalmMode) => void;
}

const AgentPane = React.memo(function AgentPane({ agent, active, mode, onModeChange }: AgentPaneProps) {
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
});

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

export function AgentsView({ agents, activeAgentId, onCreate, visible }: AgentsViewProps) {
  const [modes, setModes] = useState<Map<string, RawCalmMode>>(new Map());
  // Default mode is seeded once per agentId from the status it had when first
  // seen (exited → calm, running → raw), then frozen — an agent killed while
  // watched in Raw must stay on its frozen Raw screen, not flip to Calm.
  const defaultModesRef = useRef<Map<string, RawCalmMode>>(new Map());

  const setModeFor = useCallback((agentId: string, mode: RawCalmMode) => {
    setModes(prev => new Map(prev).set(agentId, mode));
  }, []);

  function modeFor(agent: AgentInfo): RawCalmMode {
    const explicit = modes.get(agent.agentId);
    if (explicit) return explicit;
    const seeded = defaultModesRef.current.get(agent.agentId);
    if (seeded) return seeded;
    const initial: RawCalmMode = agent.status === 'exited' ? 'calm' : 'raw';
    defaultModesRef.current.set(agent.agentId, initial);
    return initial;
  }

  return (
    <div className={visible ? 'agents-view shell-main' : 'agents-view shell-main agents-view-hidden'}>
      {agents.length === 0 ? (
        <AgentsEmpty onCreate={onCreate} />
      ) : (
        agents.map(agent => (
          <AgentPane
            key={agent.agentId}
            agent={agent}
            active={visible && agent.agentId === activeAgentId}
            mode={modeFor(agent)}
            onModeChange={setModeFor}
          />
        ))
      )}
    </div>
  );
}
