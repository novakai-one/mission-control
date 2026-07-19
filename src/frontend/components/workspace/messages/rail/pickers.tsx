// New-lane pickers (round 3, M5). NewRoomPicker: member multi-pick + name,
// POSTed through onStartChat. NewDmPicker: single-pick — a DM lane is
// derived, not created on the server, so picking a known agent opens the
// lane immediately. Both list KNOWN agents (model.knownAgentsFor), never
// just the live roster, so an empty roster can't dead-end either flow.
// Attachments swap through resolveStyle (doctrine §B); visuals live in the
// rail's index.css.
import React, { useState } from 'react';
import { initialFor, type KnownAgent } from '../model.js';
import { PICKER_STYLE, resolveStyle } from '../styles/index.js';

interface PickerProps {
  knownAgents: KnownAgent[];
  onClose(): void;
}

function AgentRow(props: { agent: KnownAgent; picked: boolean; onPick(): void }) {
  return (
    <button
      type="button"
      className={resolveStyle(PICKER_STYLE.agent, props.picked && PICKER_STYLE.agentPicked)}
      title={props.agent.name}
      onClick={props.onPick}
    >
      <span className="msg-person-av msg-picker-av" aria-hidden="true">{initialFor(props.agent.name)}</span>
      <span className="msg-picker-name-text">{props.agent.name}</span>
      {props.agent.live && <small className="msg-picker-tag">live</small>}
    </button>
  );
}

/** The scrollable known-agent list both pickers share. */
function AgentList(props: {
  knownAgents: KnownAgent[];
  picked(agent: KnownAgent): boolean;
  onPick(name: string): void;
}) {
  return (
    <div className="msg-picker-list">
      {props.knownAgents.map((agent) => (
        <AgentRow
          key={agent.name}
          agent={agent}
          picked={props.picked(agent)}
          onPick={() => props.onPick(agent.name)}
        />
      ))}
      {props.knownAgents.length === 0 && <div className="msg-picker-quiet">No known agents yet</div>}
    </div>
  );
}

/** Multi-pick room picker: pick members, name the room, Create posts it
 *  through onStartChat. */
export function NewRoomPicker(props: PickerProps & { onStartChat(members: string[], name: string): Promise<void> }) {
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
    <div className={resolveStyle(PICKER_STYLE.base)}>
      <AgentList
        knownAgents={props.knownAgents}
        picked={(agent) => picked.has(agent.name)}
        onPick={toggle}
      />
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

/** Single-pick DM picker: picking a known agent opens the derived DM lane
 *  immediately (a DM is not created on the server). */
export function NewDmPicker(props: PickerProps & { onOpenDm(name: string): void }) {
  function open(agentName: string): void {
    props.onOpenDm(agentName);
    props.onClose();
  }

  return (
    <div className={resolveStyle(PICKER_STYLE.base)}>
      <AgentList knownAgents={props.knownAgents} picked={() => false} onPick={open} />
    </div>
  );
}
