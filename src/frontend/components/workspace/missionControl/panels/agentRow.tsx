import React from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import type { PanelPersonRow } from '../../../../lib/tunnelModel/panel/index.js';

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
  personRow: PanelPersonRow;
  selected: boolean;
  onSelect?(): void;
}

/** The ONE liveness grammar (Ruling 3): the tier is derived server-side in
 * PeopleHub; rows render it, never re-derive it. Green only for live and
 * external-verified — unverified is NEVER green. */
const LIVENESS_LABEL: Record<string, string> = {
  'live': 'live',
  'external-verified': 'external · verified',
  'unverified': 'unverified',
  'exited': 'exited',
  'retired': 'retired',
  'failed': 'failed',
};

function rowOnline(personRow: PanelPersonRow): boolean {
  return personRow.person?.liveness === 'live' || personRow.person?.liveness === 'external-verified';
}

function rowStatusLine(personRow: PanelPersonRow): string {
  if (!personRow.person) return personRow.lane?.lastMessageAt ? 'Recent activity' : 'No messages yet';
  const status = LIVENESS_LABEL[personRow.person.liveness] ?? 'unverified';
  return `${personRow.person.provider} · ${status}`;
}

/** One DIRECT MESSAGES person row, keyed by durable agentId (ruling v2.1). */
export function DirectMessageRow({ personRow, selected, onSelect }: DirectMessageRowProps) {
  const name = personRow.person?.name ?? personRow.lane?.title ?? personRow.conversationId;
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
        <small>{rowStatusLine(personRow)}</small>
      </span>
      <span className={rowOnline(personRow) ? 'mc-status mc-status-live' : 'mc-status'} />
    </button>
  );
}
