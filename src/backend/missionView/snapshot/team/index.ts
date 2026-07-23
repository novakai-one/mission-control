// The team join (mission_mission-control-ux, ruling S2): four SEPARATE pure
// derivations over the typed refs the stores already carry — membership,
// task assignment, Presence, doing-activity — each with its own provenance
// and its own attention condition (owned by the snapshot). Indexes are built
// once per derive (agents by id, registry by agentId): no nested scans ride
// the 5-second poll (L2). Malformed/duplicate agent records surface as
// visible problems, never silently (S2.5).
import type {
  CurrentActivityView,
  MissionAssignmentView,
  MissionMemberView,
  PresenceView,
  ReadIssue,
  SourceRef,
} from '../../../../shared/missionView/schema.js';
import type { RawRecord } from '../../sources/index.js';
import type { MissionFacts } from '../index.js';

export interface TeamJoin {
  members: MissionMemberView[];
  assignments: MissionAssignmentView[];
  presences: PresenceView[];
  currentActivity: CurrentActivityView[];
  problems: ReadIssue[];
}

/** Shared record helpers (single home — the snapshot imports them from here). */
export function refOf(record: RawRecord): SourceRef {
  return { store: record.store, recordId: String(record.block.id ?? ''), path: record.path, line: record.line };
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

const TASK_STATUSES = new Set(['todo', 'doing', 'done', 'blocked']);
const LIVE_AGENT_STATUSES = new Set(['live', 'spawning']);

function hasRef(rawRefs: unknown, kind: string, value: string): boolean {
  return Array.isArray(rawRefs) && rawRefs.some((entry) => {
    const typedRef = entry as { kind?: unknown; value?: unknown } | null;
    return typedRef?.kind === kind && typedRef.value === value;
  });
}

function refValueOf(rawRefs: unknown, kind: string): string | null {
  if (!Array.isArray(rawRefs)) return null;
  const typedRef = rawRefs.find((entry) => (entry as { kind?: unknown } | null)?.kind === kind) as { value?: unknown } | undefined;
  return typeof typedRef?.value === 'string' ? typedRef.value : null;
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

function joinMembers(facts: MissionFacts, agentsById: Map<string, RawRecord>): RawRecord[] {
  const liveFirst = (agentRecord: RawRecord): number => (LIVE_AGENT_STATUSES.has(String(agentRecord.block.status)) ? 0 : 1);
  return [...agentsById.values()]
    .filter((agentRecord) => hasRef(agentRecord.block.refs, 'mission', facts.missionId))
    .sort((left, right) => liveFirst(left) - liveFirst(right)
      || String(left.block.name).localeCompare(String(right.block.name)));
}

function joinAssignments(facts: MissionFacts, agentsById: Map<string, RawRecord>): MissionAssignmentView[] {
  const assignments = facts.stores.tasks
    .filter((taskRecord) => hasRef(taskRecord.block.refs, 'mission', facts.missionId)
      && refValueOf(taskRecord.block.refs, 'agent') !== null)
    .map((taskRecord) => assignmentView(taskRecord, agentsById));
  return assignments.sort((left, right) => (ASSIGNMENT_ORDER[left.taskStatus] ?? 3) - (ASSIGNMENT_ORDER[right.taskStatus] ?? 3)
    || left.taskTitle.localeCompare(right.taskTitle));
}

export function joinTeam(facts: MissionFacts): TeamJoin {
  const problems: ReadIssue[] = [];
  const agentsById = agentIndex(facts, problems);
  const registryById = new Map(facts.registry.map((entry) => [entry.agentId, entry]));
  const memberRecords = joinMembers(facts, agentsById);
  const presences = memberRecords
    .filter((agentRecord) => LIVE_AGENT_STATUSES.has(String(agentRecord.block.status))
      && (stringOrNull(agentRecord.block.sessionId) !== null || registryById.has(String(agentRecord.block.id))))
    .map((agentRecord) => presenceView(agentRecord, facts, registryById));
  const assignments = joinAssignments(facts, agentsById);
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
  return { members: memberRecords.map(memberView), assignments, presences, currentActivity, problems };
}
