// Durable people projection (mission_mission-control-ux, rulings S3 + M2).
// The fourth live projection beside feed/rooms/roster: one fetch of
// GET /api/people on mount, a re-pull on every ws 'connected' transition
// (C5 pattern — frames dropped in an outage come back through the read
// interface), and failed reads keep the LAST GOOD list under an honest
// `stale` flag instead of wiping the panel. Identity is durable agentId
// everywhere; dm:<name> conversation ids remain transport only (v2.1).
import { useEffect, useState } from 'react';
import type { PeopleResponse, PersonView } from '../../../shared/people/schema.js';
import { connect } from '../agentSocket/index.js';
import { refetchOnReconnect } from './index.js';

export interface PeopleSnapshot {
  people: PersonView[];
  /** True once the first fetch settled (success OR failure). */
  loaded: boolean;
  /** True while the newest read failed — the list shown is the last good one. */
  stale: boolean;
}

export function emptyPeopleSnapshot(): PeopleSnapshot {
  return { people: [], loaded: false, stale: false };
}

type ApplyPeople = (update: (current: PeopleSnapshot) => PeopleSnapshot) => void;

function loadPeople(apply: ApplyPeople): void {
  fetch('/api/people')
    .then((response) => response.json())
    .then((data: PeopleResponse) => apply(() => ({ people: data.people ?? [], loaded: true, stale: false })))
    .catch(() => apply((current) => ({ ...current, loaded: true, stale: true })));
}

/** Exported seam (mirrors mountFeed/watchRooms): the hook is its only app
 * caller; tests drive it directly. Returns the unmount. */
export function mountPeople(apply: ApplyPeople): () => void {
  let live = true;
  const guarded: ApplyPeople = (update) => {
    if (live) apply(update);
  };
  connect();
  loadPeople(guarded);
  const offReload = refetchOnReconnect(() => loadPeople(guarded));
  return () => {
    live = false;
    offReload();
  };
}

export function usePeople(): PeopleSnapshot {
  const [snapshot, setSnapshot] = useState<PeopleSnapshot>(emptyPeopleSnapshot);
  useEffect(() => mountPeople((update) => setSnapshot(update)), []);
  return snapshot;
}
