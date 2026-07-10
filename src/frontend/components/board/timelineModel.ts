// Pure timeline-shaping helpers for the board's variant renderers. No React.
import type { TranscriptEvent } from '../index.js';

const TOOL_PRIMARY_KEYS: Record<string, string[]> = {
  Bash: ['command'],
  Read: ['file_path'],
  Edit: ['file_path'],
  Write: ['file_path'],
  NotebookEdit: ['file_path'],
  Grep: ['pattern'],
  Glob: ['pattern'],
  WebFetch: ['url', 'query'],
  WebSearch: ['url', 'query'],
};

function firstStringValue(input: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    const value = input[name];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

/** Tool row label from the real input value (command, path, pattern…), not key names. */
export function getToolLabel(event: TranscriptEvent): string {
  if (event.isAgentSpawn) return `Spawn: ${event.agentDescription || event.agentType || 'subagent'}`;
  const tool = event.tool || 'unknown';
  const input = (event.input ?? {}) as Record<string, unknown>;
  const value = firstStringValue(input, TOOL_PRIMARY_KEYS[tool] ?? [])
    ?? firstStringValue(input, Object.keys(input));
  if (value === null) return `${tool}(${Object.keys(input).slice(0, 3).join(', ')})`;
  return `${tool}  ${value.length > 80 ? `${value.slice(0, 80)}…` : value}`;
}

export interface ToolPairs {
  results: Map<string, TranscriptEvent>;
  toolUseIds: Set<string>;
}

/** Index tool_use/tool_result pairing within the visible (possibly playback-sliced) events. */
export function buildToolPairs(events: TranscriptEvent[]): ToolPairs {
  const results = new Map<string, TranscriptEvent>();
  const toolUseIds = new Set<string>();
  for (const event of events) {
    if (!event.toolUseId) continue;
    if (event.kind === 'tool_use') toolUseIds.add(event.toolUseId);
    else if (event.kind === 'tool_result') results.set(event.toolUseId, event);
  }
  return { results, toolUseIds };
}

/**
 * True for repeating context chatter: mode/permission session_meta rows and
 * hookName-less hook_event attachments (deltas, reminders, …). Genuine hooks
 * always carry a hookName; summary lines are not noise.
 */
export function isContextNoise(event: TranscriptEvent): boolean {
  if (event.kind === 'session_meta') return Boolean(event.mode || event.permissionMode);
  if (event.kind === 'hook_event') return !event.hookName;
  return false;
}

export interface Turn {
  header: TranscriptEvent | null;
  children: TranscriptEvent[];
}

// Synthetic user_text carriers (<command-name>, <system-reminder>, interrupts)
// never open a turn; genuine user_text and assistant_text do.
function opensTurn(event: TranscriptEvent): boolean {
  if (event.kind === 'assistant_text') return true;
  if (event.kind !== 'user_text') return false;
  const text = event.text || '';
  return !text.startsWith('<') && !text.startsWith('[Request interrupted');
}

// Thinking precedes text within an assistant message, so a trailing run of
// thinking belongs to the turn being opened, not the one being closed.
function takeTrailingThinking(children: TranscriptEvent[]): TranscriptEvent[] {
  const carried: TranscriptEvent[] = [];
  while (children.length > 0 && children[children.length - 1].kind === 'assistant_thinking') {
    carried.unshift(children.pop() as TranscriptEvent);
  }
  return carried;
}

/** Group a flat event list into turns; events before the first header land in a header-null turn. */
export function groupIntoTurns(events: TranscriptEvent[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn = { header: null, children: [] };
  for (const event of events) {
    if (!opensTurn(event)) {
      current.children.push(event);
      continue;
    }
    const carried = takeTrailingThinking(current.children);
    if (current.header !== null || current.children.length > 0) turns.push(current);
    current = { header: event, children: carried };
  }
  if (current.header !== null || current.children.length > 0) turns.push(current);
  return turns;
}

export type NoiseRun = { noiseRun: TranscriptEvent[] };

/** Collapse consecutive context-noise events into runs; other events pass through. */
export function compressNoiseRuns(events: TranscriptEvent[]): (TranscriptEvent | NoiseRun)[] {
  const output: (TranscriptEvent | NoiseRun)[] = [];
  for (const event of events) {
    if (!isContextNoise(event)) {
      output.push(event);
      continue;
    }
    const last = output[output.length - 1];
    if (last && 'noiseRun' in last) last.noiseRun.push(event);
    else output.push({ noiseRun: [event] });
  }
  return output;
}

/** One-line description of a consecutive run of noise events. */
export function noiseSummary(items: TranscriptEvent[]): string {
  const parts = new Set<string>();
  const hookCount = items.filter((item) => item.kind === 'hook_event').length;
  if (hookCount > 0) parts.add(`${hookCount} context update${hookCount === 1 ? '' : 's'}`);
  for (const item of items) {
    if (item.mode) parts.add(`mode ${item.mode}`);
    if (item.permissionMode) parts.add(`perms ${item.permissionMode}`);
  }
  return [...parts].join(' · ');
}
