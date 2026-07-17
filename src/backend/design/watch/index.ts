import { watch, type FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';

/** Watches the design roots for prototype.json swaps — html-builder commits
 * marker-last and atomically, so the swap IS the commit signal. Debounced per
 * project; source-file writes that precede the swap are ignored (rendering
 * them would show a revision the marker doesn't reference yet). */
function debouncedCommit(onCommit: (projectId: string) => void): (projectId: string) => void {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  return (projectId) => {
    clearTimeout(pending.get(projectId));
    pending.set(projectId, setTimeout(() => {
      pending.delete(projectId);
      onCommit(projectId);
    }, 200));
  };
}

export function watchDesignData(
  roots: string[],
  onCommit: (projectId: string) => void,
): FSWatcher[] {
  const fire = debouncedCommit(onCommit);
  return roots.map((root) => {
    const watcher = watch(root, { recursive: true }, (_event, fileName) => {
      if (!fileName || basename(fileName) !== 'prototype.json') return;
      const relative = dirname(fileName);
      fire(basename(root) === 'workspace' && relative === '.' ? 'workspace' : relative.split('/')[0]);
    });
    watcher.on('error', () => watcher.close());
    return watcher;
  });
}
