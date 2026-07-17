import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ProviderId } from '../../shared/project/schema.js';
import { encodeCwd } from '../transcript/parser.js';
import { AgentBuffer } from './buffer.js';
import {
  launchProvider,
  type ProviderLauncher,
  type ProviderTerminalProcess,
} from './provider/index.js';

export interface AgentInfo {
  agentId: string;
  title: string;
  provider: ProviderId;
  sessionId: string;
  sessionError?: string;
  projectDir: string;
  cwd: string;
  status: 'running' | 'exited';
  terminalPid?: number;
  createdAt: string;
  projectId?: string;
  threadId?: string;
}

type RegistryEntry = AgentInfo & { archived?: boolean };

interface AgentRecord {
  info: AgentInfo;
  ptyProcess?: ProviderTerminalProcess;
  buffer?: AgentBuffer;
  archived?: boolean;
  cancelSessionWait?: (reason?: string) => void;
}

export interface CreateAgentOptions {
  title?: string;
  cwd: string;
  provider?: ProviderId;
  projectId?: string;
  threadId?: string;
}

function buildAgentInfo(
  agentId: string,
  sessionId: string,
  options: CreateAgentOptions,
  terminalPid?: number,
): AgentInfo {
  return {
    agentId,
    title: options.title || 'agent',
    provider: options.provider || 'claude',
    sessionId,
    projectDir: encodeCwd(options.cwd),
    cwd: options.cwd,
    status: 'running',
    ...(terminalPid === undefined ? {} : { terminalPid }),
    createdAt: new Date().toISOString(),
    ...(options.projectId ? { projectId: options.projectId } : {}),
    ...(options.threadId ? { threadId: options.threadId } : {})
  };
}

export class TerminalManager {
  private readonly agents = new Map<string, AgentRecord>();
  private readonly pendingCodexCwds = new Set<string>();
  private dataCallback: ((agentId: string, data: string) => void) | null = null;
  private exitCallback: ((agentId: string, exitCode: number | null) => void) | null = null;
  private sessionCallback: ((info: AgentInfo) => void) | null = null;

  constructor(
    private readonly registryPath = path.join(process.cwd(), '.novakai-command', 'agents.json'),
    private readonly launcher: ProviderLauncher = launchProvider,
  ) {
    this.loadRegistry();
  }

  private loadRegistry(): void {
    if (!existsSync(this.registryPath)) return;
    try {
      const contents = readFileSync(this.registryPath, 'utf8');
      const entries = JSON.parse(contents) as RegistryEntry[];
      for (const entry of entries) this.restoreEntry(entry);
    } catch {
      // corrupt file: start empty rather than crash
    }
  }

  private restoreEntry(entry: RegistryEntry): void {
    const { archived, ...info } = entry;
    this.agents.set(info.agentId, {
      info: { ...info, provider: info.provider || 'claude', status: 'exited' },
      archived,
    });
  }

  private saveRegistry(): void {
    mkdirSync(path.dirname(this.registryPath), { recursive: true });
    const entries: RegistryEntry[] = Array.from(this.agents.values(), (record) => ({
      ...record.info,
      archived: record.archived
    }));
    writeFileSync(this.registryPath, JSON.stringify(entries, null, 2));
  }

  async create(options: CreateAgentOptions): Promise<AgentInfo> {
    const provider = options.provider || 'claude';
    if (provider === 'codex' && this.pendingCodexCwds.has(options.cwd)) {
      throw new Error(`A Codex session is already starting for ${options.cwd}`);
    }
    if (provider === 'codex') this.pendingCodexCwds.add(options.cwd);
    try {
      return this.launchAgent(options);
    } catch (error) {
      if (provider === 'codex') this.pendingCodexCwds.delete(options.cwd);
      throw error;
    }
  }

  private launchAgent(options: CreateAgentOptions): AgentInfo {
    const agentId = `agent_${randomUUID()}`;
    const requestedSessionId = randomUUID();
    const launched = this.launcher(options.provider || 'claude', options.cwd, requestedSessionId);
    const provider = options.provider || 'claude';
    const info = buildAgentInfo(
      agentId,
      provider === 'claude' ? requestedSessionId : '',
      options,
      launched.process.pid,
    );
    const buffer = new AgentBuffer();
    this.agents.set(agentId, {
      info, ptyProcess: launched.process, buffer, cancelSessionWait: launched.cancelSessionWait,
    });
    this.wire(agentId, launched.process, buffer);
    this.saveRegistry();
    this.watchSessionIdentity(launched.sessionId, info, provider, options.cwd);
    return info;
  }

  private watchSessionIdentity(
    sessionId: Promise<string>, info: AgentInfo, provider: ProviderId, cwd: string,
  ): void {
    void sessionId.then((resolved) => {
      info.sessionId = resolved;
      delete info.sessionError;
      if (provider === 'codex') this.pendingCodexCwds.delete(cwd);
      this.saveRegistry();
      this.sessionCallback?.(info);
    }).catch((error) => {
      info.sessionError = error instanceof Error ? error.message : String(error);
      if (provider === 'codex') this.pendingCodexCwds.delete(cwd);
      this.saveRegistry();
      this.sessionCallback?.(info);
    });
  }

  private wire(agentId: string, proc: ProviderTerminalProcess, buffer: AgentBuffer): void {
    proc.onData((data) => {
      buffer.push(data);
      this.dataCallback?.(agentId, data);
    });
    proc.onExit(({ exitCode }) => {
      const record = this.agents.get(agentId);
      if (!record) return;
      record.info.status = 'exited';
      record.cancelSessionWait?.(
        `${record.info.provider} exited (code ${exitCode}) before its session was discovered`,
      );
      this.saveRegistry();
      this.exitCallback?.(agentId, exitCode);
    });
  }

  write(agentId: string, data: string): boolean {
    const record = this.agents.get(agentId);
    if (!record?.ptyProcess) return false;
    record.ptyProcess.write(data);
    return true;
  }

  resize(agentId: string, cols: number, rows: number): boolean {
    const record = this.agents.get(agentId);
    if (!record?.ptyProcess) return false;
    record.ptyProcess.resize(cols, rows);
    return true;
  }

  rename(agentId: string, title: string): boolean {
    const record = this.agents.get(agentId);
    if (!record) return false;
    record.info.title = title;
    this.saveRegistry();
    return true;
  }

  kill(agentId: string): boolean {
    const record = this.agents.get(agentId);
    if (!record) return false;
    if (record.info.status !== 'running' || !record.ptyProcess) return true;
    record.ptyProcess.kill();
    return true;
  }

  archive(agentId: string): boolean {
    const record = this.agents.get(agentId);
    if (!record) return false;
    if (record.ptyProcess) record.ptyProcess.kill();
    record.archived = true;
    this.saveRegistry();
    return true;
  }

  snapshot(agentId: string): string {
    return this.agents.get(agentId)?.buffer?.snapshot() ?? '';
  }

  list(): AgentInfo[] {
    return Array.from(this.agents.values())
      .filter((record) => !record.archived)
      .map((record) => record.info);
  }

  onData(callback: (agentId: string, data: string) => void): void {
    this.dataCallback = callback;
  }

  onExit(callback: (agentId: string, exitCode: number | null) => void): void {
    this.exitCallback = callback;
  }

  onSession(callback: (info: AgentInfo) => void): void {
    this.sessionCallback = callback;
  }
}
