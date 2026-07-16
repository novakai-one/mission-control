import type { ProviderId } from '../project/schema.js';

/** Provider-independent event kinds rendered by Novakai. */
export type CanonicalEventKind =
  | 'user'
  | 'assistant'
  | 'tool'
  | 'approval'
  | 'system';

/** Provider transcript event normalized for shared projections. */
export interface CanonicalEvent {
  id: string;
  provider: ProviderId;
  sessionId: string;
  kind: CanonicalEventKind;
  timestamp: string;
  text: string;
  rawType: string;
}

/** Successful provider transcript load. */
export interface SessionSnapshot {
  provider: ProviderId;
  sessionId: string;
  events: CanonicalEvent[];
}

/** Create a deterministic ordering across provider transcripts. */
export function orderCanonicalEvents(events: CanonicalEvent[]): CanonicalEvent[] {
  return [...events].sort((first, second) => {
    const timestampOrder = first.timestamp.localeCompare(second.timestamp);
    return timestampOrder || first.id.localeCompare(second.id);
  });
}
