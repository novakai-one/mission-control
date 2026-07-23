// Durable people projection (mission_mission-control-ux, rulings S3 + M2).
// The fourth live projection beside feed/rooms/roster: one fetch of
// GET /api/people on mount, a re-pull on every ws 'connected' transition
// (C5 pattern — frames dropped in an outage come back through the read
// interface), and failed reads keep the LAST GOOD list under an honest
// `stale` flag instead of wiping the panel. Identity is durable agentId
// everywhere; dm:<name> conversation ids remain transport only (v2.1).
import { useEffect, useState } from 'react';
import type { PeopleResponse, PersonView } from '../../../shared/people/schema.js';
import { connect } from '../agentSocket/index.js';
import { dmId, refetchOnReconnect, type Conversation, type ConversationId } from './index.js';

export interface PeopleSnapshot {
  people: PersonView[];
  /** True once the first fetch settled (success OR failure). */
  loaded: boolean;
  /** True while the newest read failed — the list shown is the last good one. */
  stale: boolean;
}

export function emptyPeopleSnapshot(): PeopleSnapshot {
  return { people: [], loaded: false, stale: false };
}

type ApplyPeople = (update: (current: PeopleSnapshot) => PeopleSnapshot) => void;

function loadPeople(apply: ApplyPeople): void {
  fetch('/api/people')
    .then((response) => response.json())
    .then((data: PeopleResponse) => apply(() => ({ people: data.people ?? [], loaded: true, stale: false })))
    .catch(() => apply((current) => ({ ...current, loaded: true, stale: true })));
}

/** Exported seam (mirrors mountFeed/watchRooms): the hook is its only app
 * caller; tests drive it directly. Returns the unmount. */
export function mountPeople(apply: ApplyPeople): () => void {
  let live = true;
  const guarded: ApplyPeople = (update) => {
    if (live) apply(update);
  };
  connect();
  loadPeople(guarded);
  const offReload = refetchOnReconnect(() => loadPeople(guarded));
  return () => {
    live = false;
    offReload();
  };
}

export function usePeople(): PeopleSnapshot {
  const [snapshot, setSnapshot] = useState<PeopleSnapshot>(emptyPeopleSnapshot);
  useEffect(() => mountPeople((update) => setSnapshot(update)), []);
  return snapshot;
}

/* ---------- Shared panel view-model (Task 2.3, ruling msg_d528e320) ---------
   ONE row set both rails render. Identity/grouping/React keys are the durable
   agentId (rowId); the dm:<name> conversation id is TRANSPORT only — two
   durable people sharing a display name are two rows addressing one mailbox
   (known, filed external-envelope-id limitation). Buckets:
     live     — runtime running, or durable live/spawning (an external chief
                with no PTY is LIVE — absence of runtime is not absence).
     quiet    — not live, not archived, and reachable: a Chris-party lane
                exists (recency order), or identity is durable.
     archived — durable retired/failed, plus dead sessions (runtime-only
                exited with no lane): out of the default view (#6/#7).
   Rooms pass through in buildConversations' recency order — per-view chrome
   (caps, ROOM_LIMIT) may WINDOW these arrays but never reorder them (M1). */

export interface PanelPersonRow {
  /** Durable agentId; falls back to the lane id ONLY when no identity exists. */
  rowId: string;
  /** Transport pointer: dm:<mailboxName>. Never an identity key. */
  conversationId: ConversationId;
  /** null = feed-history name the object model has never heard of. */
  person: PersonView | null;
  /** The derived lane when history/registration produced one. */
  lane: Conversation | null;
}

export interface PanelLanes {
  rooms: Conversation[];
  live: PanelPersonRow[];
  quiet: PanelPersonRow[];
  archived: PanelPersonRow[];
}

function isLivePerson(person: PersonView): boolean {
  return person.runtime?.status === 'running'
    || person.durableStatus === 'live' || person.durableStatus === 'spawning';
}

function isArchivedPerson(person: PersonView, lane: Conversation | undefined): boolean {
  if (person.durableStatus === 'retired' || person.durableStatus === 'failed') return true;
  // Dead session: runtime-only exited with nothing said in any Chris-party lane.
  return person.durableStatus === null && person.runtime?.status === 'exited' && !lane;
}

function byName(left: PanelPersonRow, right: PanelPersonRow): number {
  return (left.person?.name ?? left.rowId).localeCompare(right.person?.name ?? right.rowId);
}

/** Quiet rows read in lane-recency order; lane-less durable rows go last, alpha. */
function byLaneRecency(left: PanelPersonRow, right: PanelPersonRow): number {
  const leftAt = left.lane?.lastMessageAt ?? '';
  const rightAt = right.lane?.lastMessageAt ?? '';
  if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
  return byName(left, right);
}

export function buildPanelLanes(
  conversations: Conversation[],
  people: PersonView[],
  _feed: unknown[],
): PanelLanes {
  const rooms = conversations.filter((lane) => lane.kind !== 'dm');
  const dmLanes = new Map(conversations.filter((lane) => lane.kind === 'dm').map((lane) => [lane.title, lane]));
  const live: PanelPersonRow[] = [];
  const quiet: PanelPersonRow[] = [];
  const archived: PanelPersonRow[] = [];
  const namesWithIdentity = new Set<string>();

  for (const person of people) {
    namesWithIdentity.add(person.name);
    const lane = dmLanes.get(person.name) ?? null;
    const row: PanelPersonRow = { rowId: person.agentId, conversationId: dmId(person.name), person, lane };
    if (isLivePerson(person)) live.push(row);
    else if (isArchivedPerson(person, lane ?? undefined)) archived.push(row);
    else quiet.push(row);
  }
  // Lanes only history knows about — no identity to invent, still reachable.
  for (const [name, lane] of dmLanes) {
    if (namesWithIdentity.has(name)) continue;
    quiet.push({ rowId: lane.id, conversationId: lane.id, person: null, lane });
  }
  return {
    rooms,
    live: live.sort(byName),
    quiet: quiet.sort(byLaneRecency),
    archived: archived.sort(byName),
  };
}
