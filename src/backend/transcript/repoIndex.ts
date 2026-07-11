import path from 'node:path';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { CLAUDE_DIR } from './parser.js';

// ponytail: in-memory index, rebuilt per process; persist to disk if the
// first-request sweep (~5-10s) starts to hurt.

interface IndexEntry {
  mtimeMs: number;
  size: number;
  cwds: string[];
  touchedPaths: string[];
  title: string;
}

export interface SessionMatch {
  sessionId: string;
  dirName: string;
  modified: number;
  size: number;
  matchReason: 'cwd' | 'files';
  title: string;
}

const cache = new Map<string, IndexEntry>();
let sweepInFlight: Promise<void> | null = null;

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const BASH_PATH_RE = /(?:^|[\s"'=(])(\/[^\s"'`;|)&<>]+)/g;

export async function matchSessions(activeRepo: string): Promise<SessionMatch[]> {
  await ensureSweep();
  const repo = activeRepo.endsWith('/') ? activeRepo.slice(0, -1) : activeRepo;
  return buildMatches(repo);
}

// ponytail: sweep() is synchronous today, so this dedup is insurance for a
// future async sweep, not live concurrency control.
async function ensureSweep(): Promise<void> {
  if (sweepInFlight) {
    await sweepInFlight;
    return;
  }
  sweepInFlight = sweep();
  try {
    await sweepInFlight;
  } finally {
    sweepInFlight = null;
  }
}

async function sweep(): Promise<void> {
  const seen = new Set<string>();
  for (const dirName of listProjectDirs()) {
    sweepProjectDir(dirName, seen);
  }
  for (const filePath of cache.keys()) {
    if (!seen.has(filePath)) cache.delete(filePath);
  }
}

function listProjectDirs(): string[] {
  if (!existsSync(CLAUDE_DIR)) return [];
  return readdirSync(CLAUDE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

function sweepProjectDir(dirName: string, seen: Set<string>): void {
  const dirPath = path.join(CLAUDE_DIR, dirName);
  for (const fileName of listSessionFiles(dirPath)) {
    const filePath = path.join(dirPath, fileName);
    if (sweepSessionFile(filePath)) seen.add(filePath);
  }
}

function listSessionFiles(dirPath: string): string[] {
  return readdirSync(dirPath, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map(entry => entry.name);
}

function sweepSessionFile(filePath: string): boolean {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    // file vanished mid-sweep (live sessions rotate); drop any stale entry
    cache.delete(filePath);
    return false;
  }
  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return true;
  const parsed = parseSessionFile(filePath);
  cache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, ...parsed });
  return true;
}

function parseSessionFile(filePath: string): { cwds: string[]; touchedPaths: string[]; title: string } {
  const content = readFileSync(filePath, 'utf8');
  const cwds = new Set<string>();
  const touchedPaths = new Set<string>();
  const titles = { ai: '', custom: '' };
  for (const line of content.split('\n')) {
    parseLine(line, cwds, touchedPaths, titles);
  }
  // Manual rename beats the generated title; later lines beat earlier ones.
  return { cwds: [...cwds], touchedPaths: [...touchedPaths], title: titles.custom || titles.ai };
}

function parseLine(line: string, cwds: Set<string>, touchedPaths: Set<string>, titles: { ai: string; custom: string }): void {
  if (!line.trim()) return;
  let entry: any;
  try {
    entry = JSON.parse(line);
  } catch {
    return;
  }
  if (typeof entry.cwd === 'string' && entry.cwd.startsWith('/')) cwds.add(entry.cwd);
  if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string') titles.ai = entry.aiTitle;
  if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') titles.custom = entry.customTitle;
  extractToolPaths(entry, touchedPaths);
}

function extractToolPaths(entry: any, touchedPaths: Set<string>): void {
  const blocks = entry?.message?.content;
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    if (block?.type !== 'tool_use') continue;
    extractBlockPaths(block, touchedPaths);
  }
}

function extractBlockPaths(block: any, touchedPaths: Set<string>): void {
  const input = block.input || {};
  if (FILE_TOOLS.has(block.name)) {
    const filePath = input.file_path ?? input.notebook_path;
    if (typeof filePath === 'string') touchedPaths.add(filePath);
  } else if (block.name === 'Bash' && typeof input.command === 'string') {
    extractBashPaths(input.command, touchedPaths);
  }
}

function extractBashPaths(command: string, touchedPaths: Set<string>): void {
  for (const match of command.matchAll(BASH_PATH_RE)) {
    touchedPaths.add(match[1]);
  }
}

function buildMatches(repo: string): SessionMatch[] {
  const matches: SessionMatch[] = [];
  for (const [filePath, entry] of cache) {
    const match = matchEntry(filePath, entry, repo);
    if (match) matches.push(match);
  }
  return matches.sort((left, right) => right.modified - left.modified);
}

function matchEntry(filePath: string, entry: IndexEntry, repo: string): SessionMatch | null {
  const reason = matchReason(entry, repo);
  if (!reason) return null;
  const dirName = path.basename(path.dirname(filePath));
  const sessionId = path.basename(filePath, '.jsonl');
  return { sessionId, dirName, modified: entry.mtimeMs, size: entry.size, matchReason: reason, title: entry.title };
}

function matchReason(entry: IndexEntry, repo: string): 'cwd' | 'files' | null {
  if (entry.cwds.some(cwd => isUnder(cwd, repo))) return 'cwd';
  if (entry.touchedPaths.some(touched => isUnder(touched, repo))) return 'files';
  return null;
}

function isUnder(candidate: string, repo: string): boolean {
  return candidate === repo || candidate.startsWith(repo + '/');
}
