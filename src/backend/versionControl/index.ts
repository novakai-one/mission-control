import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveGitRoot } from '../fs/explorer.js';

const execFileAsync = promisify(execFile);

/**
 * Version-control surface. Every git invocation for repo metadata lives in
 * this module; nothing outside it shells out to git. This is the deliberate
 * seed of a future, properly designed VersionControl class — for now it
 * exposes exactly `getRepoInfo` plus the `RepoInfo` type.
 */
export interface RepoInfo {
  name: string;
  path: string;
  gitRoot: string | null;
  isGitRepo: boolean;
  branch: string | null;
  dirty: boolean | null;
  lastCommit: string | null;
  trackedFiles: number | null;
  language: { name: string; pct: number } | null;
  description: string | null;
}

// Dominant-extension → display language. Keys are quoted so short extensions
// are string literals (not identifiers subject to the id-length gate).
const EXTENSION_LANGUAGE: Record<string, string> = {
  'ts': 'TypeScript', 'tsx': 'TypeScript',
  'js': 'JavaScript', 'jsx': 'JavaScript', 'mjs': 'JavaScript', 'cjs': 'JavaScript',
  'py': 'Python', 'rb': 'Ruby', 'go': 'Go', 'rs': 'Rust',
  'java': 'Java', 'kt': 'Kotlin', 'swift': 'Swift',
  'c': 'C', 'h': 'C', 'cpp': 'C++', 'cc': 'C++', 'hpp': 'C++',
  'cs': 'C#', 'php': 'PHP', 'css': 'CSS', 'scss': 'CSS',
  'html': 'HTML', 'md': 'Markdown', 'json': 'JSON', 'yml': 'YAML', 'yaml': 'YAML',
  'sh': 'Shell', 'sql': 'SQL',
};

/** Pick the dominant language across tracked files, as a percentage of ALL
 * tracked files (spec: by tracked-file count). Returns null when no tracked
 * file maps to a known language. Pure — unit-tested. */
export function languageFromFiles(files: string[]): { name: string; pct: number } | null {
  if (files.length === 0) return null;
  const counts = new Map<string, number>();
  for (const file of files) {
    const extension = path.extname(file).slice(1).toLowerCase();
    const language = EXTENSION_LANGUAGE[extension];
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  let topName: string | null = null;
  let topCount = 0;
  for (const [name, count] of counts) {
    if (count > topCount) {
      topName = name;
      topCount = count;
    }
  }
  if (topName === null) return null;
  return { name: topName, ['pct']: Math.round((topCount / files.length) * 100) };
}

/** Any porcelain output at all ⇒ working tree dirty. Pure — unit-tested. */
export function isDirtyPorcelain(porcelain: string): boolean {
  return porcelain.trim().length > 0;
}

/** package.json "description" only (no README fallback, per spec). */
function readDescription(dirPath: string): string | null {
  try {
    const text = readFileSync(path.join(dirPath, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { description?: unknown };
    return typeof parsed.description === 'string' ? parsed.description : null;
  } catch {
    return null;
  }
}

/** Run a git command, returning stdout or null on any failure/timeout.
 * This is the ONLY place the module shells out. */
async function gitText(gitRoot: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: gitRoot, timeout: 3000 });
    return stdout;
  } catch {
    return null;
  }
}

function nonEmpty(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Populate every git field on `info` independently; one field failing never
 * affects another, and the whole thing degrades gracefully (empty repo, no
 * HEAD, timeout) rather than throwing. */
async function fillGitFields(info: RepoInfo, gitRoot: string): Promise<void> {
  info.branch = nonEmpty(await gitText(gitRoot, ['rev-parse', '--abbrev-ref', 'HEAD']));
  const status = await gitText(gitRoot, ['status', '--porcelain']);
  info.dirty = status === null ? null : isDirtyPorcelain(status);
  info.lastCommit = nonEmpty(await gitText(gitRoot, ['log', '-1', '--format=%s']));
  const listed = await gitText(gitRoot, ['ls-files']);
  if (listed !== null) {
    const files = listed.split('\n').filter((line) => line.length > 0);
    info.trackedFiles = files.length;
    info.language = languageFromFiles(files);
  }
}

/**
 * Narrow module surface: resolve git metadata for an (already sandbox-clamped)
 * path. Uses the fast filesystem `resolveGitRoot` pre-check so we NEVER shell
 * out for non-git directories. Always resolves — never rejects — for a valid
 * in-sandbox dir.
 */
export async function getRepoInfo(targetPath: string): Promise<RepoInfo> {
  const { gitRoot } = resolveGitRoot(targetPath);
  const base = gitRoot ?? targetPath;
  const info: RepoInfo = {
    name: path.basename(base),
    path: targetPath,
    gitRoot,
    isGitRepo: gitRoot !== null,
    branch: null,
    dirty: null,
    lastCommit: null,
    trackedFiles: null,
    language: null,
    description: readDescription(base),
  };
  if (gitRoot !== null) await fillGitFields(info, gitRoot);
  return info;
}
