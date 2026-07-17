import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { SessionReference } from '../../../shared/project/schema.js';
import type { ApprovalDetails, CanonicalEvent, SessionSnapshot } from '../../../shared/provider/schema.js';
import { encodeCwd, readSession, type TranscriptEvent } from '../../transcript/parser.js';
import { SessionNotFoundError, type ProviderSessionSource } from '../source/index.js';

// Tools that stop the turn until Chris answers. They must reach the
// conversation as approvals — mapped to 'tool' they were filtered out and a
// question needing him produced nothing on screen.
const INPUT_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);

function needsInput(event: TranscriptEvent): boolean {
  return event.kind === 'tool_use' && INPUT_TOOLS.has(event.tool);
}

function canonicalKind(event: TranscriptEvent): CanonicalEvent['kind'] | null {
  if (event.kind === 'user_text') return 'user';
  if (event.kind === 'assistant_text') return 'assistant';
  if (needsInput(event)) return 'approval';
  if (event.kind === 'tool_use' || event.kind === 'tool_result') return 'tool';
  if (event.kind === 'task_snapshot') return 'task';
  if (event.kind === 'usage' || event.kind === 'assistant_thinking') return null;
  return 'system';
}

interface AskQuestion {
  question?: string;
  header?: string;
  options?: { label?: string }[];
}

/** AskUserQuestion → the question as caption, its answers as option rows. */
function askApproval(input: { questions?: AskQuestion[] }): { text: string; approval: ApprovalDetails } {
  const questions = Array.isArray(input?.questions) ? input.questions : [];
  const text = questions.map((entry) => entry?.question).filter(Boolean).join('\n\n') || 'Question for you';
  const reason = questions.map((entry) => entry?.header).filter(Boolean).join(' · ');
  const prefixed = questions.length > 1;
  const options = questions.flatMap((entry) =>
    (Array.isArray(entry?.options) ? entry.options : [])
      .map((option) => option?.label)
      .filter((label): label is string => typeof label === 'string' && label !== '')
      .map((label) => (prefixed && entry.header ? `${entry.header}: ${label}` : label)));
  return {
    text,
    approval: { ...(reason ? { reason } : {}), writes: [], ...(options.length ? { options } : {}) },
  };
}

/** ExitPlanMode → title-only caption; the plan body stays in the terminal. */
function planApproval(input: { plan?: string }): { text: string; approval: ApprovalDetails } {
  const plan = typeof input?.plan === 'string' ? input.plan : '';
  const title = plan.split('\n').map((line) => line.trim()).find(Boolean)?.replace(/^#+\s*/, '') ?? '';
  return { text: title ? `Plan ready — ${title}` : 'Plan ready for review', approval: { writes: [] } };
}

function inputRequest(event: TranscriptEvent): { text: string; approval: ApprovalDetails } {
  if (event.kind !== 'tool_use') return { text: '', approval: { writes: [] } };
  return event.tool === 'AskUserQuestion' ? askApproval(event.input) : planApproval(event.input);
}

function eventText(event: TranscriptEvent): string {
  if ('text' in event) return event.text;
  if (event.kind === 'tool_use') return event.tool;
  if (event.kind === 'tool_result') return event.isError ? `Tool failed: ${event.content}` : event.content;
  if (event.kind === 'hook_event') return event.content || event.hookEvent;
  if (event.kind === 'task_snapshot') {
    const done = event.tasks.filter((task) => task.status === 'completed').length;
    return `Tasks · ${done}/${event.tasks.length} complete`;
  }
  if (event.kind === 'session_meta') return event.summary || event.permissionMode || event.mode || '';
  return '';
}

function canonicalEvent(event: TranscriptEvent): CanonicalEvent | null {
  const kind = canonicalKind(event);
  if (!kind) return null;
  const request = kind === 'approval' ? inputRequest(event) : null;
  return {
    id: `claude:${event.eventKey || event.uuid}`,
    provider: 'claude',
    sessionId: event.sessionId,
    kind,
    timestamp: event.ts,
    text: request ? request.text : eventText(event),
    rawType: event.kind,
    ...(request ? { approval: request.approval } : {}),
    ...(event.kind === 'task_snapshot' ? { tasks: event.tasks } : {}),
  };
}

/** Claude JSONL adapter for provider-owned project sessions. */
export class ClaudeSessionSource implements ProviderSessionSource {
  readonly provider = 'claude' as const;

  constructor(
    private readonly projectsRoot = path.join(homedir(), '.claude', 'projects'),
  ) {}

  read(reference: SessionReference): SessionSnapshot {
    const filePath = this.locate(reference);
    const events = readSession(filePath)
      .map(canonicalEvent)
      .filter((event): event is CanonicalEvent => event !== null);
    return { provider: 'claude', sessionId: reference.sessionId, events };
  }

  private locate(reference: SessionReference): string {
    const direct = reference.cwd
      ? path.join(this.projectsRoot, encodeCwd(reference.cwd), `${reference.sessionId}.jsonl`)
      : null;
    if (direct && existsSync(direct)) return direct;
    if (existsSync(this.projectsRoot)) {
      for (const entry of readdirSync(this.projectsRoot, { withFileTypes: true })) {
        const candidate = path.join(this.projectsRoot, entry.name, `${reference.sessionId}.jsonl`);
        if (entry.isDirectory() && existsSync(candidate)) return candidate;
      }
    }
    throw new SessionNotFoundError('claude', reference.sessionId);
  }
}
