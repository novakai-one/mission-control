// Mission Room V1 — pure snapshot derivation (plan Delta v2 S3/S4, M3/M4/M6, L2).
// MissionFacts in → MissionSnapshot out; no I/O. Every displayed fact carries
// provenance; every ambiguous fact is a labeled attention item (Chief Ruling #1).
import type {
  AttentionItem,
  ArtifactView,
  CurrentActivityView,
  MissionAssignmentView,
  MissionPulse,
  MissionSnapshot,
  PresenceView,
  ReadIssue,
  SourceRef,
  Sourced,
  TimelineEntry,
} from '../../../shared/missionView/schema.js';
import type { MessageEnvelope } from '../../messaging/types.js';
import type { MissionLinkage, RefValue } from '../linkage/index.js';
import type { PacketFile, RawRecord, RegistryEntry, RoomRecord, StoreName } from '../sources/index.js';
import { buildTree } from '../tree/index.js';

/** Everything deriveSnapshot needs: linkage output plus the other source reads. */
export interface MissionFacts {
  missionId: string;
  linkage: MissionLinkage;
  /** Raw store records — the object-model tree derives from these. */
  stores: Record<StoreName, RawRecord[]>;
  journal: MessageEnvelope[];
  journalPath: string;
  registry: RegistryEntry[];
  registryPath: string;
  registryObservedAt: string | null;
  rooms: RoomRecord[];
  roomsPath: string;
  packet: PacketFile[];
  readProblems: ReadIssue[];
  asOf: string;
}

const CLOSED_STATUSES = new Set(['done', 'closed', 'refiled']);

/** The deep derive: one mission, joined read-only, uncertainty preserved. */
export function deriveSnapshot(facts: MissionFacts): MissionSnapshot {
  const rooms = linkedRooms(facts);
  const attention = buildAttention(facts, rooms);
  const issues = [...facts.linkage.problems, ...facts.readProblems];
  return {
    mission: buildMission(facts.linkage.mission),
    pulse: buildPulse(facts, attention, issues),
    objective: buildObjective(facts.linkage),
    assignments: buildAssignments(facts.linkage.mission),
    presences: buildPresences(),
    currentActivity: buildActivity(),
    timeline: buildTimeline(facts, rooms),
    artifacts: buildArtifacts(facts),
    tree: buildTree(facts.missionId, facts.linkage.mission, facts.stores),
    attention,
    asOf: facts.asOf,
    issues,
  };
}

function buildMission(record: RawRecord): MissionSnapshot['mission'] {
  const source = [refOf(record)];
  const text = (field: string): Sourced<string | null> => ({ value: stringOrNull(record.block[field]), sourceRefs: source });
  return {
    id: String(record.block.id),
    title: { value: stringOrNull(record.block.title) ?? '', sourceRefs: source },
    status: { value: stringOrNull(record.block.status) ?? 'unknown', sourceRefs: source },
    owner: text('owner'),
    stage: text('stage'),
    priority: text('priority'),
  };
}

/** Pulse fields derived exactly per the M6 table, each with its sourceRef. */
function buildPulse(facts: MissionFacts, attention: AttentionItem[], issues: ReadIssue[]): MissionPulse {
  const block = facts.linkage.mission.block;
  const source = [refOf(facts.linkage.mission)];
  const closed = CLOSED_STATUSES.has(stringOrNull(block.status) ?? '');
  return {
    outcome: { value: stringOrNull(block.outcome) ?? stringOrNull(block.title), sourceRefs: source },
    phase: { value: stringOrNull(block.stage) ?? stringOrNull(block.status), sourceRefs: source },
    health: { value: healthOf(facts, attention, issues), sourceRefs: healthRefs(facts, attention, issues) },
    lastUpdate: { value: stringOrNull(block.updated), sourceRefs: source },
    nextCheckpoint: { value: closed ? null : stringOrNull(block.stage) ?? stringOrNull(block.status), sourceRefs: source },
    needsChris: needsChrisOf(facts),
  };
}

/** M6: attention/issues → 'attention'; invalid mission record → 'unknown'; else 'on-track'. */
function healthOf(facts: MissionFacts, attention: AttentionItem[], issues: ReadIssue[]): 'on-track' | 'attention' | 'unknown' {
  if (!facts.linkage.missionValid) return 'unknown';
  return attention.length > 0 || issues.length > 0 ? 'attention' : 'on-track';
}

