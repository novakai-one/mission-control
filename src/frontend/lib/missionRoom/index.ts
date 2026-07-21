// Mission Room V1 — thin read-only adapter over GET /api/missions/:id/snapshot.
// One named target, one pinned conversation id, one polling hook. No writes.
import { useEffect, useState } from 'react';
import type {
  MissionSnapshot,
  MissionSnapshotError,
  MissionSnapshotResponse,
} from '../../../shared/missionView/schema.js';

/** The single mission the V1 room renders (Contract: one room, one slice). */
export const MISSION_ROOM_V1_TARGET = 'mission_store-validator';

/** Conversation id of the pinned Mission Room entry in the Mission Control rail. */
export const MISSION_ROOM_CONVERSATION_ID = 'mission-room-store-validator';

/**
 * Snapshot polling cadence in ms. 5s is a deliberate new cadence for this
 * read-heavy snapshot (plan Delta v2, L1) — the existing project/projection
 * precedent is 1s, but the snapshot re-reads several stores per request and
 * the room is a glance surface, not a live tail.
 */
export const MISSION_ROOM_POLL_MS = 5_000;

async function fetchSnapshot(missionId: string): Promise<MissionSnapshot> {
  const response = await fetch(`/api/missions/${missionId}/snapshot`);
  const body = await response.json().catch(() => null) as
    MissionSnapshotResponse | MissionSnapshotError | null;
  if (!response.ok) {
    throw new Error((body as MissionSnapshotError | null)?.error ?? `HTTP ${response.status}`);
  }
  return (body as MissionSnapshotResponse).snapshot;
}

export interface MissionSnapshotState {
  snapshot: MissionSnapshot | null;
  error: string | null;
}

function startSnapshotPolling(
  missionId: string,
  onSnapshot: (snapshot: MissionSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  const load = () => fetchSnapshot(missionId)
    .then((result) => { if (active) onSnapshot(result); })
    .catch((failure: unknown) => { if (active) onError(failure); });
  void load();
  const interval = setInterval(load, MISSION_ROOM_POLL_MS);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

/**
 * Polls the snapshot endpoint while `missionId` is non-null (null pauses
 * polling — the hook only runs while the pinned room is selected). A failed
 * fetch sets `error`; the next successful fetch clears it, so a stopped
 * backend shows a visible break and recovery is automatic (plan Delta v2, M7).
 * The interval is cleared on unmount.
 */
export function useMissionSnapshot(missionId: string | null): MissionSnapshotState {
  const [snapshot, setSnapshot] = useState<MissionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!missionId) return;
    return startSnapshotPolling(
      missionId,
      (result) => { setSnapshot(result); setError(null); },
      (failure) => setError(failure instanceof Error ? failure.message : String(failure)),
    );
  }, [missionId]);
  return { snapshot, error };
}
