import { watch, type FSWatcher } from 'node:fs';
import type { CanvasStore } from '../store/index.js';

/** Notifies when someone ELSE (the canvas CLI, an editor) writes the data
 * files. Store writes mark themselves so hub PUTs do not echo back into the
 * clients that made them — same contract as Canvas's json-file-bridge. */
export function watchCanvasData(
  store: CanvasStore,
  onExternalChange: (fileName: string) => void,
): FSWatcher {
  let pending: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(store.directory(), (_event, fileName) => {
    if (!fileName || !fileName.endsWith('.json') || fileName.startsWith('.')) return;
    if (store.msSinceLastWrite() < 500) return;
    clearTimeout(pending);
    pending = setTimeout(() => onExternalChange(fileName), 200);
  });
  watcher.on('error', () => watcher.close());
  return watcher;
}
