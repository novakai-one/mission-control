// Durable people projection (mission_mission-control-ux, rulings S3 + M2).
// The fourth live projection beside feed/rooms/roster: one fetch of
// GET /api/people on mount, a re-pull on every ws 'connected' transition
// (C5 pattern — frames dropped in an outage come back through the read
// interface), and failed reads keep the LAST GOOD list under an honest
// `stale` flag instead of wiping the panel. Identity is durable agentId
// everywhere; dm:<name> conversation ids remain transport only (v2.1).
import { useEffect, useState } from 'react';
import type { ArchiveResponse, ArchivedLane, PeopleResponse, PersonView } from '../../../shared/people/schema.js';
import { connect } from '../agentSocket/index.js';
import {
  CHRIS,
  conversationIdsFor,
  dmId,
  refetchOnReconnect,
  type Conversation,
  type ConversationId,
  type TunnelEnvelope,
} from './index.js';

/* ---------- Lane pruning (C3, audit S2 — moved here for ruling D2) ----------
   Chris sees only lanes he is party to. Precedence RULED by the audit —
   history dominates registration:
     (a) DM lane WITH history → visible ONLY if Chris is a party to that
         history; a registered agent whose lane holds nothing but
         agent↔agent traffic stays hidden.
     (b) EMPTY DM lane → kept iff its agent is registered, ANY status —
         Chris can start a DM with any teammate, running or exited.
     (c) the #team channel → always visible.
     (d) rooms → visible only when Chris is a member.
   Pure presentation-layer filter: conversationIdsFor is untouched and its
   fan-out semantics stay intact for attention/readCursor/review consumers.
   BOTH rails consume this now — "registered" means known to the people
   directory (durable ∪ runtime). */
function dmLaneStanding(feed: TunnelEnvelope[]): { hasHistory: Set<ConversationId>; chrisParty: Set<ConversationId> } {
  const hasHistory = new Set<ConversationId>();
  const chrisParty = new Set<ConversationId>();
  for (const message of feed) {
    for (const laneId of conversationIdsFor(message)) {
      if (!laneId.startsWith('dm:')) continue;
      hasHistory.add(laneId);
      if (message.from === CHRIS || message.to === CHRIS) chrisParty.add(laneId);
    }
  }
  return { hasHistory, chrisParty };
}

export function visibleLanesFor(
  lanes: Conversation[],
  feed: TunnelEnvelope[],
  agents: { title: string }[],
): Conversation[] {
  const registered = new Set(agents.map((agent) => agent.title));
  const { hasHistory, chrisParty } = dmLaneStanding(feed);
  return lanes.filter((entry) => {
    if (entry.kind === 'channel') return true;
    if (entry.kind === 'room') return entry.members?.includes(CHRIS) ?? false;
    if (hasHistory.has(entry.id)) return chrisParty.has(entry.id);
    return registered.has(entry.title);
  });
}

export interface PeopleSnapshot {
  people: PersonView[];
  /** Room lane ids the default view excludes (S1) — detail on demand. */
  archivedLaneIds: string[];
  /** True once the first fetch settled (success OR failure). */
  loaded: boolean;
  /** True while the newest read failed — the list shown is the last good one. */
  stale: boolean;
}

export function emptyPeopleSnapshot(): PeopleSnapshot {
  return { people: [], archivedLaneIds: [], loaded: false, stale: false };
}

type ApplyPeople = (update: (current: PeopleSnapshot) => PeopleSnapshot) => void;

function loadPeople(apply: ApplyPeople): void {
  fetch('/api/people')
    .then((response) => response.json())
    .then((data: PeopleResponse) => apply(() => ({ people: data.people ?? [], archivedLaneIds: data.archivedLaneIds ?? [], loaded: true, stale: false })))
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

/* ---------- On-demand archive read (ruling S1, Task 5.3) --------------------
   The default lane payloads stay lean: the archive endpoint is fetched only
   when Chris opens the disclosure. Fetched room archives merge with the
   client-known archived person rows; fetched person rows win on id collision
   (they carry the reason + provenance). */

export interface ArchiveState {
  lanes: ArchivedLane[];
  loaded: boolean;
  failed: boolean;
}

export function useArchive(open: boolean): ArchiveState {
  const [state, setState] = useState<ArchiveState>({ lanes: [], loaded: false, failed: false });
  useEffect(() => {
    if (!open || state.loaded) return;
    let live = true;
    fetch('/api/people/archive')
      .then((response) => response.json())
      .then((data: ArchiveResponse) => {
        if (live) setState({ lanes: data.archived ?? [], loaded: true, failed: false });
      })
      .catch(() => {
        if (live) setState({ lanes: [], loaded: true, failed: true });
      });
    return () => {
      live = false;
    };
  }, [open, state.loaded]);
  return state;
}

/** Merge the fetched archive with client-known archived person rows: fetched
 * entries are authoritative; client rows fill in what the endpoint cannot
 * know (dead runtime-only sessions). Everything keys by stable id. */
export function mergeArchive(fetched: ArchivedLane[], clientRows: PanelPersonRow[]): ArchivedLane[] {
  const seen = new Set(fetched.map((lane) => lane.id));
  const extras: ArchivedLane[] = clientRows
    .filter((row) => !seen.has(row.rowId))
    .map((row) => ({
      id: row.rowId,
      kind: 'person' as const,
      title: row.person?.name ?? row.lane?.title ?? row.rowId,
      conversationId: row.conversationId,
      reason: 'person-retired' as const,
      missionId: null,
      sourceRefs: [],
    }));
  const rooms = fetched.filter((lane) => lane.kind === 'room');
  const people = [...fetched.filter((lane) => lane.kind === 'person'), ...extras];
  return [...rooms, ...people.sort((left, right) => left.title.localeCompare(right.title))];
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
  archivedLaneIds: readonly string[] = [],
): PanelLanes {
  // S1 default view: archived/closed-mission room lanes leave the room list;
  // they stay reachable through the archive disclosure.
  const archivedIds = new Set(archivedLaneIds);
  const rooms = conversations.filter((lane) => lane.kind !== 'dm' && !archivedIds.has(lane.id));
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