/** C3: health cites the mission row PLUS the refs of every contributing attention item (deduped). */
function healthRefs(facts: MissionFacts, attention: AttentionItem[], issues: ReadIssue[]): SourceRef[] {
  const missionRef = refOf(facts.linkage.mission);
  if (attention.length === 0 && issues.length === 0) return [missionRef];
  const seen = new Set<string>();
  const refs: SourceRef[] = [];
  for (const sourceRef of [missionRef, ...attention.flatMap((item) => item.sourceRefs), ...issues.flatMap((problem) => problem.sourceRefs)]) {
    const refKey = `${sourceRef.store}|${sourceRef.recordId ?? ''}|${sourceRef.path ?? ''}|${sourceRef.line ?? ''}`;
    if (seen.has(refKey)) continue;
    seen.add(refKey); refs.push(sourceRef);
  }
  return refs;
}

function needsChrisOf(facts: MissionFacts): Sourced<boolean> {
  const source = facts.linkage.needsChrisSource;
  return { value: facts.linkage.needsChris, sourceRefs: source ? [refOf(source)] : [{ store: 'requests' }] };
}

/** An explicit objective ref resolved into a linked-context line (S4). */
function buildObjective(linkage: MissionLinkage): Sourced<string> | null {
  const record = linkage.objective;
  if (!record) return null;
  const value = stringOrNull(record.block.title) ?? stringOrNull(record.block.body) ?? String(record.block.id);
  return { value, sourceRefs: [refOf(record)] };
}

/** Mission-explicit assignments only (S4); the scalar owner is never promoted. */
function buildAssignments(record: RawRecord): MissionAssignmentView[] {
  const rawList = record.block.assignments;
  if (!Array.isArray(rawList)) return [];
  return rawList.filter(isAssignment).map((entry) => ({
    personId: entry.personId,
    role: entry.role,
    sourceRefs: [refOf(record)],
  }));
}

/**
 * Mission-explicit bound presences (S4/C2/R1): today's registry CANNOT express
 * a mission binding — projectId/threadId name a project or a Thread, never a
 * Mission, and no typed binding field exists on canonical AgentInfo. So this
 * is unconditionally empty; the attention item states that honest fact. The
 * future sanctioned binding is recorded as follow-up work (result.md risks).
 */
function buildPresences(): PresenceView[] {
  return [];
}

/** Explicit current work (S3/C2): availability is never converted into work — empty until an explicit current-work source exists. */
function buildActivity(): CurrentActivityView[] {
  return [];
}

