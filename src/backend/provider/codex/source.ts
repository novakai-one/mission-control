import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { SessionReference } from '../../../shared/project/schema.js';
import type { CanonicalEvent, SessionSnapshot } from '../../../shared/provider/schema.js';
import { SessionNotFoundError, type ProviderSessionSource } from '../source/index.js';

interface CodexLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

function compactText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.length <= 4_000 ? value : `${value.slice(0, 4_000)}…`;
}

function eventKind(payloadType: unknown): CanonicalEvent['kind'] | null {
  if (payloadType === 'user_message') return 'user';
  if (payloadType === 'agent_message') return 'assistant';
  if (payloadType === 'custom_tool_call' || payloadType === 'custom_tool_call_output') return 'tool';
  if (payloadType === 'function_call' || payloadType === 'function_call_output') return 'tool';
  if (payloadType === 'exec_approval_request' || payloadType === 'apply_patch_approval_request') return 'approval';
  if (payloadType === 'task_started' || payloadType === 'task_complete' || payloadType === 'turn_aborted') return 'system';
  return null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function eventText(payload: Record<string, unknown>): string {
  if (typeof payload.message === 'string') return compactText(payload.message);
  if (typeof payload.name === 'string') return payload.name;
  if (typeof payload.reason === 'string') return compactText(payload.reason);
  if (typeof payload.command === 'string') return compactText(payload.command);
  if (payload.type === 'task_started') return 'Task started';
  if (payload.type === 'task_complete') return 'Task completed';
  if (payload.type === 'turn_aborted') return 'Turn interrupted';
  return '';
}

function approvalDetails(payload: Record<string, unknown>) {
  return {
    ...(typeof payload.command === 'string' ? { command: compactText(payload.command) } : {}),
    ...(typeof payload.reason === 'string' ? { reason: compactText(payload.reason) } : {}),
    writes: strings(payload.writes),
  };
}

function canonicalEvent(line: CodexLine, sessionId: string, lineIndex: number): CanonicalEvent | null {
  const payload = line.payload;
  if (!payload) return null;
  const kind = eventKind(payload.type);
  if (!kind) return null;
  const rawId = payload.id || payload.call_id || `${lineIndex}`;
  const approval = kind === 'approval' ? approvalDetails(payload) : undefined;
  return {
    id: `codex:${sessionId}:${String(rawId)}`,
    provider: 'codex',
    sessionId,
    kind,
    timestamp: line.timestamp || '',
    text: eventText(payload),
    rawType: String(payload.type),
    ...(approval ? { approval } : {}),
  };
}

function parseLines(filePath: string, sessionId: string): CanonicalEvent[] {
  return readFileSync(filePath, 'utf8').split('\n').flatMap((rawLine, lineIndex) => {
    if (!rawLine.trim()) return [];
    try {
      const event = canonicalEvent(JSON.parse(rawLine) as CodexLine, sessionId, lineIndex);
      return event ? [event] : [];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid Codex session line ${lineIndex + 1}: ${reason}`);
    }
  });
}

/** Codex rollout adapter for provider-owned session files. */
export class CodexSessionSource implements ProviderSessionSource {
  readonly provider = 'codex' as const;

  constructor(
    private readonly sessionsRoot = path.join(homedir(), '.codex', 'sessions'),
    private readonly archivedRoot = path.join(homedir(), '.codex', 'archived_sessions'),
  ) {}

  read(reference: SessionReference): SessionSnapshot {
    const filePath = this.findSession(reference.sessionId);
    if (!filePath) throw new SessionNotFoundError('codex', reference.sessionId);
    return {
      provider: 'codex',
      sessionId: reference.sessionId,
      events: parseLines(filePath, reference.sessionId),
    };
  }

  private findSession(sessionId: string): string | null {
    return this.findWithin(this.sessionsRoot, sessionId)
      || this.findWithin(this.archivedRoot, sessionId);
  }

  private findWithin(root: string, sessionId: string): string | null {
    if (!existsSync(root)) return null;
    const pending = [root];
    while (pending.length > 0) {
      const directory = pending.pop()!;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const candidate = path.join(directory, entry.name);
        if (entry.isDirectory()) pending.push(candidate);
        else if (entry.name.endsWith(`${sessionId}.jsonl`)) return candidate;
      }
    }
    return null;
  }
}
