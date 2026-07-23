// Mission Control presentational panels — the left conversation rail (with
// the room composer), the phase strip, the health bar, and the right live
// squad / attention column. State that only a panel reads lives inside the
// panel; everything shared stays on MissionControl.
import React, { useState } from 'react';
import type { CanonicalEvent } from '../../../../../shared/provider/schema.js';
import type { ThreadRecord } from '../../../../../shared/project/schema.js';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import { MISSION_ROOM_CONVERSATION_ID } from '../../../../lib/missionRoom/index.js';
import type {
  Conversation,
  ConversationId,
  RosterEntry,
  TunnelRoom,
} from '../../../../lib/tunnelModel/index.js';
import type { ArchivedLane } from '../../../../../shared/people/schema.js';
import { mergeArchive, useArchive, type PanelPersonRow } from '../../../../lib/tunnelModel/people.js';
import { PanelGlyph } from '../../../ui/index.js';
import type { MissionConfidence } from '../index.js';
import type { MissionHealthMeasure } from '../model.js';
import { AgentRow, DirectMessageRow } from './agentRow.js';
import './index.css';

const ROOM_LIMIT = 5;
const PHASES = ['Understand', 'Design', 'Build', 'Verify'] as const;

interface MissionRailProps {
  open: boolean;
  roster: RosterEntry[];
  agents: AgentInfo[];
  missionRooms: Conversation[];
  /** The shared agentId-keyed buckets (Task 2.3) — same data as Messages. */
  livePeople: PanelPersonRow[];
  quietPeople: PanelPersonRow[];
  archivedPeople: PanelPersonRow[];
  /** Newest people read failed — list shown is the last good one (M2). */
  peopleStale: boolean;
  selectedId: ConversationId | null;
  onToggle(): void;
  onSelectConversation(conversation: Conversation): void;
  onSelectPerson(agent: AgentInfo): void;
  onRoomCreated(room: TunnelRoom): void;
}

