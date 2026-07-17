// Highlight store — the single "which workspace object is lit" slot the
// chat's mention chips write and the rail/work-head read. Hovering a chip
// glows its object (transient); clicking pins it until clicked again or
// another pin replaces it. One object at a time, ever: the UI points, it
// never accumulates decoration.
import { useSyncExternalStore } from 'react';

interface HighlightState {
  objectId: string | null;
  pinned: boolean;
}

let current: HighlightState = { objectId: null, pinned: false };
const listeners = new Set<() => void>();

function commit(next: HighlightState): void {
  current = next;
  for (const listener of listeners) listener();
}

export function subscribeHighlight(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getHighlightedObject(): string | null {
  return current.objectId;
}

/** Hover in/out. Transient — and never steals the slot from a pinned object. */
export function glowObject(objectId: string | null): void {
  if (current.pinned || current.objectId === objectId) return;
  commit({ objectId, pinned: false });
}

/** Click: pin the object; clicking the same pinned object releases it. */
export function pinObject(objectId: string): void {
  if (current.pinned && current.objectId === objectId) return commit({ objectId: null, pinned: false });
  commit({ objectId, pinned: true });
}

/** The lit object id, live — rail rows and work-head chips compare against it. */
export function useHighlightedObject(): string | null {
  return useSyncExternalStore(subscribeHighlight, getHighlightedObject);
}

/** Test seam. */
export function resetHighlightForTest(): void {
  commit({ objectId: null, pinned: false });
}
