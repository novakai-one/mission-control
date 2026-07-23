import React from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import type { PanelPersonRow } from '../../../../lib/tunnelModel/people.js';

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

/** One agent row in the MC LIVE SQUAD list. */
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
  /** The shared agentId-keyed row (Task 2.3) — identity from the durable
   * directory; history-only lanes render with person null (never dropped:
   * the feed proves the conversation exists). */
  row: PanelPersonRow;
  selected: boolean;
  onSelect?(): void;
}

/** Presence: running PTY or live durable identity (an external chief with no
 * PTY IS online — absence of runtime is not absence). */
function rowOnline(row: PanelPersonRow): boolean {
  return row.person?.runtime?.status === 'running'
    || row.person?.durableStatus === 'live' || row.person?.durableStatus === 'spawning';
}

function rowStatusLine(row: PanelPersonRow): string {
  if (!row.person) return row.lane?.lastMessageAt ? 'Recent activity' : 'No messages yet';
  const status = row.person.runtime?.status ?? row.person.durableStatus ?? 'unregistered';
  return `${row.person.provider} · ${status}`;
}

/** One DIRECT MESSAGES person row, keyed by durable agentId (ruling v2.1). */
export function DirectMessageRow({ row, selected, onSelect }: DirectMessageRowProps) {
  const name = row.person?.name ?? row.lane?.title ?? row.conversationId;
  return (
    <button
      type="button"
      className={selected ? 'mc-agent mc-agent-selected' : 'mc-agent'}
      onClick={onSelect}
      disabled={!onSelect}
    >
      <span className="mc-avatar">{initials(name)}</span>
      <span className="mc-agent-copy">
        <strong>{name}</strong>
        <small>{rowStatusLine(row)}</small>
      </span>
      <span className={rowOnline(row) ? 'mc-status mc-status-live' : 'mc-status'} />
    </button>
  );
}
