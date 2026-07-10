import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface DirEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
}

export interface DirListing {
  path: string;
  parent: string;
  entries: DirEntry[];
}

export interface GitRootResult {
  gitRoot: string | null;
  candidate: string;
}

export class PathDeniedError extends Error {
  constructor(message = 'Path denied') {
    super(message);
    this.name = 'PathDeniedError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Path not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Resolve a raw (possibly `~`-prefixed) path and confirm it lives at or
 * under the user's home directory. Returns null if the input is invalid
 * or escapes the home directory. Never follows `-` → `/` style decoding —
 * paths are passed through untouched aside from `~` expansion,
 * path.resolve() normalization, and symlink resolution (realpath).
 */
export function clampToHome(rawPath: string): string | null {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return null;
  if (rawPath.includes('..')) return null;

  const home = os.homedir();
  let expanded = rawPath;
  if (rawPath === '~') {
    expanded = home;
  } else if (rawPath.startsWith('~/')) {
    expanded = path.join(home, rawPath.slice(2));
  }

  const resolved = path.resolve(expanded);

  // The boundary check must run against the symlink-resolved path, otherwise
  // a link under $HOME that points outside it escapes the sandbox.
  let real: string;
  try {
    real = fs.realpathSync.native(resolved);
  } catch {
    // Path doesn't exist yet: vet the parent's realpath and re-join the leaf.
    // ponytail: one-level fallback; deeper missing chains are denied.
    try {
      real = path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved));
    } catch {
      return null;
    }
  }

  const homeReal = fs.realpathSync.native(home);
  if (real !== homeReal && !real.startsWith(homeReal + path.sep)) {
    return null;
  }
  return real;
}

/**
 * List the contents of a directory under the home directory.
 */
export function listDir(absPath: string, showHidden: boolean): DirListing {
  const resolved = clampToHome(absPath);
  if (resolved === null) {
    throw new PathDeniedError(`Path denied: ${absPath}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new NotFoundError(`Not a directory: ${resolved}`);
  }

  const dirents = fs.readdirSync(resolved, { withFileTypes: true });

  const entries: DirEntry[] = dirents
    .filter((dirent) => {
      if (showHidden) return true;
      if (dirent.name === '.claude') return true;
      if (dirent.name.startsWith('.')) return false;
      if (dirent.name === 'node_modules') return false;
      return true;
    })
    .map((dirent) => ({
      name: dirent.name,
      path: path.join(resolved, dirent.name),
      type: (dirent.isDirectory() ? 'dir' : 'file') as 'dir' | 'file',
    }))
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

  return {
    path: resolved,
    parent: path.dirname(resolved),
    entries,
  };
}

/**
 * Walk up from a path to find the nearest enclosing git root, without
 * shelling out to git. Stops the search at the user's home directory.
 */
export function resolveGitRoot(absPath: string): GitRootResult {
  const resolved = clampToHome(absPath);
  if (resolved === null) {
    throw new PathDeniedError(`Path denied: ${absPath}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new NotFoundError(`Path not found: ${resolved}`);
  }

  const candidate = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  const home = os.homedir();

  let current = candidate;
  let gitRoot: string | null = null;

  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      gitRoot = current;
      break;
    }
    if (current === home) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return { gitRoot, candidate };
}
