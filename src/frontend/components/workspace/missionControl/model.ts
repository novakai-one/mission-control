import type { AgentInfo } from '../../../lib/agentSocket/index.js';
import type { AttentionView } from '../../../lib/attention/index.js';
import type { SessionUsage } from '../../../lib/cost/index.js';
import { sessionTokens } from '../../../lib/cost/index.js';
import type {
  CanonicalEvent,
  TaskItem,
  ThreadProjection,
} from '../../../../shared/provider/schema.js';
import type { ProviderId } from '../../../../shared/project/schema.js';

export type MissionStageState = 'done' | 'active' | 'waiting' | 'blocked';

export interface MissionStage {
  id: string;
  label: string;
  detail: string;
  state: MissionStageState;
}

export interface MissionActivity {
  id: string;
  actor: string;
  detail: string;
  time: string;
  kind: CanonicalEvent['kind'];
}

export interface MissionHealthMeasure {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone?: 'steady' | 'attention';
}

const COMPLETE_STATUSES = new Set(['complete', 'completed', 'done']);
const ACTIVE_STATUSES = new Set(['active', 'doing', 'in_progress', 'in-progress', 'working']);
const BLOCKED_STATUSES = new Set(['blocked', 'failed']);

function taskState(status: string): MissionStageState {
  const normalized = status.trim().toLowerCase();
  if (COMPLETE_STATUSES.has(normalized)) return 'done';
  if (ACTIVE_STATUSES.has(normalized)) return 'active';
  if (BLOCKED_STATUSES.has(normalized)) return 'blocked';
  return 'waiting';
}

function latestTasks(projection: ThreadProjection | null): TaskItem[] {
  if (!projection) return [];
  for (let index = projection.events.length - 1; index >= 0; index -= 1) {
    const tasks = projection.events[index]?.tasks;
    if (tasks?.length) return tasks;
  }
  return [];
}

export function missionStages(projection: ThreadProjection | null): MissionStage[] {
  return latestTasks(projection).map((task) => ({
    id: task.id,
    label: task.subject,
    detail: task.activeForm || task.status,
    state: taskState(task.status),
  }));
}

const PROVIDER_ACTOR_LABEL: Record<ProviderId, string> = { claude: 'Claude', codex: 'Codex', kimi: 'Kimi' };

function eventActor(event: CanonicalEvent): string {
  if (event.kind === 'user') return 'You';
  if (event.kind === 'approval') return 'Needs you';
  if (event.kind === 'task') return 'Task update';
  if (event.kind === 'system') return 'System';
  if (event.kind === 'tool') return 'Tool';
  return PROVIDER_ACTOR_LABEL[event.provider];
}

function oneLine(text: string): string {
  const line = text.split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? '';
  return line.length > 180 ? `${line.slice(0, 177)}…` : line;
}

function timeLabel(timestamp: string): string {
  const match = timestamp.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? '';
}

export function missionActivity(projection: ThreadProjection | null): MissionActivity[] {
  if (!projection) return [];
  return projection.events
    .filter((event) => event.kind !== 'tool' && event.kind !== 'system' && oneLine(event.text))
    .slice(-8)
    .map((event) => ({
      id: event.id,
      actor: eventActor(event),
      detail: oneLine(event.text),
      time: timeLabel(event.timestamp),
      kind: event.kind,
    }));
}

export function liveMissionAgents(
  agents: AgentInfo[],
  projectId?: string,
  threadId?: string,
): AgentInfo[] {
  const associated = agents.filter((agent) =>
    (threadId && agent.threadId === threadId)
    || (projectId && agent.projectId === projectId));
  return associated.length > 0 ? associated : agents;
}

export function attentionApproval(
  projection: ThreadProjection | null,
  attention: AttentionView,
): CanonicalEvent | null {
  if (!projection || !attention.goldId?.startsWith('approval:')) return null;
  const eventId = attention.goldId.slice('approval:'.length);
  return projection.events.find((event) => event.id === eventId && event.kind === 'approval') ?? null;
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

function agentHealth(agents: AgentInfo[]): MissionHealthMeasure {
  const running = agents.filter((agent) => agent.status === 'running').length;
  return {
    id: 'agents',
    label: 'Live squad',
    value: `${running}/${agents.length}`,
    detail: agents.length === 0 ? 'No agents attached' : `${running} agents currently running`,
    ...(running === 0 && agents.length > 0 ? { tone: 'attention' as const } : { tone: 'steady' as const }),
  };
}

function taskHealth(projection: ThreadProjection | null): MissionHealthMeasure | null {
  const tasks = latestTasks(projection);
  if (tasks.length === 0) return null;
  const done = tasks.filter((task) => taskState(task.status) === 'done').length;
  const blocked = tasks.filter((task) => taskState(task.status) === 'blocked').length;
  return {
    id: 'tasks',
    label: 'Tasks',
    value: `${done}/${tasks.length}`,
    detail: blocked > 0 ? `${blocked} blocked` : `${done} completed`,
    ...(blocked > 0 ? { tone: 'attention' as const } : { tone: 'steady' as const }),
  };
}

function activityHealth(projection: ThreadProjection | null): MissionHealthMeasure | null {
  if (!projection) return null;
  return {
    id: 'activity',
    label: 'Activity',
    value: `${projection.events.length}`,
    detail: `${projection.issues.length} transcript issue${projection.issues.length === 1 ? '' : 's'}`,
    ...(projection.issues.length > 0 ? { tone: 'attention' as const } : { tone: 'steady' as const }),
  };
}

function usageHealth(usage: SessionUsage | null): MissionHealthMeasure | null {
  if (!usage) return null;
  const requests = Object.values(usage.main.perModel)
    .reduce((total, totals) => total + totals.requests, 0);
  return {
    id: 'usage',
    label: 'Session usage',
    value: compactNumber(sessionTokens(usage)),
    detail: `${requests} request${requests === 1 ? '' : 's'}`,
    tone: 'steady',
  };
}

export function missionHealth(
  projection: ThreadProjection | null,
  agents: AgentInfo[],
  usage: SessionUsage | null,
): MissionHealthMeasure[] {
  return [
    agentHealth(agents),
    taskHealth(projection),
    activityHealth(projection),
    usageHealth(usage),
  ].filter((measure): measure is MissionHealthMeasure => measure !== null);
}
