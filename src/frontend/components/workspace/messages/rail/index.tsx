// RoomsRail — the storyboard's left third: "All" tab + ghost glyph header,
// MISSION ROOMS (hash rows, unread badges), DIRECT MESSAGES (avatar, name,
// role, presence dot). TEAMS is hidden by owner decision (no backend "team").
// All visuals come from tokens.css via --msg-* vars; all derivation from
// model.ts. Change lives there, not here.
import React, { useState } from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import type {
  Conversation,
  ConversationId,
  RosterEntry,
} from '../../../../lib/tunnelModel/index.js';
import {
  PRESENCE_LABEL,
  initialFor,
  presenceToneFor,
  roleFor,
  roomLabelFor,
  splitRailSections,
} from '../model.js';
import './index.css';

interface RoomsRailProps {
  conversations: Conversation[];
  unread: Record<ConversationId, number>;
  selectedId: ConversationId | null;
  agents: AgentInfo[];
  roster: RosterEntry[];
  onSelect(conversation: Conversation): void;
  onStartChat(members: string[], name: string): Promise<void>;
}

function RoomRow(props: {
  lane: Conversation;
  count: number;
  selected: boolean;
  onSelect(conversation: Conversation): void;
}) {
  const classes = props.selected ? 'msg-room is-selected' : 'msg-room';
  return (
    <button
      type="button"
      className={classes}
      aria-current={props.selected ? 'true' : undefined}
      onClick={() => props.onSelect(props.lane)}
    >
      <span className="msg-hash" aria-hidden="true">#</span>
      <span className="msg-room-name">{roomLabelFor(props.lane)}</span>
      {props.count > 0 && <span className="msg-badge">{props.count}</span>}
    </button>
  );
}

function PersonRow(props: {
  lane: Conversation;
  agents: AgentInfo[];
  count: number;
  selected: boolean;
  onSelect(conversation: Conversation): void;
}) {
  const agent = props.agents.find((entry) => entry.title === props.lane.title);
  const tone = presenceToneFor(props.count, agent?.status ?? null);
  const role = agent?.provider ?? 'agent';
  const label = `${props.lane.title}, ${role}, ${PRESENCE_LABEL[tone]}`;
  const classes = props.selected ? 'msg-person is-selected' : 'msg-person';
  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      aria-current={props.selected ? 'true' : undefined}
      onClick={() => props.onSelect(props.lane)}
    >
      <span className="msg-person-av" aria-hidden="true">{initialFor(props.lane.title)}</span>
      <span className="msg-person-meta">
        <strong>{props.lane.title}</strong>
        <small>{role}</small>
      </span>
      <span className={`msg-dot msg-dot-${tone}`} aria-hidden="true" />
    </button>
  );
}

function NewRoomPicker(props: {
  roster: RosterEntry[];
  onStartChat(members: string[], name: string): Promise<void>;
  onClose(): void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(agentName: string): void {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  }

  async function create(): Promise<void> {
    if (!name.trim() || picked.size === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      await props.onStartChat([...picked], name.trim());
      props.onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setCreating(false);
    }
  }

  function handleNameKey(press: React.KeyboardEvent<HTMLInputElement>): void {
    if (press.key === 'Enter') void create();
    if (press.key === 'Escape') props.onClose();
  }

  return (
    <div className="msg-picker">
      <div className="msg-picker-list">
        {props.roster.map((entry) => (
          <button
            key={entry.name}
            type="button"
            className={picked.has(entry.name) ? 'msg-picker-agent is-picked' : 'msg-picker-agent'}
            onClick={() => toggle(entry.name)}
          >
            <span className="msg-person-av msg-picker-av" aria-hidden="true">{initialFor(entry.name)}</span>
            <span>{entry.name}</span>
          </button>
        ))}
        {props.roster.length === 0 && <div className="msg-picker-quiet">No live agents</div>}
      </div>
      {picked.size > 0 && (
        <div className="msg-picker-name">
          <input
            aria-label="Room name"
            placeholder="Room name"
            value={name}
            autoFocus
            onChange={(change) => setName(change.target.value)}
            onKeyDown={handleNameKey}
          />
          <button type="button" disabled={!name.trim() || creating} onClick={() => void create()}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}
      {error && <div className="msg-picker-error">{error}</div>}
    </div>
  );
}

export function RoomsRail(props: RoomsRailProps) {
  const [picking, setPicking] = useState(false);
  const sections = splitRailSections(props.conversations);

  return (
    <aside className="msg-rail" aria-label="Conversations">
      <div className="msg-tabbar">
        <div className="msg-tabrow">
          <button type="button" className="msg-tab is-active">All</button>
        </div>
        <button
          type="button"
          className="msg-ghost"
          aria-label="New room"
          title="New room"
          onClick={() => setPicking((current) => !current)}
        >
          <span className="msg-ghost-glyph" aria-hidden="true" />
        </button>
      </div>
      <div className="msg-rail-body">
        {picking && (
          <NewRoomPicker
            roster={props.roster}
            onStartChat={props.onStartChat}
            onClose={() => setPicking(false)}
          />
        )}
        <div className="msg-section">Mission rooms</div>
        <div className="msg-rail-stack">
          {sections.rooms.map((lane) => (
            <RoomRow
              key={lane.id}
              lane={lane}
              count={props.unread[lane.id] ?? 0}
              selected={lane.id === props.selectedId}
              onSelect={props.onSelect}
            />
          ))}
        </div>
        <div className="msg-section">Direct messages</div>
        <div className="msg-rail-stack">
          {sections.directs.map((lane) => (
            <PersonRow
              key={lane.id}
              lane={lane}
              agents={props.agents}
              count={props.unread[lane.id] ?? 0}
              selected={lane.id === props.selectedId}
              onSelect={props.onSelect}
            />
          ))}
          {sections.directs.length === 0 && <div className="msg-rail-quiet">No agents yet</div>}
        </div>
      </div>
    </aside>
  );
}
