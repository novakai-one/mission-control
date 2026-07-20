import type { AgentInfo, CreateAgentOptions } from '../../manager.js';

export const TERMINAL_HOST_PROTOCOL = 1;

export interface AgentSnapshot {
  info: AgentInfo;
  data: string;
  cursor: number;
}

export type HostCommand =
  | { type: 'create'; requestId: string; options: CreateAgentOptions }
  | { type: 'write'; agentId: string; data: string }
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
