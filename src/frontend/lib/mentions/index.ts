// Mention resolver — maps workspace object names (agent names, thread
// titles) appearing in chat text to the objects they mean, so the text can
// render as linked mentions that light their object. Pure string work: the
// UI owns the chips, the highlight store owns what is lit.

export type MentionKind = 'agent' | 'thread';

export interface MentionTarget {
  /** Highlight-store key: "agent:<name>" / "thread:<id>". */
  objectId: string;
  /** The text that counts as a mention of this object. */
  label: string;
  kind: MentionKind;
}

export interface MentionSegment {
  text: string;
  target: MentionTarget | null;
}

export function agentObjectId(name: string): string {
  return `agent:${name}`;
}

export function threadObjectId(threadId: string): string {
  return `thread:${threadId}`;
}

const MIN_LABEL_LENGTH = 3;

/** The resolvable universe: live agent names + this project's thread titles. */
export function buildTargets(
  agents: { title: string }[],
  threads: { id: string; title: string }[],
): MentionTarget[] {
  const targets: MentionTarget[] = [
    ...agents.map((agent) => ({ objectId: agentObjectId(agent.title), label: agent.title, kind: 'agent' as const })),
    ...threads.map((thread) => ({ objectId: threadObjectId(thread.id), label: thread.title, kind: 'thread' as const })),
  ];
  return targets.filter((target) => target.label.trim().length >= MIN_LABEL_LENGTH);
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\w-]/.test(char);
}

/** First whole-word occurrence of the label at/after `from`, else -1. */
function findLabel(text: string, lower: string, label: string, from: number): number {
  let found = lower.indexOf(label, from);
  while (found !== -1 && (isWordChar(text[found - 1]) || isWordChar(text[found + label.length]))) {
    found = lower.indexOf(label, found + 1);
  }
  return found;
}

interface MentionHit {
  index: number;
  target: MentionTarget;
}

/** Earliest match wins; on a tie the longer label wins (codex-1 over codex). */
function nextHit(text: string, lower: string, from: number, targets: MentionTarget[]): MentionHit | null {
  let best: MentionHit | null = null;
  for (const target of targets) {
    const index = findLabel(text, lower, target.label.toLowerCase(), from);
    if (index === -1) continue;
    const wins = !best || index < best.index
      || (index === best.index && target.label.length > best.target.label.length);
    if (wins) best = { index, target };
  }
  return best;
}

/** Split text into plain and mention segments (case-insensitive, whole word). */
export function splitMentions(text: string, targets: MentionTarget[]): MentionSegment[] {
  const segments: MentionSegment[] = [];
  const lower = text.toLowerCase();
  let cursor = 0;
  for (let match = nextHit(text, lower, cursor, targets); match; match = nextHit(text, lower, cursor, targets)) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), target: null });
    const after = match.index + match.target.label.length;
    segments.push({ text: text.slice(match.index, after), target: match.target });
    cursor = after;
  }
  if (cursor < text.length || segments.length === 0) segments.push({ text: text.slice(cursor), target: null });
  return segments;
}

/** The object a row's text points to, if any — fills the ChatRow.objectId seam. */
export function firstMentionObjectId(text: string, targets: MentionTarget[]): string | null {
  const match = nextHit(text, text.toLowerCase(), 0, targets);
  return match ? match.target.objectId : null;
}