export function MissionRail(props: MissionRailProps) {
  const [roomsExpanded, setRoomsExpanded] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [members, setMembers] = useState<ReadonlySet<string>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const visibleRooms = roomsExpanded ? props.missionRooms : props.missionRooms.slice(0, ROOM_LIMIT);

  function toggleMember(agentName: string): void {
    setMembers((current) => {
      const next = new Set(current);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  }

  async function createRoom(): Promise<void> {
    const name = roomName.trim();
    if (!name || members.size === 0 || creating) return;
    setCreating(true);
    setRoomError(null);
    try {
      const response = await fetch('/api/user/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, members: [...members] }),
      });
      const payload = await response.json().catch(() => null) as { room?: TunnelRoom; error?: string } | null;
      if (!response.ok || !payload?.room) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      props.onRoomCreated(payload.room);
      setRoomName('');
      setMembers(new Set());
      setComposerOpen(false);
      setRoomsExpanded(true);
    } catch (failure) {
      setRoomError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setCreating(false);
    }
  }

  if (!props.open) {
    return (
      <aside className="mc-mission-rail">
        <button type="button" className="mc-rail-reopen" onClick={props.onToggle} aria-label="Open mission rail" title="Open mission rail">
          <PanelGlyph open={false} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="mc-mission-rail">
      <div className="mc-rail-brand">
        <div className="mc-brand">
          <span className="studio-glyph">&gt;_</span>
          <b>novakai<span>&nbsp;command</span></b>
        </div>
        <button type="button" className="mc-rail-toggle" onClick={props.onToggle} aria-label="Collapse mission rail" title="Collapse mission rail">
          <PanelGlyph open />
        </button>
      </div>

      <div className="mc-section-label mc-section-heading">
        <button
          type="button"
          className="mc-section-toggle"
          onClick={() => setRoomsExpanded((expanded) => !expanded)}
          aria-expanded={roomsExpanded}
        >
          <span>Mission rooms</span>
          <span>{roomsExpanded ? '−' : `+${Math.max(0, props.missionRooms.length - ROOM_LIMIT)}`}</span>
        </button>
        <button
          type="button"
          className="mc-room-create-toggle"
          onClick={() => {
            setComposerOpen((open) => !open);
            setRoomError(null);
          }}
          aria-expanded={composerOpen}
          aria-label="New mission room"
          title="New mission room"
        >
          +
        </button>
      </div>
      {composerOpen && (
        <div className="mc-room-composer">
          <input
            aria-label="Mission room name"
            placeholder="Room name"
            value={roomName}
            autoFocus
            onChange={(change) => setRoomName(change.target.value)}
            onKeyDown={(press) => {
              if (press.key === 'Enter') void createRoom();
              if (press.key === 'Escape') setComposerOpen(false);
            }}
          />
          <div className="mc-room-member-list" aria-label="Room participants">
            {props.roster.map((agent) => (
              <button
                type="button"
                key={agent.name}
                className={members.has(agent.name) ? 'mc-room-member is-selected' : 'mc-room-member'}
                onClick={() => toggleMember(agent.name)}
              >
                <span />
                {agent.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mc-room-create"
            disabled={!roomName.trim() || members.size === 0 || creating}
            onClick={() => void createRoom()}
          >
            {creating ? 'Creating…' : 'Create room'}
          </button>
          {roomError && <div className="mc-room-error">{roomError}</div>}
        </div>
      )}
      <div className="mc-room-list">
        {visibleRooms.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            className={`${conversation.id === MISSION_ROOM_CONVERSATION_ID ? 'mc-room-pinned ' : ''}${conversation.id === props.selectedId ? 'mc-room mc-room-active' : 'mc-room'}`}
            onClick={() => props.onSelectConversation(conversation)}
          >
            <span>{conversation.id === MISSION_ROOM_CONVERSATION_ID ? '◆' : '#'}</span>
            <strong>{conversation.title}</strong>
            <small>{conversation.id === MISSION_ROOM_CONVERSATION_ID ? 'Mission Room · snapshot' : conversation.lastMessageAt ? 'Recent activity' : 'No messages yet'}</small>
          </button>
        ))}
      </div>

      <div className="mc-section-label mc-section-spaced">Direct messages</div>
      {props.peopleStale && <div className="mc-rail-stale">People directory stale — reconnecting…</div>}
      <div className="mc-rail-agents">
        {[...props.livePeople, ...props.quietPeople].map((row) => (
          <DirectMessageRow
            key={row.rowId}
            row={row}
            selected={row.conversationId === props.selectedId}
            onSelect={() => selectRow(row, props)}
          />
        ))}
      </div>
      <ArchivedSection
        archivedPeople={props.archivedPeople}
        selectedId={props.selectedId}
        onSelectConversation={props.onSelectConversation}
      />
    </aside>
  );
}

/** Archive disclosure (S1): fetched on open — rooms (archived / closed
 * mission) from the endpoint plus client-known retired people. */
function ArchivedSection(props: {
  archivedPeople: PanelPersonRow[];
  selectedId: ConversationId | null;
  onSelectConversation(conversation: Conversation): void;
}) {
  const [open, setOpen] = useState(false);
  const archive = useArchive(open);
  const lanes = mergeArchive(archive.lanes, props.archivedPeople);
  const label = open && archive.loaded ? ` · ${lanes.length}` : props.archivedPeople.length > 0 ? ` · ${props.archivedPeople.length}+` : '';
  return (
    <details className="mc-archived" onToggle={(toggle) => setOpen((toggle.target as HTMLDetailsElement).open)}>
      <summary className="mc-section-label mc-archived-summary">Archived{label}</summary>
      <div className="mc-rail-agents">
        {archive.failed && <div className="mc-rail-stale">Archive unavailable right now.</div>}
        {open && archive.loaded && !archive.failed && lanes.length === 0 && (
          <div className="mc-rail-stale">Nothing archived.</div>
        )}
        {lanes.map((lane) => (
          <ArchivedLaneRow
            key={lane.id}
            lane={lane}
            selected={lane.conversationId === props.selectedId}
            onSelect={props.onSelectConversation}
          />
        ))}
      </div>
    </details>
  );
}

function ArchivedLaneRow(props: {
  lane: ArchivedLane;
  selected: boolean;
  onSelect(conversation: Conversation): void;
}) {
  const { lane } = props;
  const target: Conversation = lane.kind === 'room'
    ? { id: lane.conversationId, kind: 'room', title: lane.title }
    : { id: lane.conversationId, kind: 'dm', title: lane.title };
  const reason = lane.reason === 'room-archived' ? 'archived'
    : lane.reason === 'mission-closed' ? `mission closed${lane.missionId ? ` · ${lane.missionId}` : ''}` : 'retired';
  return (
    <button
      type="button"
      className={props.selected ? 'mc-agent mc-agent-selected' : 'mc-agent'}
      onClick={() => props.onSelect(target)}
    >
      <span className="mc-avatar">{lane.kind === 'room' ? '#' : lane.title.charAt(0).toUpperCase()}</span>
      <span className="mc-agent-copy">
        <strong>{lane.title}</strong>
        <small>{reason}</small>
      </span>
      <span className="mc-status" />
    </button>
  );
}

/** Row click: runtime-backed people route through onSelectPerson (thread/agent
 * wiring); durable-only or history-only rows open the lane directly — the
 * lane id is transport, so a missing derived lane still opens an overlay. */
function selectRow(row: PanelPersonRow, props: MissionRailProps): void {
  const agent = row.person ? props.agents.find((candidate) => candidate.agentId === row.person?.agentId) : undefined;
  if (agent) return props.onSelectPerson(agent);
  const lane = row.lane ?? { id: row.conversationId, kind: 'dm' as const, title: row.person?.name ?? row.conversationId };
  props.onSelectConversation(lane);
}

/** Live-mode hero (non-snapshot): thread kicker, title, facts, confidence. */
export function MissionLiveHero(props: { thread: ThreadRecord | null; title: string; facts: string; confidence?: MissionConfidence | null }) {
  return (
    <header className="mc-mission-hero">
      <div className="mc-mission-outcome">
        <span className="mc-kicker">{props.thread ? 'Active mission' : 'Mission control'}</span>
        <h1>{props.title}</h1>
        {props.facts && <p>{props.facts}</p>}
      </div>
      {props.confidence && (
        <div className="mc-confidence">
          <strong>{props.confidence.score}</strong>
          <span>{props.confidence.label}</span>
          <small>{props.confidence.evidence}</small>
        </div>
      )}
    </header>
  );
}

export function MissionStageStrip() {
  const [activePhase, setActivePhase] = useState(2);
  return (
    <section className="mc-stage-strip" aria-label="Mission phases">
      {PHASES.map((phase, index) => (
        <button
          type="button"
          className={`mc-stage mc-stage-${index < activePhase ? 'done' : index === activePhase ? 'active' : 'waiting'}`}
          key={phase}
          onClick={() => setActivePhase(index)}
          aria-pressed={index === activePhase}
        >
          <span>{index + 1}</span>
          <strong>{phase}</strong>
          <small>{index < activePhase ? 'Complete' : index === activePhase ? 'In progress' : 'Waiting'}</small>
        </button>
      ))}
    </section>
  );
}

export function MissionHealthBar({ health }: { health: MissionHealthMeasure[] }) {
  if (health.length === 0) return null;
  return (
    <section className="mc-health-bar" aria-label="Mission health">
      <div className="mc-health-heading">
        <span className="mc-kicker">Mission health</span>
        <strong>{health.length}</strong>
        <small>Live measures</small>
      </div>
      {health.map((measure) => (
        <div className={measure.tone === 'attention' ? 'mc-health-item mc-health-attention' : 'mc-health-item'} key={measure.id}>
          <span>{measure.label}</span>
          <strong>{measure.value}</strong>
          <small>{measure.detail}</small>
        </div>
      ))}
    </section>
  );
}

interface MissionEvidenceProps {
  open: boolean;
  squad: AgentInfo[];
  running: number;
  selectedAgentId?: string | null;
  approval: CanonicalEvent | null;
  onToggle(): void;
  onSelectPerson(agent: AgentInfo): void;
  onReviewAttention?(): void;
}

export function MissionEvidence(props: MissionEvidenceProps) {
  if (!props.open) {
    return (
      <aside className="mc-evidence-column">
        <button type="button" className="mc-rail-reopen" onClick={props.onToggle} aria-label="Open live squad rail" title="Open live squad rail">
          <PanelGlyph open={false} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="mc-evidence-column">
      <header className="mc-evidence-head">
        <span className="mc-kicker">Live squad</span>
        <button type="button" className="mc-rail-toggle" onClick={props.onToggle} aria-label="Collapse live squad rail" title="Collapse live squad rail">
          <PanelGlyph open />
        </button>
      </header>
      {props.squad.length > 0 && (
        <section className="mc-squad">
          <header>
            <strong>{props.running} live · {props.squad.length} attached</strong>
          </header>
          {props.squad.map((agent) => (
            <AgentRow
              key={agent.agentId}
              agent={agent}
              selected={agent.agentId === props.selectedAgentId}
              onSelect={() => props.onSelectPerson(agent)}
            />
          ))}
        </section>
      )}

      {props.approval && (
        <section className="mc-attention">
          <span className="mc-kicker">Needs you</span>
          <h3>{props.approval.text}</h3>
          {props.approval.approval?.reason && <p>{props.approval.approval.reason}</p>}
          {props.onReviewAttention && (
            <button type="button" onClick={props.onReviewAttention}>Review decision</button>
          )}
        </section>
      )}
    </aside>
  );
}
