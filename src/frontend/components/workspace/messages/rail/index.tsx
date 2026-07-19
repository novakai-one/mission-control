// RoomsRail — the storyboard's left third: "All" tab + labeled New room /
// New DM entry points (M5) + desktop collapse toggle in the header; folded,
// the rail is a glyph strip with a reopen button (M2). MISSION ROOMS (hash
// rows, unread badges), DIRECT MESSAGES (avatar, name, role, presence dot).
// TEAMS is hidden by owner decision (no backend "team"). All visuals come
// from tokens.css via --msg-* vars; all derivation from model.ts. Change
// lives there, not here.
import React, { useState } from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import type {
  Conversation,
  ConversationId,
} from '../../../../lib/tunnelModel/index.js';
import {
  PRESENCE_LABEL,
  initialFor,
  presenceToneFor,
  roomLabelFor,
  splitRailSections,
  type KnownAgent,
} from '../model.js';
import { NEW_ACTION_STYLE, resolveStyle } from '../styles/index.js';
import { NewDmPicker, NewRoomPicker } from './pickers.js';
import './index.css';

interface RoomsRailProps {
  conversations: Conversation[];
  unread: Record<ConversationId, number>;
  selectedId: ConversationId | null;
  agents: AgentInfo[];
  /** Known agents (live + exited + feed-history names) for both pickers. */
  knownAgents: KnownAgent[];
  /** Desktop fold state (M2) — the strip shows only the reopen glyph. */
  collapsed: boolean;
  onToggleCollapse(): void;
  onSelect(conversation: Conversation): void;
  onStartChat(members: string[], name: string): Promise<void>;
  onOpenDm(name: string): void;
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
      <span className="msg-room-name" title={roomLabelFor(props.lane)}>{roomLabelFor(props.lane)}</span>
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
        <strong title={props.lane.title}>{props.lane.title}</strong>
        <small title={role}>{role}</small>
      </span>
      <span className={`msg-dot msg-dot-${tone}`} aria-hidden="true" />
    </button>
  );
}

type NewFlow = 'room' | 'dm';

export function RoomsRail(props: RoomsRailProps) {
  const [flow, setFlow] = useState<NewFlow | null>(null);
  const sections = splitRailSections(props.conversations);

  function toggleFlow(next: NewFlow): void {
    setFlow((current) => (current === next ? null : next));
  }

  return (
    <aside className="msg-rail" aria-label="Conversations">
      <button
        type="button"
        className="msg-ghost msg-rail-reopen"
        aria-label="Show conversations"
        title="Show conversations"
        aria-expanded={!props.collapsed}
        onClick={props.onToggleCollapse}
      >
        <span className="msg-ghost-glyph msg-glyph-rail" aria-hidden="true" />
      </button>
      <div className="msg-rail-inner">
        <div className="msg-tabbar">
          <div className="msg-tabrow">
            <button type="button" className="msg-tab is-active">All</button>
          </div>
          <div className="msg-tabactions">
            <button
              type="button"
              className="msg-ghost"
              aria-label="Hide conversations"
              title="Hide conversations"
              aria-expanded={!props.collapsed}
              onClick={props.onToggleCollapse}
            >
              <span className="msg-ghost-glyph msg-glyph-rail" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="msg-rail-body">
          <div className="msg-new-actions">
            <button
              type="button"
              className={resolveStyle(NEW_ACTION_STYLE.base, flow === 'room' && NEW_ACTION_STYLE.active)}
              aria-expanded={flow === 'room'}
              onClick={() => toggleFlow('room')}
            >
              New room
            </button>
            <button
              type="button"
              className={resolveStyle(NEW_ACTION_STYLE.base, flow === 'dm' && NEW_ACTION_STYLE.active)}
              aria-expanded={flow === 'dm'}
              onClick={() => toggleFlow('dm')}
            >
              New DM
            </button>
          </div>
          {flow === 'room' && (
            <NewRoomPicker
              knownAgents={props.knownAgents}
              onStartChat={props.onStartChat}
              onClose={() => setFlow(null)}
            />
          )}
          {flow === 'dm' && (
            <NewDmPicker
              knownAgents={props.knownAgents}
              onOpenDm={props.onOpenDm}
              onClose={() => setFlow(null)}
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
      </div>
    </aside>
  );
}
