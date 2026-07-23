import type { AgentActivity, AgentInfo, CreateAgentOptions } from '../manager.js';
import type { SubmitJob } from '../host/protocol/index.js';

/** Deep terminal seam shared by the in-process and detached-host adapters. */
export interface TerminalRuntime {
  create(options: CreateAgentOptions): Promise<AgentInfo>;
  write(agentId: string, data: string): boolean;
  /** Timed provider submission owned by the PTY-owning process (D2). */
  submit(job: SubmitJob): boolean;
  /** PTY-owner activity stamp for stall health; null for unknown agents. */
  activity(agentId: string): AgentActivity | null;
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
