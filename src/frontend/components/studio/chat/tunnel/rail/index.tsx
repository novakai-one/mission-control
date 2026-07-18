// Messenger rail — ONE conversation index (C24): Needs you / Unread / Recent
// / All over a single search + kind filter. Every lane appears exactly once,
// in its highest section. There is no parallel people list: the live roster
// appears only inside the collapsed New-room picker. Unread is quiet ink and
// weight (C22a) — gold belongs to the amber engine's single lane alone.
import React, { useState } from 'react';
import type {
  Conversation,
  ConversationId,
  RosterEntry,
} from '../../../../../lib/tunnelModel/index.js';
import './index.css';

type KindFilter = 'all' | 'people' | 'rooms';

interface MessengerRailProps {
  roster: RosterEntry[];
  conversations: Conversation[];
  /** Derived from the ReadCursor store — never a store of its own. */
  unread: Record<ConversationId, number>;
  selectedId: ConversationId | null;
  /** The lane whose latest word holds the app's single amber right now. */
  goldId: ConversationId | null;
  settlingId: ConversationId | null;
  onSelect(conversation: Conversation): void;
  onStartChat(members: string[], name: string): Promise<void>;
}

interface Section {
  label: string;
  lanes: Conversation[];
}

/** Split the (recency-sorted) lanes into the four index sections; each lane
 * lands in its FIRST matching section only. */
export function buildSections(
  conversations: Conversation[],
  unread: Record<ConversationId, number>,
  goldId: ConversationId | null,
): Section[] {
  const needs: Conversation[] = [];
  const unreadLanes: Conversation[] = [];
  const recent: Conversation[] = [];
  const rest: Conversation[] = [];
  for (const lane of conversations) {
    if (lane.id === goldId) needs.push(lane);
    else if ((unread[lane.id] ?? 0) > 0) unreadLanes.push(lane);
    else if (lane.lastMessageAt) recent.push(lane);
    else rest.push(lane);
  }
  return [
    { label: 'Needs you', lanes: needs },
    { label: 'Unread', lanes: unreadLanes },
    { label: 'Recent', lanes: recent },
    { label: 'All', lanes: rest },
  ].filter((section) => section.lanes.length > 0);
}

function matchesFilter(lane: Conversation, kind: KindFilter, query: string): boolean {
  if (kind === 'people' && lane.kind !== 'dm') return false;
  if (kind === 'rooms' && lane.kind === 'dm') return false;
  if (query && !lane.title.toLowerCase().includes(query)) return false;
  return true;
}

function NewRoomPicker(props: {
  roster: RosterEntry[];
  onStartChat: MessengerRailProps['onStartChat'];
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
    <div className="st-ms-picker">
      <div className="st-ms-label">New room</div>
      <div className="st-ms-list">
        {props.roster.map((agent) => (
          <button
            key={agent.name}
            type="button"
            className={picked.has(agent.name) ? 'st-ms-agent st-ms-agent-on' : 'st-ms-agent'}
            onClick={() => toggle(agent.name)}
          >
            <span className="st-ms-dot" />
            <span className="st-ms-agent-name">{agent.name}</span>
          </button>
        ))}
        {props.roster.length === 0 && <div className="st-ms-quiet">No live agents</div>}
      </div>
      {picked.size > 0 && (
        <div className="st-ms-name">
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
      {error && <div className="st-ms-error">{error}</div>}
    </div>
  );
}

const FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'people', label: 'People' },
  { id: 'rooms', label: 'Rooms' },
];

export function MessengerRail(props: MessengerRailProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [picking, setPicking] = useState(false);

  const needle = query.trim().toLowerCase();
  const visible = props.conversations.filter((lane) => matchesFilter(lane, kind, needle));
  const sections = buildSections(visible, props.unread, props.goldId);

  function laneClass(lane: Conversation, count: number): string {
    let names = 'st-ms-chat';
    if (lane.id === props.selectedId) names += ' st-ms-chat-on';
    if (lane.id === props.goldId) names += ' st-ms-chat-gold';
    if (lane.id === props.settlingId) names += ' st-ms-chat-settling';
    if (count > 0 && lane.id !== props.goldId) names += ' st-ms-chat-unread';
    return names;
  }

  return (
    <div className="st-ms-rail">
      <div className="st-ms-search">
        <input
          aria-label="Search conversations"
          placeholder="Search"
          value={query}
          onChange={(change) => setQuery(change.target.value)}
        />
      </div>
      <div className="st-ms-chips" role="radiogroup" aria-label="Conversation kind">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="radio"
            aria-checked={kind === filter.id}
            className={kind === filter.id ? 'st-ms-chip st-ms-chip-on' : 'st-ms-chip'}
            onClick={() => setKind(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {sections.map((section) => (
        <React.Fragment key={section.label}>
          <div className="st-ms-label">{section.label}</div>
          <div className="st-ms-list">
            {section.lanes.map((lane) => {
              const count = props.unread[lane.id] ?? 0;
              return (
                <button
                  key={lane.id}
                  type="button"
                  className={laneClass(lane, count)}
                  onClick={() => props.onSelect(lane)}
                >
                  <span className="st-ms-chat-title">{lane.title}</span>
                  {count > 0 && <span className="st-ms-count">{count}</span>}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
      {sections.length === 0 && <div className="st-ms-quiet">No matches</div>}
      {picking ? (
        <NewRoomPicker roster={props.roster} onStartChat={props.onStartChat} onClose={() => setPicking(false)} />
      ) : (
        <button type="button" className="st-ms-start" onClick={() => setPicking(true)}>New room</button>
      )}
    </div>
  );
}
