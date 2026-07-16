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
  projectDir: string;
  cwd: string;
  status: 'running' | 'exited';
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
}

export interface CreateAgentOptions {
  title?: string;
  cwd: string;
  provider?: ProviderId;
  projectId?: string;
  threadId?: string;
}

function buildAgentInfo(agentId: string, sessionId: string, options: CreateAgentOptions): AgentInfo {
  return {
    agentId,
    title: options.title || 'agent',
    provider: options.provider || 'claude',
    sessionId,
    projectDir: encodeCwd(options.cwd),
    cwd: options.cwd,
    status: 'running',
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
      return await this.launchAgent(options);
    } finally {
      if (provider === 'codex') this.pendingCodexCwds.delete(options.cwd);
    }
  }

  private async launchAgent(options: CreateAgentOptions): Promise<AgentInfo> {
    const agentId = `agent_${randomUUID()}`;
    const requestedSessionId = randomUUID();
    const launched = this.launcher(options.provider || 'claude', options.cwd, requestedSessionId);
    const info = buildAgentInfo(agentId, requestedSessionId, options);
    const buffer = new AgentBuffer();
    this.agents.set(agentId, { info, ptyProcess: launched.process, buffer });
    this.wire(agentId, launched.process, buffer);
    try {
      info.sessionId = await launched.sessionId;
      this.saveRegistry();
      return info;
    } catch (error) {
      launched.process.kill();
      this.agents.delete(agentId);
      throw error;
    }
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
}
