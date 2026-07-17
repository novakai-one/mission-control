// Shared presentation model for the workspace views — the neutral module
// the timeline and the event renderers both import (never each other).
// Grouping: consecutive events from one voice (Chris, or one provider
// session) share a single speaker label, so the stream reads as an exchange
// instead of a pile of labelled cards. Classification stays canonical: this
// file only shapes what already exists.
import type { CanonicalEvent } from '../../../../shared/provider/schema.js';
import { agentNames, formatChatTime } from '../../../lib/chatModel/index.js';

export interface TimelineGroup {
  /** First event's id — stable React key for the run. */
  groupKey: string;
  /** Voice identity ("you" or provider:sessionId) — grouping key. */
  voice: string;
  /** "You" or the stable per-thread agent name ("claude-1"). */
  author: string;
  fromYou: boolean;
  /** First event's time; one timestamp per run, not per row. */
  time: string;
  events: CanonicalEvent[];
}

function voiceOf(event: CanonicalEvent): string {
  return event.kind === 'user' ? 'you' : `${event.provider}:${event.sessionId}`;
}

/** Group consecutive same-voice events under one speaker label. */
export function groupTimelineEvents(events: CanonicalEvent[]): TimelineGroup[] {
  const names = agentNames(events);
  const groups: TimelineGroup[] = [];
  for (const event of events) {
    const voice = voiceOf(event);
    const last = groups[groups.length - 1];
    if (last?.voice === voice) {
      last.events.push(event);
      continue;
    }
    const fromYou = event.kind === 'user';
    const author = fromYou ? 'You' : (names.get(voice) ?? event.provider);
    groups.push({ groupKey: event.id, voice, author, fromYou, time: formatChatTime(event.timestamp), events: [event] });
  }
  return groups;
}

/** Tiny mono row label for non-speech events. Calls and results split on
 * the provider raw type: claude says tool_result, codex *_output. */
export function eventKindLabel(event: CanonicalEvent): string {
  if (event.kind !== 'tool') return 'system';
  return event.rawType === 'tool_result' || event.rawType.endsWith('_output') ? 'result' : 'tool';
}

const SUMMARY_MAX = 96;

/** Dense payloads collapse to one line and reveal on click. */
export function isDense(text: string): boolean {
  return text.trim().includes('\n') || text.trim().length > SUMMARY_MAX;
}

/** The one line a collapsed row shows: first line, hard-capped. */
export function summaryLine(text: string): string {
  const first = text.trimStart().split('\n', 1)[0].trimEnd();
  return first.length > SUMMARY_MAX ? `${first.slice(0, SUMMARY_MAX)}…` : first;
}
