import type { AgentActivity, AgentInfo, CreateAgentOptions } from '../../manager.js';

export const TERMINAL_HOST_PROTOCOL = 1;

export interface AgentSnapshot {
  info: AgentInfo;
  data: string;
  cursor: number;
  /** PTY-owner activity stamp; absent on hosts that predate stall detection.
   * Optional-additive on purpose — protocol stays v1: an old host omitting it
   * makes the client fall back to a conservative connect-time clock, an old
   * client ignores it. */
  activity?: AgentActivity;
}

/** One timed provider submission (type → settle → \r → optional flush \r),
 * owned by the PTY-hosting process so a backend restart cannot orphan its
 * timers (mission_mission-object-model D2, ruling S6). Keyed by messageId:
 * a re-sent job with a seen id is a no-op, which is what makes the restart
 * reconciliation's retry idempotent. */
export interface SubmitJob {
  agentId: string;
  messageId: string;
  text: string;
  settleMs: number;
  flushMs?: number;
  /** Optional pre-text sequence (an interrupt's Esc) — serialized INSIDE the
   * lane so it can never clear a prior job's mid-settle input (C2). */
  leadIn?: { data: string; settleMs: number };
}

export type HostCommand =
  | { type: 'create'; requestId: string; options: CreateAgentOptions }
  | { type: 'write'; agentId: string; data: string }
  | { type: 'submit'; job: SubmitJob }
  | { type: 'resize'; agentId: string; cols: number; rows: number }
  | { type: 'rename'; agentId: string; title: string }
  | { type: 'kill'; agentId: string }
  | { type: 'archive'; agentId: string };

export type HostFrame =
  | { type: 'ready'; protocol: number; hostPid: number; agents: AgentSnapshot[]; snapshotId?: string }
  | { type: 'created'; requestId: string; info?: AgentInfo; error?: string }
  | { type: 'data'; agentId: string; data: string; cursor: number }
  | { type: 'exit'; agentId: string; exitCode: number | null }
  | { type: 'session'; info: AgentInfo }
  | { type: 'agents'; agents: AgentInfo[] };

export function encodeFrame(frame: HostFrame | HostCommand): string {
  return `${JSON.stringify(frame)}\n`;
}
