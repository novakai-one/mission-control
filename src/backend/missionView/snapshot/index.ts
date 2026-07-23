// Mission Room V1 — pure snapshot derivation (plan Delta v2 S3/S4, M3/M4/M6, L2).
// MissionFacts in → MissionSnapshot out; no I/O. Every displayed fact carries
// provenance; every ambiguous fact is a labeled attention item (Chief Ruling #1).
import type {
  AttentionItem,
  ArtifactView,
  CurrentActivityView,
  DeclaredRoleView,
  MissionAssignmentView,
  MissionMemberView,
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
  const team = joinTeam(facts);
  const attention = buildAttention(facts, rooms, team);
  const issues = [...facts.linkage.problems, ...facts.readProblems, ...team.problems];
  return {
    mission: buildMission(facts.linkage.mission),
    pulse: buildPulse(facts, attention, issues),
    objective: buildObjective(facts.linkage),
    members: team.members,
    assignments: team.assignments,
    declaredRoles: buildDeclaredRoles(facts.linkage.mission),
    presences: team.presences,
    currentActivity: team.currentActivity,
    timeline: buildTimeline(facts, rooms),
    artifacts: buildArtifacts(facts),
    tree: buildTree(facts.missionId, facts.linkage.mission, facts.stores),
    attention,
    asOf: facts.asOf,
    issues,
  };
}

/* ---------- The team join (mission_mission-control-ux, ruling S2) -----------
   Four SEPARATE pure derivations over the typed refs the stores already
   carry — membership, task assignment, Presence, doing-activity — each with
   its own provenance and its own attention condition. Indexes are built once
   per derive (agents by id, registry by agentId): no nested scans ride the
   5-second poll (L2). Malformed/duplicate agent records surface as visible
   problems, never silently (S2.5). */

interface TeamJoin {
  members: MissionMemberView[];
  assignments: MissionAssignmentView[];
  presences: PresenceView[];
  currentActivity: CurrentActivityView[];
  problems: ReadIssue[];
}

const TASK_STATUSES = new Set(['todo', 'doing', 'done', 'blocked']);
const LIVE_AGENT_STATUSES = new Set(['live', 'spawning']);

function hasRef(rawRefs: unknown, kind: string, value: string): boolean {
  return Array.isArray(rawRefs) && rawRefs.some((entry) => {
    const ref = entry as { kind?: unknown; value?: unknown } | null;
    return ref?.kind === kind && ref.value === value;
  });
}

function refValueOf(rawRefs: unknown, kind: string): string | null {
  if (!Array.isArray(rawRefs)) return null;
  const ref = rawRefs.find((entry) => (entry as { kind?: unknown } | null)?.kind === kind) as { value?: unknown } | undefined;
  return typeof ref?.value === 'string' ? ref.value : null;
}

/** Agents folded by id, last record wins; malformed/duplicate → visible problem. */
function agentIndex(facts: MissionFacts, problems: ReadIssue[]): Map<string, RawRecord> {
  const byId = new Map<string, RawRecord>();
  for (const agentRecord of facts.stores.agents) {
    const agentId = stringOrNull(agentRecord.block.id);
    if (!agentId || !stringOrNull(agentRecord.block.name) || !stringOrNull(agentRecord.block.status)) {
      problems.push({ message: `malformed agent record skipped: agents.jsonl:${agentRecord.line}`, sourceRefs: [refOf(agentRecord)] });
      continue;
    }
    if (byId.has(agentId)) {
      problems.push({ message: `duplicate id '${agentId}' in agents.jsonl — folded last-wins for the team join`, sourceRefs: [refOf(agentRecord)] });
    }
    byId.set(agentId, agentRecord);
  }
  return byId;
}

function memberView(agentRecord: RawRecord): MissionMemberView {
  return {
    agentId: String(agentRecord.block.id),
    name: String(agentRecord.block.name),
    provider: stringOrNull(agentRecord.block.provider) ?? 'unknown',
    durableStatus: String(agentRecord.block.status),
    sourceRefs: [refOf(agentRecord)],
  };
}

/** Presence (S2.4): a live/spawning member with a session pointer. A member
 * the PTY registry knows carries the registry's word; ABSENCE of a registry
 * entry is an honest EXTERNAL session, never an exclusion or a PTY claim. */
function presenceView(agentRecord: RawRecord, facts: MissionFacts, registryById: Map<string, MissionFacts['registry'][number]>): PresenceView {
  const agentId = String(agentRecord.block.id);
  const runtime = registryById.get(agentId);
  const registryRef: SourceRef[] = runtime ? [{ store: 'registry', recordId: agentId, path: facts.registryPath }] : [];
  return {
    agentId,
    title: String(agentRecord.block.name),
    provider: stringOrNull(agentRecord.block.provider) ?? 'unknown',
    sessionId: stringOrNull(agentRecord.block.sessionId) ?? runtime?.sessionId ?? null,
    sessionError: runtime?.sessionError ?? null,
    status: runtime ? runtime.status : 'external',
    observedAt: runtime ? facts.registryObservedAt ?? facts.asOf : facts.asOf,
    sourceRefs: [refOf(agentRecord), ...registryRef],
  };
}

