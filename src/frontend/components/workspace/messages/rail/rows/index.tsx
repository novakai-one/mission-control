// Rail row components (Task 2.4 + S1): person rows keyed by durable agentId
// and archived lanes. Split from rail/index.tsx — presentation only; all
// derivation stays in the shared panel model.
import React from 'react';
import type { ArchivedLane } from '../../../../../../shared/people/schema.js';
import type { Conversation } from '../../../../../lib/tunnelModel/index.js';
import type { PanelPersonRow } from '../../../../../lib/tunnelModel/panel/index.js';
import { PRESENCE_LABEL, initialFor, presenceToneFor } from '../../model.js';
import './index.css';

/** Presence for a person row: unread wins, then running PTY or live durable
 * identity (an external chief with no PTY IS online), else gray. */
function personTone(personRow: PanelPersonRow, count: number): ReturnType<typeof presenceToneFor> {
  if (count > 0) return 'amber';
  if (personRow.person?.runtime?.status === 'running') return 'green';
  if (personRow.person?.durableStatus === 'live' || personRow.person?.durableStatus === 'spawning') return 'green';
  return 'gray';
}

/** The quiet second line: provider plus the honest status word. */
function personRole(personRow: PanelPersonRow): string {
  const provider = personRow.person?.provider ?? 'agent';
  const status = personRow.person?.runtime?.status
    ?? (personRow.person ? personRow.person.durableStatus ?? 'unregistered' : 'history');
  return `${provider} · ${status}`;
}

export function PersonRow(props: {
  row: PanelPersonRow;
  label: string;
  count: number;
  selected: boolean;
  onSelect(conversation: Conversation): void;
}) {
  const personRow = props.row;
  const name = personRow.person?.name ?? personRow.lane?.title ?? props.label;
  const lane: Conversation = personRow.lane ?? { id: personRow.conversationId, kind: 'dm', title: name };
  const tone = personTone(personRow, props.count);
  const role = personRole(personRow);
  const label = `${props.label}, ${role}, ${PRESENCE_LABEL[tone]}`;
  const classes = props.selected ? 'msg-person is-selected' : 'msg-person';
  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      aria-current={props.selected ? 'true' : undefined}
      onClick={() => props.onSelect(lane)}
    >
      <span className="msg-person-av" aria-hidden="true">{initialFor(name)}</span>
      <span className="msg-person-meta">
        <strong title={props.label}>{props.label}</strong>
        <small title={role}>{role}</small>
      </span>
      <span className={`msg-dot msg-dot-${tone}`} aria-hidden="true" />
    </button>
  );
}

/** One archived lane row (S1): room or person, out of the default view. */
export function ArchivedRow(props: {
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
      className={props.selected ? 'msg-person is-selected' : 'msg-person'}
      aria-label={`${lane.title}, ${reason}`}
      onClick={() => props.onSelect(target)}
    >
      {lane.kind === 'room'
        ? <span className="msg-hash" aria-hidden="true">#</span>
        : <span className="msg-person-av" aria-hidden="true">{initialFor(lane.title)}</span>}
      <span className="msg-person-meta">
        <strong title={lane.title}>{lane.title}</strong>
        <small title={reason}>{reason}</small>
      </span>
    </button>
  );
}

