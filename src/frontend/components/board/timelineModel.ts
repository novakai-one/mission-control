// Pure timeline-shaping helpers for the board's variant renderers. No React.
import type { TranscriptEvent } from '../index.js';

export type TimelineVariant = 'current' | 'signal' | 'grouped' | 'ledger';

const VARIANT_STORAGE_KEY = 'mc-timeline-variant';

export const VARIANT_OPTIONS: { id: TimelineVariant; label: string; description: string }[] = [
  { id: 'current', label: 'Current', description: 'The original event timeline' },
  { id: 'signal', label: 'Signal', description: 'Flat, tool results merged into call rows' },
  { id: 'grouped', label: 'Grouped', description: 'Collapsible user and assistant turns' },
  { id: 'ledger', label: 'Ledger', description: 'Dense, noise compressed to strips' },
];

export function loadStoredVariant(): TimelineVariant {
  const stored = localStorage.getItem(VARIANT_STORAGE_KEY);
  const match = VARIANT_OPTIONS.find((option) => option.id === stored);
  return match ? match.id : 'current';
}

export function storeVariant(variant: TimelineVariant): void {
  localStorage.setItem(VARIANT_STORAGE_KEY, variant);
}

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

// Canonical event identity lives beside upsertEvent so selection, React keys,
// and live upserts share one rule; re-exported here for timeline consumers.
export { selKey } from '../../lib/upsertEvents.js';

/** Chip-style row label: the event's kind, not its content (content lives in the inspector). */
export function getChipLabel(event: TranscriptEvent): string {
  switch (event.kind) {
    case 'user_text': return 'user message';
    case 'assistant_text': return 'assistant text';
    case 'assistant_thinking': return 'thinking';
    case 'tool_use':
      return event.isAgentSpawn
        ? `spawn: ${event.agentDescription || event.agentType || 'subagent'}`
        : `tool: ${(event.tool || 'unknown').toLowerCase()}`;
    case 'tool_result': return event.isError ? 'tool error' : 'tool result';
    case 'hook_event': return event.hookName ? `hook: ${event.hookName}` : `ctx: ${event.hookEvent || 'update'}`;
    case 'system': return event.subtype ? `system: ${event.subtype}` : 'system';
    case 'session_meta': return event.summary ? 'summary' : 'session meta';
    default: return event.kind;
  }
}

export type SpawnRun = { spawnRun: TranscriptEvent[] };

/**
 * Collapse consecutive spawn rows sharing a (truthy) description into one
 * "spawn: x ×N" run. Description-less spawns never group — undefined ===
 * undefined would merge unrelated agent types into one row.
 */
export function groupSpawnRuns(items: (TranscriptEvent | NoiseRun)[]): (TranscriptEvent | NoiseRun | SpawnRun)[] {
  const output: (TranscriptEvent | NoiseRun | SpawnRun)[] = [];
  for (const item of items) {
    if ('noiseRun' in item || item.kind !== 'tool_use' || !item.isAgentSpawn) {
      output.push(item);
      continue;
    }
    const last = output[output.length - 1];
    if (last && 'spawnRun' in last && item.agentDescription
      && last.spawnRun[0].agentDescription === item.agentDescription) {
      last.spawnRun.push(item);
    } else {
      output.push({ spawnRun: [item] });
    }
  }
  return output;
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

// Only KNOWN synthetic tags route to injections; '[Request interrupted' is an
// interrupt; any other leading '<' or '[' text ("<div> keeps overflowing",
// '[Image…') is a genuine prompt.
function classifyUserText(text: string): EventClass {
  if (text.startsWith('[Request interrupted')) return makeClass('interrupts-notifications', 'request-interrupted');
  const tagName = /^<([\w-]+)/.exec(text)?.[1];
  if (!tagName) return singleChild('user-prompts');
  if (USER_TAG_ROUTES[tagName]) return USER_TAG_ROUTES[tagName];
  if (tagName.startsWith('command-') || tagName.startsWith('local-command-')) {
    return makeClass('commands', 'slash-commands');
  }
  return singleChild('user-prompts');
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
export function masterState(category: string, children: string[], hidden: Set<string>): 'on' | 'off' | 'mixed' {
  if (hidden.has(`${category}/*`)) return 'off';
  const hiddenCount = children.filter((childKey) => hidden.has(childKey)).length;
  if (hiddenCount === 0) return 'on';
  return hiddenCount === children.length ? 'off' : 'mixed';
}

/** Keys to add to (hide) and remove from (show) the hidden set, applied together. */
export interface FilterKeyUpdate {
  hide: string[];
  show: string[];
}

/** Master click: on → hide the whole category via wildcard (covers future children); off/mixed → show all. */
export function masterToggleUpdate(category: string, children: string[], state: 'on' | 'off' | 'mixed'): FilterKeyUpdate {
  const wildcard = `${category}/*`;
  if (state === 'on') return { hide: [wildcard], show: children };
  return { hide: [], show: [wildcard, ...children] };
}

/** Child click; under an active wildcard, only the clicked child becomes visible. */
export function childToggleUpdate(category: string, childKey: string, children: string[], hidden: Set<string>): FilterKeyUpdate {
  const wildcard = `${category}/*`;
  if (hidden.has(wildcard)) {
    return { hide: children.filter((presentKey) => presentKey !== childKey), show: [wildcard] };
  }
  return hidden.has(childKey) ? { hide: [], show: [childKey] } : { hide: [childKey], show: [] };
}

/** Filter fn over hidden "category/child" keys ("category/*" hides all); unknown keys default visible. */
export function visibilityPredicate(hidden: Set<string>): (event: TranscriptEvent) => boolean {
  return (event) => {
    if (event.isSidechain && (hidden.has(SIDECHAIN_KEY) || hidden.has('sidechain/*'))) return false;
    const eventClass = classifyEvent(event);
    return !hidden.has(`${eventClass.category}/*`) && !hidden.has(`${eventClass.category}/${eventClass.child}`);
  };
}

export interface Turn {
  header: TranscriptEvent | null;
  children: TranscriptEvent[];
}

// A user_text opens a turn iff classification calls it a genuine prompt, so
// synthetic carriers (<command-name>, <system-reminder>, interrupts) never do.
function opensTurn(event: TranscriptEvent): boolean {
  if (event.kind === 'assistant_text') return true;
  if (event.kind !== 'user_text') return false;
  return classifyUserText(event.text || '').category === 'user-prompts';
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
    // Thinking precedes text within an assistant message only; user turns must not steal it.
    const carried = event.kind === 'assistant_text' ? takeTrailingThinking(current.children) : [];
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