/** Chronological — never causal — timeline: mission + linked records + linked rooms (M4/C1). */
function buildTimeline(facts: MissionFacts, rooms: RoomRecord[]): TimelineEntry[] {
  const linked = [missionEntry(facts.linkage.mission), ...facts.linkage.linked.map(linkedEntry)];
  return [...linked, ...rooms.map((room) => roomEntry(room, facts.missionId))]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

/** A room carrying an explicit typed mission ref joins the timeline as the linked lane (C1). */
function roomEntry(room: RoomRecord, missionId: string): TimelineEntry {
  return {
    id: room.roomId,
    kind: 'room',
    summary: `Room '${stringOrNull(room.block.name) ?? room.roomId}'`,
    timestamp: stringOrNull(room.block.createdAt) ?? '',
    refPath: [missionId, room.roomId],
    sourceRefs: [{ store: 'rooms', recordId: room.roomId, path: room.path, line: room.line }],
  };
}

function missionEntry(record: RawRecord): TimelineEntry {
  return {
    id: String(record.block.id),
    kind: 'mission',
    summary: stringOrNull(record.block.title) ?? String(record.block.id),
    timestamp: stringOrNull(record.block.updated) ?? stringOrNull(record.block.ts) ?? '',
    refPath: [String(record.block.id)],
    sourceRefs: [refOf(record)],
  };
}

function linkedEntry(item: MissionLinkage['linked'][number]): TimelineEntry {
  const record = item.record;
  return {
    id: String(record.block.id ?? `${record.store}:${record.line}`),
    kind: timelineKind(record.store),
    summary: summarize(record),
    timestamp: stringOrNull(record.block.ts) ?? stringOrNull(record.block.updated) ?? '',
    refPath: item.refPath,
    sourceRefs: [refOf(record)],
  };
}

/** Explicitly ref'd docs only (S4): Mission Contract + PR; packet neighbors are attention. */
function buildArtifacts(facts: MissionFacts): ArtifactView[] {
  return facts.linkage.forwardRefs
    .filter((entry) => entry.kind === 'doc')
    .map((entry) => artifactView(entry, facts));
}

function artifactView(entry: RefValue, facts: MissionFacts): ArtifactView {
  const observed = facts.packet.find((file) => file.name === basenameOf(entry.value));
  const packetRef: SourceRef[] = observed ? [{ store: 'packet', path: observed.path }] : [];
  return {
    id: `doc:${entry.value}`,
    kind: 'doc',
    label: entry.label ?? entry.value,
    location: entry.value,
    producedAt: null,
    observedModifiedAt: observed?.observedModifiedAt ?? null,
    sourceRefs: [refOf(facts.linkage.mission), ...packetRef],
  };
}

/** The trust feature: every gap, labeled, with the refs that prove it. */
function buildAttention(facts: MissionFacts, rooms: RoomRecord[]): AttentionItem[] {
  return [
    ...assignmentAttention(facts),
    ...presenceAttention(facts),
    ...activityAttention(facts),
    ...unresolvableAttention(facts),
    ...evidenceAttention(facts),
    ...communicationAttention(facts, rooms),
  ];
}

function assignmentAttention(facts: MissionFacts): AttentionItem[] {
  if (buildAssignments(facts.linkage.mission).length > 0) return [];
  return [{
    id: 'attention:no-assignments',
    label: 'no explicit role assignments stored',
    detail: 'No record stores a role assignment for this mission; the scalar mission owner renders as a raw sourced field, never a role (S4).',
    sourceRefs: [refOf(facts.linkage.mission)],
  }];
}

function presenceAttention(facts: MissionFacts): AttentionItem[] {
  const items: AttentionItem[] = [{
    id: 'attention:no-presences',
    label: 'no mission-explicit bound presence',
    detail: 'The agent registry has no mission binding; projectId/threadId bind to a project or thread, not a mission — no explicitly linked active session exists.',
    sourceRefs: [{ store: 'registry', path: facts.registryPath }],
  }];
  return items.concat(projectOnlyAttention(facts));
}

/** Project-only registry entries are candidates, never presences (S4/C2). */
function projectOnlyAttention(facts: MissionFacts): AttentionItem[] {
  const projects = new Set(facts.linkage.forwardRefs.filter((entry) => entry.kind === 'project').map((entry) => entry.value));
  return facts.registry
    .filter((entry) => entry.projectId !== undefined && projects.has(entry.projectId))
    .map((entry) => ({
      id: `attention:presence-candidate:${entry.agentId}`,
      label: 'unlinked presence candidates',
      detail: `Registry entry '${entry.title}' (${entry.agentId}) binds to project ${entry.projectId}, not to this mission — not a mission presence.`,
      sourceRefs: [{ store: 'registry', recordId: entry.agentId, path: facts.registryPath }],
    }));
}

function activityAttention(facts: MissionFacts): AttentionItem[] {
  return [{
    id: 'attention:no-current-activity',
    label: 'no explicitly linked current activity',
    detail: 'No source records current work for this mission, and registry availability is never converted into work (S3) — so nothing can be honestly attributed.',
    sourceRefs: [{ store: 'registry', path: facts.registryPath }],
  }];
}

/** exp/session refs: no store exists — attention, never dangling (S5). */
function unresolvableAttention(facts: MissionFacts): AttentionItem[] {
  return facts.linkage.unresolvableRefs.map((entry) => ({
    id: `attention:unresolvable-ref:${entry.value}`,
    label: `unresolvable ${entry.kind} ref`,
    detail: `The mission refs ${entry.kind} '${entry.value}' but no ${entry.kind} store exists — an explicit unresolvable ref, not a dangling store id.`,
    sourceRefs: [refOf(facts.linkage.mission)],
  }));
}

/** Packet-neighbor files the mission never ref'd: candidates, not artifacts (S4). */
function evidenceAttention(facts: MissionFacts): AttentionItem[] {
  const linkedNames = new Set(facts.linkage.forwardRefs.filter((entry) => entry.kind === 'doc').map((entry) => basenameOf(entry.value)));
  return facts.packet
    .filter((file) => !linkedNames.has(file.name))
    .map((file) => ({
      id: `attention:evidence-candidate:${file.name}`,
      label: 'unlinked evidence candidates',
      detail: `Packet file '${file.name}' is not explicitly ref'd by the mission record (observedModifiedAt ${file.observedModifiedAt}, producedAt null — observation time, L2).`,
      sourceRefs: [{ store: 'packet', path: file.path }],
    }));
}

/**
 * M3/C1: the primary gap is the missing ref. Both stores are actually read and
 * the item states only what was verified; body-text mentions stay diagnostic
 * detail only. A room WITH an explicit typed mission ref joins the timeline
 * instead — communication is linked, not a gap.
 */
function communicationAttention(facts: MissionFacts, rooms: RoomRecord[]): AttentionItem[] {
  if (rooms.length > 0) return [];
  // A typed thread block IS the explicit mission↔room link (plan v2 §1.5) —
  // when one exists, communication is linked, not a gap.
  if (facts.stores.threads.some((record) => {
    const rawRefs = record.block.refs;
    return Array.isArray(rawRefs) && rawRefs.some((entry) => isMissionRef(entry, facts.missionId));
  })) return [];
  const mentions = facts.journal.filter((envelope) => (
    typeof envelope.body === 'string' && envelope.body.includes(facts.missionId)
  )).length;
  const bound = facts.journal.filter((envelope) => envelope.threadId === facts.missionId).length;
  return [{
    id: 'attention:no-thread-ref',
    label: bound === 0 ? 'no explicit thread/room ref exists for this mission' : 'journal thread refs are unlinked candidates',
    detail: `${facts.rooms.length} room record(s) read from ${facts.roomsPath}, none carrying an explicit ref to this mission; `
      + `${mentions} journal envelope(s) mention the mission in body text (unlinked candidates, folded by id — text matching is not linkage); `
      + `${bound} carry a threadId equal to the mission id. Journal queried at ${facts.journalPath}.`,
    sourceRefs: [{ store: 'rooms', path: facts.roomsPath }, { store: 'journal', path: facts.journalPath }],
  }];
}

/** Rooms linked to the mission: an explicit typed mission ref on the room
 * record (legacy C1 shape) OR a thread block naming the room (ruling S2's
 * typed link, completed per correction M2). */
function linkedRooms(facts: MissionFacts): RoomRecord[] {
  const threadRoomIds = new Set(
    facts.stores.threads
      .filter((record) => {
        const rawRefs = record.block.refs;
        return Array.isArray(rawRefs) && rawRefs.some((entry) => isMissionRef(entry, facts.missionId));
      })
      .map((record) => (typeof record.block.roomId === 'string' ? record.block.roomId : ''))
      .filter(Boolean),
  );
  return facts.rooms.filter((room) => {
    if (threadRoomIds.has(room.roomId)) return true;
    const rawRefs = room.block.refs;
    return Array.isArray(rawRefs) && rawRefs.some((entry) => isMissionRef(entry, facts.missionId));
  });
}

function isMissionRef(value: unknown, missionId: string): boolean {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as { kind?: unknown; value?: unknown };
  return entry.kind === 'mission' && entry.value === missionId;
}

function timelineKind(store: RawRecord['store']): TimelineEntry['kind'] {
  if (store === 'tasks') return 'task';
  if (store === 'issues') return 'issue';
  return 'log';
}

function summarize(record: RawRecord): string {
  const title = stringOrNull(record.block.title);
  if (title) return title;
  const body = stringOrNull(record.block.body);
  if (!body) return String(record.block.id ?? `${record.store}:${record.line}`);
  return body.length > 140 ? `${body.slice(0, 140)}…` : body;
}

function refOf(record: RawRecord): SourceRef {
  return { store: record.store, recordId: String(record.block.id ?? ''), path: record.path, line: record.line };
}

function basenameOf(location: string): string {
  return location.split('/').pop() ?? location;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function isAssignment(value: unknown): value is { personId: string; role: string } {
  const entry = value as { personId?: unknown; role?: unknown } | null;
  return typeof entry?.personId === 'string' && typeof entry?.role === 'string';
}
