// Mission tree derivation (mission_mission-object-model, plan v2 §1.6) —
// pure: stores in, MissionTreeView out. Every edge follows the authority
// table (refs on the owning block; membership derives from Agent → team
// refs); nothing is inferred from names or text. Absences stay absent —
// null team / empty arrays are the UI's explicit gap states.
import type {
  AgentNode, AncestryNode, ArtifactNode, MissionTreeView, SourceRef, TaskNode, ThreadNode,
} from '../../../shared/missionView/schema.js';
import type { RawRecord, StoreName } from '../sources/index.js';

type Stores = Record<StoreName, RawRecord[]>;

interface StoredRef { kind: string; value: string }

function refsOf(record: RawRecord): StoredRef[] {
  const rawRefs = record.block.refs;
  if (!Array.isArray(rawRefs)) return [];
  return rawRefs.filter((entry): entry is StoredRef => entry !== null && typeof entry === 'object'
    && typeof (entry as StoredRef).kind === 'string' && typeof (entry as StoredRef).value === 'string');
}

function refValue(record: RawRecord, kind: string): string | null {
  return refsOf(record).find((entry) => entry.kind === kind)?.value ?? null;
}

function refersToMission(record: RawRecord, missionId: string): boolean {
  return refsOf(record).some((entry) => entry.kind === 'mission' && entry.value === missionId);
}

function sourceOf(record: RawRecord): SourceRef[] {
  return [{ store: record.store, recordId: stringOrNull(record.block.id) ?? '', path: record.path, line: record.line }];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function buildTree(missionId: string, mission: RawRecord, stores: Stores): MissionTreeView {
  const tasks = stores.tasks.filter((record) => refersToMission(record, missionId));
  const agents = stores.agents.filter((record) => refersToMission(record, missionId));
  const artifacts = collectArtifacts(missionId, tasks, stores);
  const taskArtifacts = (taskId: string): ArtifactNode[] => artifacts.filter((artifact) => artifact.taskId === taskId);
  return {
    ancestry: buildAncestry(mission, stores),
    team: buildTeam(missionId, stores),
    agents: agents.map((record) => buildAgent(record, tasks, taskArtifacts)).sort((left, right) => left.name.localeCompare(right.name)),
    unassignedTasks: tasks.filter((record) => refValue(record, 'agent') === null).map((record) => buildTask(record, taskArtifacts)),
    // C3: mission-level artifacts only — task-anchored ones live under their task.
    artifacts: artifacts.filter((artifact) => artifact.taskId === null),
    threads: stores.threads.filter((record) => refersToMission(record, missionId)).map(buildThread),
  };
}

/** Header path: mission → project → objective → KRs. A mission-level objective
 * ref stands in when no project link exists (legacy compat, authority table). */
function buildAncestry(mission: RawRecord, stores: Stores): AncestryNode[] {
  const ancestry: AncestryNode[] = [];
  const projectId = refValue(mission, 'project');
  const project = projectId ? byId(stores.projects, projectId) : null;
  if (project) {
    ancestry.push(node(project, 'project', stringOrNull(project.block.title)));
  }
  const objectiveId = (project && refValue(project, 'objective')) ?? refValue(mission, 'objective');
  const objective = objectiveId ? byId(stores.okrs, objectiveId) : null;
  if (objective) {
    ancestry.push(node(objective, 'objective', stringOrNull(objective.block.title)));
    for (const keyResult of stores.okrs.filter((record) => record.block.kind === 'kr' && record.block.objective === objective.block.id)) {
      ancestry.push(node(keyResult, 'kr', stringOrNull(keyResult.block.body)));
    }
  }
  return ancestry;
}

/** Exactly-one team per mission by law; duplicates would already be audit findings. */
function buildTeam(missionId: string, stores: Stores): MissionTreeView['team'] {
  const team = stores.teams.find((record) => refersToMission(record, missionId));
  if (!team) return null;
  return {
    id: stringOrNull(team.block.id) ?? '',
    name: stringOrNull(team.block.name) ?? '(unnamed team)',
    sourceRefs: sourceOf(team),
  };
}

function buildAgent(record: RawRecord, missionTasks: RawRecord[], taskArtifacts: (taskId: string) => ArtifactNode[]): AgentNode {
  const agentId = stringOrNull(record.block.id) ?? '';
  const tasks = missionTasks
    .filter((task) => refValue(task, 'agent') === agentId)
    .map((task) => buildTask(task, taskArtifacts))
    .sort((left, right) => (left.updated ?? '').localeCompare(right.updated ?? ''));
  return {
    id: agentId,
    name: stringOrNull(record.block.name) ?? agentId,
    provider: stringOrNull(record.block.provider) ?? 'unknown',
    status: stringOrNull(record.block.status) ?? 'unknown',
    sessionId: stringOrNull(record.block.sessionId),
    tasks,
    doneCount: tasks.filter((task) => task.status === 'done').length,
    totalCount: tasks.length,
    sourceRefs: sourceOf(record),
  };
}

function buildTask(record: RawRecord, taskArtifacts: (taskId: string) => ArtifactNode[]): TaskNode {
  const taskId = stringOrNull(record.block.id) ?? '';
  return {
    id: taskId,
    title: stringOrNull(record.block.title) ?? '(untitled)',
    status: stringOrNull(record.block.status) ?? 'todo',
    blockedReason: stringOrNull(record.block.blockedReason),
    updated: stringOrNull(record.block.updated),
    artifacts: taskArtifacts(taskId),
    sourceRefs: sourceOf(record),
  };
}

/** Artifacts anchor to the mission directly or to one of its tasks. */
function collectArtifacts(missionId: string, missionTasks: RawRecord[], stores: Stores): ArtifactNode[] {
  const taskIds = new Set(missionTasks.map((record) => stringOrNull(record.block.id)).filter(Boolean));
  return stores.artifacts
    .map((record) => ({ record, taskId: refsOf(record).find((entry) => entry.kind === 'task' && taskIds.has(entry.value))?.value ?? null }))
    .filter(({ record, taskId }) => taskId !== null || refersToMission(record, missionId))
    .map(({ record, taskId }) => ({
      id: stringOrNull(record.block.id) ?? '',
      title: stringOrNull(record.block.title) ?? '(untitled)',
      location: stringOrNull(record.block.path) ?? stringOrNull(record.block.url) ?? '',
      taskId,
      sourceRefs: sourceOf(record),
    }));
}

function buildThread(record: RawRecord): ThreadNode {
  return {
    id: stringOrNull(record.block.id) ?? '',
    roomId: stringOrNull(record.block.roomId) ?? '',
    sourceRefs: sourceOf(record),
  };
}

function byId(records: RawRecord[], id: string): RawRecord | null {
  return records.find((record) => record.block.id === id) ?? null;
}

function node(record: RawRecord, kind: AncestryNode['kind'], label: string | null): AncestryNode {
  return {
    id: stringOrNull(record.block.id) ?? '',
    kind,
    label: label ?? stringOrNull(record.block.id) ?? '',
    sourceRefs: sourceOf(record),
  };
}
