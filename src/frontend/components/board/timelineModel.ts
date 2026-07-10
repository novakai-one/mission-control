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

export interface EventClass {
  section: string;
  category: string;
  child: string;
}

/** Category → panel section, in the panel's display order. */
export const CATEGORY_SECTIONS: Record<string, string> = {
  'user-prompts': 'CONVERSATION',
  'assistant-replies': 'CONVERSATION',
  thinking: 'CONVERSATION',
  'tool-calls': 'TOOLS',
  'tool-results': 'TOOLS',
  spawns: 'TOOLS',
  hooks: 'CONTEXT INJECTIONS',
  reminders: 'CONTEXT INJECTIONS',
  'capability-deltas': 'CONTEXT INJECTIONS',
  commands: 'CONTEXT INJECTIONS',
  'mode-transitions': 'CONTEXT INJECTIONS',
  'files-ide': 'CONTEXT INJECTIONS',
  'interrupts-notifications': 'CONTEXT INJECTIONS',
  'other-injections': 'CONTEXT INJECTIONS',
  'mode-permissions': 'SESSION META',
  'system-messages': 'SESSION META',
  summaries: 'SESSION META',
  sidechain: 'SESSION META',
};

/** hookName-less attachment type → category; unmapped types land in other-injections. */
const ATTACHMENT_CATEGORIES: Record<string, string> = {
  task_reminder: 'reminders',
  todo_reminder: 'reminders',
  deferred_tools_delta: 'capability-deltas',
  agent_listing_delta: 'capability-deltas',
  skill_listing: 'capability-deltas',
  mcp_instructions_delta: 'capability-deltas',
  queued_command: 'commands',
  command_permissions: 'commands',
  plan_mode: 'mode-transitions',
  plan_mode_exit: 'mode-transitions',
  auto_mode: 'mode-transitions',
  ultra_effort_enter: 'mode-transitions',
  ultra_effort_exit: 'mode-transitions',
  edited_text_file: 'files-ide',
  nested_memory: 'files-ide',
  directory: 'files-ide',
  file: 'files-ide',
  selected_lines_in_ide: 'files-ide',
};

/** Known leading <tag> forms in synthetic user_text. */
const USER_TAG_ROUTES: Record<string, EventClass> = {
  'system-reminder': makeClass('reminders', 'system-reminder'),
  'task-notification': makeClass('interrupts-notifications', 'task-notification'),
  ide_opened_file: makeClass('files-ide', 'ide_opened_file'),
};

function makeClass(category: string, child: string): EventClass {
  return { section: CATEGORY_SECTIONS[category] || 'SESSION META', category, child };
}

function singleChild(category: string): EventClass {
  return makeClass(category, category);
}

// Leading '<tag>' routes by tag; '[Request interrupted' is an interrupt;
// everything else ('[Image…' included) is a genuine prompt.
function classifyUserText(text: string): EventClass {
  if (text.startsWith('[Request interrupted')) return makeClass('interrupts-notifications', 'request-interrupted');
  const tagMatch = /^<([\w-]+)/.exec(text);
  if (!tagMatch) return singleChild('user-prompts');
  const tagName = tagMatch[1];
  if (USER_TAG_ROUTES[tagName]) return USER_TAG_ROUTES[tagName];
  if (tagName.startsWith('command-') || tagName.startsWith('local-command-')) {
    return makeClass('commands', 'slash-commands');
  }
  return makeClass('other-injections', tagName);
}

function classifyHookEvent(event: TranscriptEvent): EventClass {
  if (event.hookName) return makeClass('hooks', event.hookName);
  const attachType = event.hookEvent || 'unknown';
  const category = ATTACHMENT_CATEGORIES[attachType];
  return makeClass(category || 'other-injections', attachType);
}

function classifySessionMeta(event: TranscriptEvent): EventClass {
  if (event.mode) return makeClass('mode-permissions', 'mode');
  if (event.permissionMode) return makeClass('mode-permissions', 'permissions');
  return singleChild('summaries');
}

/** Map an event to its panel section/category/child (filter key = "category/child"). */
export function classifyEvent(event: TranscriptEvent): EventClass {
  switch (event.kind) {
    case 'user_text': return classifyUserText(event.text || '');
    case 'assistant_text': return singleChild('assistant-replies');
    case 'assistant_thinking': return singleChild('thinking');
    case 'tool_use':
      return event.isAgentSpawn ? singleChild('spawns') : makeClass('tool-calls', event.tool || 'unknown');
    case 'tool_result':
      return makeClass('tool-results', event.isError ? 'results-error' : 'results-ok');
    case 'hook_event': return classifyHookEvent(event);
    case 'system': return makeClass('system-messages', event.subtype || 'other');
    case 'session_meta': return classifySessionMeta(event);
    default: return makeClass('other-injections', event.kind);
  }
}

/** Cross-cutting filter key: hides any event flagged isSidechain, on top of its category. */
export const SIDECHAIN_KEY = 'sidechain/sidechain';

/** Master-toggle state over the present children's filter keys. */
export function masterState(children: string[], hidden: Set<string>): 'on' | 'off' | 'mixed' {
  const hiddenCount = children.filter((childKey) => hidden.has(childKey)).length;
  if (hiddenCount === 0) return 'on';
  return hiddenCount === children.length ? 'off' : 'mixed';
}

/** Filter fn over hidden "category/child" keys; unknown keys default visible. */
export function visibilityPredicate(hidden: Set<string>): (event: TranscriptEvent) => boolean {
  return (event) => {
    if (event.isSidechain && hidden.has(SIDECHAIN_KEY)) return false;
    const eventClass = classifyEvent(event);
    return !hidden.has(`${eventClass.category}/${eventClass.child}`);
  };
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
