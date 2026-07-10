export interface Keyed { eventKey?: string; uuid?: string }

export function upsertEvent<T extends Keyed>(list: T[], event: T): T[] {
  const eventKey = event.eventKey ?? event.uuid;
  const index = list.findIndex(existing => (existing.eventKey ?? existing.uuid) === eventKey);
  if (index === -1) return [...list, event];
  const next = list.slice();
  next[index] = event;          // replace in place, preserve order
  return next;
}
