// App-wide display timezone. The applied zone changes ONLY via setTimeZone
// (picker select) — typing in the picker is local state, so no re-formats
// while typing. DashboardShell subscribes via useTimeZone so one select
// triggers one tree repaint.

import { useSyncExternalStore } from 'react';

export interface ZoneEntry {
  id: string;      // IANA id, e.g. 'Australia/Melbourne'
  name: string;    // 'Melbourne, Australia'
  offset: string;  // 'UTC+10:00'
  label: string;   // 'Melbourne, Australia (UTC+10:00)'
  search: string;  // lowercase haystack for token matching
}

const STORAGE_KEY = 'mc-timezone';
const DEFAULT_ZONE = 'Australia/Melbourne';
export const TIMEZONE_CHANGED_EVENT = 'mc-timezone-changed';

const VALID_ZONES = new Set(Intl.supportedValuesOf('timeZone'));

// ponytail: offset computed once per session, not re-checked across DST flips
function zoneOffset(id: string): string {
  const shortOffset = new Intl.DateTimeFormat('en', { timeZone: id, timeZoneName: 'shortOffset' })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = shortOffset.match(/([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 'UTC+00:00';
  const [, sign, hours, minutes] = match;
  return `UTC${sign}${hours.padStart(2, '0')}:${minutes ?? '00'}`;
}

function toEntry(id: string): ZoneEntry {
  const parts = id.split('/');
  const city = (parts[parts.length - 1] ?? id).replace(/_/g, ' ');
  const region = parts.length > 1 ? parts[0].replace(/_/g, ' ') : '';
  const name = region ? `${city}, ${region}` : city;
  const offset = zoneOffset(id);
  // 'utc+10:00' also matches queries like 'utc 10' via token matching below.
  return { id, name, offset, label: `${name} (${offset})`, search: `${name} ${offset}`.toLowerCase() };
}

let zones: ZoneEntry[] | null = null;

export function allZones(): ZoneEntry[] {
  zones ??= [...VALID_ZONES].map(toEntry);
  return zones;
}

/** Every whitespace-separated token must appear somewhere in the entry ('utc 10', 'melbourne', 'australia'). */
export function searchZones(query: string): ZoneEntry[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return allZones().filter((zone) => tokens.every((token) => zone.search.includes(token)));
}

export function currentTimeZone(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && VALID_ZONES.has(stored) ? stored : DEFAULT_ZONE;
}

export function zoneLabel(id: string): string {
  return allZones().find((zone) => zone.id === id)?.label ?? id;
}

export function setTimeZone(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new Event(TIMEZONE_CHANGED_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(TIMEZONE_CHANGED_EVENT, callback);
  return () => window.removeEventListener(TIMEZONE_CHANGED_EVENT, callback);
}

export function useTimeZone(): string {
  return useSyncExternalStore(subscribe, currentTimeZone);
}
