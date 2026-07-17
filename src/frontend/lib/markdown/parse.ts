// Tiny markdown parser for transcript prose — pure data in, pure data out,
// no HTML ever. Supports exactly: bold, italic, inline code, fenced code
// blocks, headers, unordered/ordered lists, and http(s) links. Anything else
// stays literal text; React's escaping keeps raw HTML inert downstream.

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type BlockNode =
  | { type: 'paragraph'; inline: InlineNode[] }
  | { type: 'heading'; level: number; inline: InlineNode[] }
  | { type: 'codeblock'; lang: string; text: string }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] };

// Alternatives in group order: strong(1), code(2), em-star(3), em-under(4),
// link(5=label, 6=href). Only http(s) hrefs match, so javascript: URLs and
// friends stay literal text by construction.
const INLINE_PATTERN = new RegExp(
  '\\*\\*([^*]+)\\*\\*'
  + '|`([^`\\n]+)`'
  + '|\\*([^*\\s](?:[^*]*[^*\\s])?)\\*'
  + '|(?<![\\w_])_([^_\\s](?:[^_]*[^_\\s])?)_(?![\\w_])'
  + '|\\[([^\\]\\n]+)\\]\\((https?://[^\\s)]+)\\)',
  'g',
);

const FENCE_OPEN = /^```([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const UNORDERED_ITEM = /^[-*]\s+(.+)$/;
const ORDERED_ITEM = /^\d{1,3}[.)]\s+(.+)$/;

function classifyMatch(match: RegExpExecArray): InlineNode {
  const [, strong, code, emStar, emUnder, linkLabel, linkHref] = match;
  if (strong !== undefined) return { type: 'strong', text: strong };
  if (code !== undefined) return { type: 'code', text: code };
  if (emStar !== undefined) return { type: 'em', text: emStar };
  if (emUnder !== undefined) return { type: 'em', text: emUnder };
  return { type: 'link', text: linkLabel, href: linkHref };
}

/** One line (or paragraph) of prose into inline nodes; unmatched syntax
 * survives untouched inside plain text nodes. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push({ type: 'text', text: text.slice(cursor, start) });
    nodes.push(classifyMatch(match as RegExpExecArray));
    cursor = start + match[0].length;
  }
  if (cursor < text.length) nodes.push({ type: 'text', text: text.slice(cursor) });
  return nodes;
}

function takeFence(lines: string[], start: number, blocks: BlockNode[]): number {
  const lang = FENCE_OPEN.exec(lines[start])?.[1] ?? '';
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length && lines[index].trimEnd() !== '```') {
    body.push(lines[index]);
    index += 1;
  }
  blocks.push({ type: 'codeblock', lang, text: body.join('\n') });
  return Math.min(index + 1, lines.length);
}

function takeList(lines: string[], start: number, blocks: BlockNode[]): number {
  const ordered = ORDERED_ITEM.test(lines[start]);
  const pattern = ordered ? ORDERED_ITEM : UNORDERED_ITEM;
  const items: InlineNode[][] = [];
  let index = start;
  while (index < lines.length) {
    const item = pattern.exec(lines[index]);
    if (!item) break;
    items.push(parseInline(item[1]));
    index += 1;
  }
  blocks.push({ type: 'list', ordered, items });
  return index;
}

function startsBlock(line: string): boolean {
  return line.trim() === '' || FENCE_OPEN.test(line) || HEADING.test(line)
    || UNORDERED_ITEM.test(line) || ORDERED_ITEM.test(line);
}

function takeParagraph(lines: string[], start: number, blocks: BlockNode[]): number {
  const body: string[] = [lines[start]];
  let index = start + 1;
  while (index < lines.length && !startsBlock(lines[index])) {
    body.push(lines[index]);
    index += 1;
  }
  blocks.push({ type: 'paragraph', inline: parseInline(body.join('\n')) });
  return index;
}

function takeBlock(lines: string[], start: number, blocks: BlockNode[]): number {
  const line = lines[start];
  if (line.trim() === '') return start + 1;
  if (FENCE_OPEN.test(line)) return takeFence(lines, start, blocks);
  const heading = HEADING.exec(line);
  if (heading) {
    blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2]) });
    return start + 1;
  }
  if (UNORDERED_ITEM.test(line) || ORDERED_ITEM.test(line)) return takeList(lines, start, blocks);
  return takeParagraph(lines, start, blocks);
}

/** Transcript text into block nodes. Total: every character of the input is
 * accounted for — either structured or carried through as literal text. */
export function parseMarkdown(text: string): BlockNode[] {
  const lines = text.split('\n');
  const blocks: BlockNode[] = [];
  let index = 0;
  while (index < lines.length) index = takeBlock(lines, index, blocks);
  return blocks;
}
