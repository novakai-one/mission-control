import type { AgentInfo, CreateAgentOptions } from '../manager.js';

/** Deep terminal seam shared by the in-process and detached-host adapters. */
export interface TerminalRuntime {
  create(options: CreateAgentOptions): Promise<AgentInfo>;
  write(agentId: string, data: string): boolean;
  resize(agentId: string, cols: number, rows: number): boolean;
  rename(agentId: string, title: string): boolean;
  kill(agentId: string): boolean;
  archive(agentId: string): boolean;
  snapshot(agentId: string): string;
  list(): AgentInfo[];
  onData(callback: (agentId: string, data: string) => void): void;
  onExit(callback: (agentId: string, exitCode: number | null) => void): void;
  onSession(callback: (info: AgentInfo) => void): void;
}
