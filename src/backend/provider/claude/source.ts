import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { SessionReference } from '../../../shared/project/schema.js';
import type { CanonicalEvent, SessionSnapshot } from '../../../shared/provider/schema.js';
import { encodeCwd, readSession, type TranscriptEvent } from '../../transcript/parser.js';
import { SessionNotFoundError, type ProviderSessionSource } from '../source/index.js';

function canonicalKind(event: TranscriptEvent): CanonicalEvent['kind'] | null {
  if (event.kind === 'user_text') return 'user';
  if (event.kind === 'assistant_text') return 'assistant';
  if (event.kind === 'tool_use' || event.kind === 'tool_result') return 'tool';
  if (event.kind === 'task_snapshot') return 'task';
  if (event.kind === 'usage' || event.kind === 'assistant_thinking') return null;
  return 'system';
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
  return {
    id: `claude:${event.eventKey || event.uuid}`,
    provider: 'claude',
    sessionId: event.sessionId,
    kind,
    timestamp: event.ts,
    text: eventText(event),
    rawType: event.kind,
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
