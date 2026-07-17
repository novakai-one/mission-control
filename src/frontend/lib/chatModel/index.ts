// Chat panel read model. Maps canonical thread events into the studio reply
// grammar: a caption plus numbered state rows. Every row carries `objectId` —
// the linked-mention target: when the caller passes the resolvable mention
// targets, a row whose text names a workspace object gets that object's id,
// and clicking the row lights it.
import { firstMentionObjectId, type MentionTarget } from '../mentions/index.js';
import type { CanonicalEvent, ThreadProjection } from '../../../shared/provider/schema.js';

export interface ChatRow {
  id: string;
  /** Mono object label ("npm run migrate", a file). Empty when none. */
  mono: string;
  /** Quiet sans description (task subject, approval reason). */
  text: string;
  /** Right-aligned state word ("completed", "awaiting"). Empty hides it. */
  state: string;
  /** Settled rows read sage instead of grey. */
  settled: boolean;
  objectId: string | null;
}

export interface ChatMessage {
  id: string;
  /** Agent identity — the per-thread agent name ("claude-1"), never a color. */
  author: string;
  fromYou: boolean;
  time: string;
  caption: string;
  rows: ChatRow[];
  /** True only for the one open item waiting on Chris — the sole gold label. */
  needsYou: boolean;
}

const CHAT_KINDS = new Set(['user', 'assistant', 'task', 'approval']);

/** Stable per-thread agent names: each distinct provider session gets
 * "<provider>-<n>" in order of first appearance, so two Claudes in one
 * thread stay distinguishable without inventing colors. */
export function agentNames(events: CanonicalEvent[]): Map<string, string> {
  const names = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const event of events) {
    const sessionKey = `${event.provider}:${event.sessionId}`;
    if (names.has(sessionKey)) continue;
    const next = (counts.get(event.provider) ?? 0) + 1;
    counts.set(event.provider, next);
    names.set(sessionKey, `${event.provider}-${next}`);
  }
  return names;
}

export function formatChatTime(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

function taskRows(event: CanonicalEvent, targets: MentionTarget[]): ChatRow[] {
  return (event.tasks ?? []).map((task, index) => {
    const text = task.status === 'in_progress' ? (task.activeForm || task.subject) : task.subject;
    return {
      id: `${event.id}:${task.id || index}`,
      mono: '',
      text,
      state: task.status.replace(/_/g, ' '),
      settled: task.status === 'completed',
      objectId: firstMentionObjectId(text, targets),
    };
  });
}

function approvalRows(event: CanonicalEvent, targets: MentionTarget[]): ChatRow[] {
  const approval = event.approval;
  if (!approval) return [];
  const rows: ChatRow[] = [];
  if (approval.command) {
    const text = approval.reason ?? '';
    rows.push({ id: `${event.id}:command`, mono: approval.command, text, state: 'awaiting', settled: false, objectId: firstMentionObjectId(`${approval.command} ${text}`, targets) });
  }
  for (const [index, write] of approval.writes.entries()) {
    rows.push({ id: `${event.id}:write:${index}`, mono: write, text: '', state: 'writes', settled: false, objectId: firstMentionObjectId(write, targets) });
  }
  // Answer choices of a question approval — labels, not terminal output, so
  // they ride the text slot rather than mono.
  for (const [index, option] of (approval.options ?? []).entries()) {
    rows.push({ id: `${event.id}:option:${index}`, mono: '', text: option, state: 'option', settled: false, objectId: firstMentionObjectId(option, targets) });
  }
  return rows;
}

function captionFor(event: CanonicalEvent): string {
  if (event.kind === 'task') return event.text || 'Task list updated.';
  if (event.kind === 'approval') return event.text || 'Approval requested.';
  return event.text || event.rawType;
}

function toChatMessage(event: CanonicalEvent, names: Map<string, string>, needsYou: boolean, targets: MentionTarget[]): ChatMessage {
  const fromYou = event.kind === 'user';
  const rows = event.kind === 'task' ? taskRows(event, targets)
    : event.kind === 'approval' ? approvalRows(event, targets)
    : [];
  return {
    id: event.id,
    author: fromYou ? 'You' : (names.get(`${event.provider}:${event.sessionId}`) ?? event.provider),
    fromYou,
    time: formatChatTime(event.timestamp),
    caption: captionFor(event),
    rows,
    needsYou,
  };
}

/** Last `limit` conversation-worthy events as chat messages; tool/system
 * events stay in the workspace timeline, not the conversation. Only an
 * approval that is still the thread's newest word may claim attention —
 * exactly one gold label, released the moment anything follows it. */
export function buildChatMessages(projection: ThreadProjection | null, limit = 80, targets: MentionTarget[] = []): ChatMessage[] {
  if (!projection) return [];
  const names = agentNames(projection.events);
  const lastEvent = projection.events[projection.events.length - 1];
  const openApprovalId = lastEvent?.kind === 'approval' ? lastEvent.id : null;
  return projection.events
    .filter((event) => CHAT_KINDS.has(event.kind))
    .slice(-limit)
    .map((event) => toChatMessage(event, names, event.id === openApprovalId, targets));
}

export type AgentActivity = 'idle' | 'working' | 'replying' | 'ready' | 'settled';

const REPLY_RECENCY_MS = 8_000;

/** Honest activity for the thread's runtime agent, derived from the live
 * projection: a pending or unanswered user turn = Working, fresh output =
 * Replying, an idle prompt = Ready. Exited agents read Settled. System meta
 * is ignored — idle sessions heartbeat system events with fresh timestamps,
 * which must not hold the state at Replying. */
export function agentActivity(
  status: 'running' | 'exited' | null,
  events: CanonicalEvent[],
  hasPendingSend: boolean,
  nowMs: number,
): AgentActivity {
  if (status === null) return 'idle';
  if (status === 'exited') return 'settled';
  const spoken = events.filter((event) => event.kind !== 'system');
  const lastEvent = spoken[spoken.length - 1];
  if (hasPendingSend || lastEvent?.kind === 'user') return 'working';
  const lastMs = lastEvent ? new Date(lastEvent.timestamp).getTime() : Number.NaN;
  if (Number.isFinite(lastMs) && nowMs - lastMs < REPLY_RECENCY_MS) return 'replying';
  return 'ready';
}
