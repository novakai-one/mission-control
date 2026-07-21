// Mission Room V1 — pure snapshot derivation (plan Delta v2 S3/S4, M3/M4/M6, L2).
// MissionFacts in → MissionSnapshot out; no I/O. Every displayed fact carries
// provenance; every ambiguous fact is a labeled attention item with the
// sourceRefs that prove the gap — never invented linkage (Chief Ruling #1).
import type {
  AttentionItem,
  ArtifactView,
  CurrentActivityView,
  MissionAssignmentView,
  MissionPulse,
  MissionSnapshot,
  PresenceView,
  SourceRef,
  Sourced,
  TimelineEntry,
} from '../../../shared/missionView/schema.js';
import type { MessageEnvelope } from '../../messaging/types.js';
import type { MissionLinkage, RefValue } from '../linkage/index.js';
import type { PacketFile, RawRecord, RegistryEntry } from '../sources/index.js';

/** Everything deriveSnapshot needs: linkage output plus the other source reads. */
export interface MissionFacts {
  missionId: string;
  linkage: MissionLinkage;
  journal: MessageEnvelope[];
  journalPath: string;
  registry: RegistryEntry[];
  registryPath: string;
  registryObservedAt: string | null;
  packet: PacketFile[];
  readProblems: string[];
  asOf: string;
}

const CLOSED_STATUSES = new Set(['done', 'closed', 'refiled']);

/** The deep derive: one mission, joined read-only, uncertainty preserved. */
export function deriveSnapshot(facts: MissionFacts): MissionSnapshot {
  const attention = buildAttention(facts);
  const issues = [...facts.linkage.problems, ...facts.readProblems];
  return {
    mission: buildMission(facts.linkage.mission),
    pulse: buildPulse(facts, attention, issues),
    objective: buildObjective(facts.linkage),
    assignments: buildAssignments(facts.linkage.mission),
    presences: buildPresences(facts),
    currentActivity: buildActivity(facts),
    timeline: buildTimeline(facts.linkage),
    artifacts: buildArtifacts(facts),
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
function buildPulse(facts: MissionFacts, attention: AttentionItem[], issues: string[]): MissionPulse {
  const block = facts.linkage.mission.block;
  const source = [refOf(facts.linkage.mission)];
  const closed = CLOSED_STATUSES.has(stringOrNull(block.status) ?? '');
  return {
    outcome: { value: stringOrNull(block.outcome) ?? stringOrNull(block.title), sourceRefs: source },
    phase: { value: stringOrNull(block.stage) ?? stringOrNull(block.status), sourceRefs: source },
    health: { value: healthOf(facts, attention, issues), sourceRefs: source },
    lastUpdate: { value: stringOrNull(block.updated), sourceRefs: source },
    nextCheckpoint: { value: closed ? null : stringOrNull(block.stage) ?? stringOrNull(block.status), sourceRefs: source },
    needsChris: needsChrisOf(facts),
  };
}

/** M6: attention/issues → 'attention'; invalid mission record → 'unknown'; else 'on-track'. */
function healthOf(facts: MissionFacts, attention: AttentionItem[], issues: string[]): 'on-track' | 'attention' | 'unknown' {
  if (!facts.linkage.missionValid) return 'unknown';
  return attention.length > 0 || issues.length > 0 ? 'attention' : 'on-track';
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

/** Mission-explicit bound presences only (S4): a registry threadId equal to the mission id. */
function buildPresences(facts: MissionFacts): PresenceView[] {
  return facts.registry
    .filter((entry) => entry.threadId === facts.missionId)
    .map((entry) => presenceView(entry, facts));
}

function presenceView(entry: RegistryEntry, facts: MissionFacts): PresenceView {
  return {
    agentId: entry.agentId,
    title: entry.title,
    provider: entry.provider,
    sessionId: entry.sessionId ?? null,
    sessionError: entry.sessionError ?? null,
    status: entry.status,
    observedAt: facts.registryObservedAt ?? '',
    sourceRefs: [{ store: 'registry', recordId: entry.agentId, path: facts.registryPath }],
  };
}

/** Explicit current work: running mission-explicit presences, nothing else (S3). */
function buildActivity(facts: MissionFacts): CurrentActivityView[] {
  return buildPresences(facts)
    .filter((presence) => presence.status === 'running')
    .map((presence) => ({
      personId: presence.agentId,
      summary: `${presence.title} running (session ${presence.sessionId ?? 'unknown'}; availability is not current work)`,
      active: true,
      sourceRefs: presence.sourceRefs,
    }));
}

/** Chronological — never causal — timeline: mission + every linked record (M4). */
function buildTimeline(linkage: MissionLinkage): TimelineEntry[] {
  const entries = [missionEntry(linkage.mission), ...linkage.linked.map(linkedEntry)];
  return entries.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
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
function buildAttention(facts: MissionFacts): AttentionItem[] {
  return [
    ...assignmentAttention(facts),
    ...presenceAttention(facts),
    ...activityAttention(facts),
    ...unresolvableAttention(facts),
    ...evidenceAttention(facts),
    communicationAttention(facts),
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
  const items: AttentionItem[] = [];
  if (buildPresences(facts).length === 0) {
    items.push({
      id: 'attention:no-presences',
      label: 'no mission-explicit bound presence',
      detail: 'The agent registry has no mission binding; projectId/threadId bind to a project or thread, not a mission — no explicitly linked active session exists.',
      sourceRefs: [{ store: 'registry', path: facts.registryPath }],
    });
  }
  return items.concat(projectOnlyAttention(facts));
}

/** Project-only registry entries are candidates, never presences (S4). */
function projectOnlyAttention(facts: MissionFacts): AttentionItem[] {
  const projects = new Set(facts.linkage.forwardRefs.filter((entry) => entry.kind === 'project').map((entry) => entry.value));
  return facts.registry
    .filter((entry) => entry.projectId !== undefined && projects.has(entry.projectId) && entry.threadId !== facts.missionId)
    .map((entry) => ({
      id: `attention:presence-candidate:${entry.agentId}`,
      label: 'unlinked presence candidates',
      detail: `Registry entry '${entry.title}' (${entry.agentId}) binds to project ${entry.projectId}, not to this mission — not a mission presence.`,
      sourceRefs: [{ store: 'registry', recordId: entry.agentId, path: facts.registryPath }],
    }));
}

function activityAttention(facts: MissionFacts): AttentionItem[] {
  if (buildActivity(facts).length > 0) return [];
  return [{
    id: 'attention:no-current-activity',
    label: 'no explicitly linked current activity',
    detail: 'No mission-explicit bound presence exists, so no current activity can be honestly attributed (S3).',
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
 * M3: the primary gap is the missing ref — the body-mention count is diagnostic
 * detail only, folded by id via history(), labeled unlinked candidates, and
 * never promoted into the timeline.
 */
function communicationAttention(facts: MissionFacts): AttentionItem {
  const mentions = facts.journal.filter((envelope) => envelope.body.includes(facts.missionId)).length;
  const bound = facts.journal.filter((envelope) => envelope.threadId === facts.missionId).length;
  return {
    id: 'attention:no-thread-ref',
    label: bound === 0 ? 'no explicit thread/room ref exists for this mission' : 'journal thread refs are unlinked candidates',
    detail: `${mentions} journal envelope(s) mention the mission in body text (unlinked candidates, folded by id — text matching is not linkage); ${bound} carry a threadId equal to the mission id; no room records exist. Journal queried at ${facts.journalPath}.`,
    sourceRefs: [{ store: 'journal', path: facts.journalPath }],
  };
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
