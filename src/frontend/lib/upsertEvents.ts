export interface Keyed { eventKey?: string; uuid?: string }

/**
 * Canonical event identity, shared by live upserts, React keys, and selection
 * state — one rule so they can never diverge. eventKey is unique per
 * line#block and stable across watcher re-emits; uuid is the fallback for
 * rows that predate stamping.
 */
export function selKey(event: Keyed): string {
  return event.eventKey || event.uuid || '';
}

export function upsertEvent<T extends Keyed>(list: T[], event: T): T[] {
  const eventKey = selKey(event);
  const index = list.findIndex(existing => selKey(existing) === eventKey);
  if (index === -1) return [...list, event];
  const next = list.slice();
  next[index] = event;          // replace in place, preserve order
  return next;
}

/** Merge an event batch in O(existing + incoming), preserving row order. */
export function mergeEvents<T extends Keyed>(existing: T[], incoming: T[]): T[] {
  const merged = existing.slice();
  const indexes = new Map(merged.map((event, index) => [selKey(event), index]));
  for (const event of incoming) {
    const eventKey = selKey(event);
    const index = indexes.get(eventKey);
    if (index === undefined) {
      indexes.set(eventKey, merged.length);
      merged.push(event);
    } else {
      merged[index] = event;
    }
  }
  return merged;
}
