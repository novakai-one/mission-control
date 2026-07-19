import React from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import type { Conversation } from '../../../../lib/tunnelModel/index.js';

function initials(title: string): string {
  return title
    .split(/[\s·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

interface AgentRowProps {
  agent: AgentInfo;
  selected: boolean;
  onSelect?(): void;
}

export function AgentRow({ agent, selected, onSelect }: AgentRowProps) {
  return (
    <button
      type="button"
      className={selected ? 'mc-agent mc-agent-selected' : 'mc-agent'}
      onClick={onSelect}
      disabled={!onSelect}
    >
      <span className="mc-avatar">{initials(agent.title)}</span>
      <span className="mc-agent-copy">
        <strong>{agent.title}</strong>
        <small>{agent.provider} · {agent.status}</small>
      </span>
      <span className={agent.status === 'running' ? 'mc-status mc-status-live' : 'mc-status'} />
    </button>
  );
}

interface DirectMessageRowProps {
  lane: Conversation;
  /** The live agent behind the lane, when one is registered. History-only
   * lanes (exited or never-registered agents) render without one — dropping
   * the row instead would hide conversations the feed proves exist. */
  agent: AgentInfo | undefined;
  selected: boolean;
  onSelect?(): void;
}

export function DirectMessageRow({ lane, agent, selected, onSelect }: DirectMessageRowProps) {
  return (
    <button
      type="button"
      className={selected ? 'mc-agent mc-agent-selected' : 'mc-agent'}
      onClick={onSelect}
      disabled={!onSelect}
    >
      <span className="mc-avatar">{initials(lane.title)}</span>
      <span className="mc-agent-copy">
        <strong>{lane.title}</strong>
        <small>
          {agent
            ? `${agent.provider} · ${agent.status}`
            : lane.lastMessageAt ? 'Recent activity' : 'No messages yet'}
        </small>
      </span>
      <span className={agent?.status === 'running' ? 'mc-status mc-status-live' : 'mc-status'} />
    </button>
  );
}
