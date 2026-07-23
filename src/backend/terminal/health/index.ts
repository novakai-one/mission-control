import type { AgentActivity } from '../manager.js';

export interface HealthThresholds {
  quietMs: number;
  stalledMs: number;
}

/** Ruled thresholds (Manager Kimi Stall + Chief, 2026-07-23, recorded in the
 * mission packet): quiet after 5 min and stalled after 15 min of PTY silence
 * while status is 'running'. Env overrides exist for rig drills only. */
export const RULED_THRESHOLDS: HealthThresholds = { quietMs: 5 * 60_000, stalledMs: 15 * 60_000 };

export type HealthState = 'ok' | 'quiet' | 'stalled';

export interface AgentHealth {
  state: HealthState;
  /** ISO timestamp of the last PTY output; null = none observed since tracking began. */
  lastOutputAt: string | null;
  silentForMs: number;
}

function positiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function thresholdsFromEnv(env: Record<string, string | undefined> = process.env): HealthThresholds {
  return {
    quietMs: positiveInt(env.NVK_STALL_QUIET_MS) ?? RULED_THRESHOLDS.quietMs,
    stalledMs: positiveInt(env.NVK_STALL_STALLED_MS) ?? RULED_THRESHOLDS.stalledMs,
  };
}

/** Pure: health is derived at read time, never stored. Null for non-running
 * agents (an exited agent is not "stalled") and for unknown activity. When no
 * output was ever observed, age falls back to trackedSince — conservative for
 * a backend that reconnected to a host that predates activity reporting. */
export function deriveHealth(
  status: 'running' | 'exited',
  activity: AgentActivity | null,
  nowMs: number,
  thresholds: HealthThresholds,
): AgentHealth | null {
  if (status !== 'running' || !activity) return null;
  const referenceMs = activity.lastOutputAtMs ?? activity.trackedSinceMs;
  const silentForMs = Math.max(0, nowMs - referenceMs);
  const state: HealthState = silentForMs >= thresholds.stalledMs ? 'stalled'
    : silentForMs >= thresholds.quietMs ? 'quiet' : 'ok';
  return {
    state,
    lastOutputAt: activity.lastOutputAtMs === null ? null : new Date(activity.lastOutputAtMs).toISOString(),
    silentForMs,
  };
}