function assignmentView(taskRecord: RawRecord, agentsById: Map<string, RawRecord>): MissionAssignmentView {
  const personId = refValueOf(taskRecord.block.refs, 'agent') ?? '';
  const agentRecord = agentsById.get(personId);
  const rawStatus = stringOrNull(taskRecord.block.status) ?? 'unknown';
  const agentRef: SourceRef[] = agentRecord ? [refOf(agentRecord)] : [];
  return {
    personId,
    personName: agentRecord ? String(agentRecord.block.name) : personId,
    taskId: String(taskRecord.block.id ?? `tasks:${taskRecord.line}`),
    taskTitle: stringOrNull(taskRecord.block.title) ?? String(taskRecord.block.id ?? ''),
    taskStatus: (TASK_STATUSES.has(rawStatus) ? rawStatus : 'unknown') as MissionAssignmentView['taskStatus'],
    blockedReason: stringOrNull(taskRecord.block.blockedReason),
    sourceRefs: [refOf(taskRecord), ...agentRef],
  };
}

const ASSIGNMENT_ORDER: Record<string, number> = { doing: 0, blocked: 1, todo: 2, unknown: 3, done: 4 };

function joinTeam(facts: MissionFacts): TeamJoin {
  const problems: ReadIssue[] = [];
  const agentsById = agentIndex(facts, problems);
  const registryById = new Map(facts.registry.map((entry) => [entry.agentId, entry]));
  const memberRecords = [...agentsById.values()]
    .filter((agentRecord) => hasRef(agentRecord.block.refs, 'mission', facts.missionId));
  const liveFirst = (agentRecord: RawRecord): number => (LIVE_AGENT_STATUSES.has(String(agentRecord.block.status)) ? 0 : 1);
  memberRecords.sort((left, right) => liveFirst(left) - liveFirst(right)
    || String(left.block.name).localeCompare(String(right.block.name)));
  const members = memberRecords.map(memberView);
  const presences = memberRecords
    .filter((agentRecord) => LIVE_AGENT_STATUSES.has(String(agentRecord.block.status))
      && (stringOrNull(agentRecord.block.sessionId) !== null || registryById.has(String(agentRecord.block.id))))
    .map((agentRecord) => presenceView(agentRecord, facts, registryById));
  const assignments = facts.stores.tasks
    .filter((taskRecord) => hasRef(taskRecord.block.refs, 'mission', facts.missionId)
      && refValueOf(taskRecord.block.refs, 'agent') !== null)
    .map((taskRecord) => assignmentView(taskRecord, agentsById));
  assignments.sort((left, right) => (ASSIGNMENT_ORDER[left.taskStatus] ?? 3) - (ASSIGNMENT_ORDER[right.taskStatus] ?? 3)
    || left.taskTitle.localeCompare(right.taskTitle));
  // S2.3: only a `doing` task is current work — todo/blocked stay visible
  // above under their honest task states, never promoted.
  const currentActivity: CurrentActivityView[] = assignments
    .filter((assignment) => assignment.taskStatus === 'doing')
    .map((assignment) => ({
      personId: assignment.personId,
      summary: assignment.taskTitle,
      active: true,
      sourceRefs: assignment.sourceRefs,
    }));
  return { members, assignments, presences, currentActivity, problems };
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
    notes: text('notes'),
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

/** Legacy mission-explicit declared roles (S4); the scalar owner is never
 * promoted. The typed team join above supersedes this as the real team
 * source — this field only preserves the old lawful shape, unchanged. */
function buildDeclaredRoles(record: RawRecord): DeclaredRoleView[] {
  const rawList = record.block.assignments;
  if (!Array.isArray(rawList)) return [];
  return rawList.filter(isAssignment).map((entry) => ({
    personId: entry.personId,
    role: entry.role,
    sourceRefs: [refOf(record)],
  }));
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

/** The trust feature: every gap, labeled, with the refs that prove it.
 * Each Team fact clears its item ONLY when that fact is proven (S2.5). */
function buildAttention(facts: MissionFacts, rooms: RoomRecord[], team: TeamJoin): AttentionItem[] {
  return [
    ...assignmentAttention(facts, team),
    ...presenceAttention(facts, team),
    ...activityAttention(facts, team),
    ...unresolvableAttention(facts),
    ...evidenceAttention(facts),
    ...communicationAttention(facts, rooms),
  ];
}

function assignmentAttention(facts: MissionFacts, team: TeamJoin): AttentionItem[] {
  if (team.assignments.length > 0 || buildDeclaredRoles(facts.linkage.mission).length > 0) return [];
  return [{
    id: 'attention:no-assignments',
    label: 'no task assignments recorded',
    detail: 'No task block refs both this mission and an agent, and the mission record declares no roles; the scalar mission owner renders as a raw sourced field, never a role (S4).',
    sourceRefs: [refOf(facts.linkage.mission)],
  }];
}

function presenceAttention(facts: MissionFacts, team: TeamJoin): AttentionItem[] {
  if (team.presences.length > 0) return projectOnlyAttention(facts);
  const items: AttentionItem[] = [{
    id: 'attention:no-presences',
    label: 'no mission-linked presence',
    detail: 'No live durable agent with a session pointer refs this mission, and the runtime registry has no mission binding — no explicitly linked active session exists.',
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

function activityAttention(facts: MissionFacts, team: TeamJoin): AttentionItem[] {
  if (team.currentActivity.length > 0) return [];
  return [{
    id: 'attention:no-current-activity',
    label: 'no explicitly linked current activity',
    detail: 'No `doing` task refs both this mission and an agent, and registry availability is never converted into work (S3) — so nothing can be honestly attributed.',
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
