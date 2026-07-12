import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn as spawnPty, type IPty } from 'node-pty';
import { ConfigManager } from '../config/index.js';
import { resolveCli } from '../agent/executor/index.js';
import { encodeCwd } from '../transcript/parser.js';
import { AgentBuffer } from './buffer.js';

export interface AgentInfo {
  agentId: string;
  title: string;
  sessionId: string;
  projectDir: string;
  cwd: string;
  status: 'running' | 'exited';
  createdAt: string;
}

type RegistryEntry = AgentInfo & { archived?: boolean };

interface AgentRecord {
  info: AgentInfo;
  ptyProcess?: IPty;
  buffer?: AgentBuffer;
  archived?: boolean;
}

export interface CreateAgentOptions {
  title?: string;
  cwd: string;
}

// Strip inherited Claude/Anthropic env vars (e.g. CLAUDE_CODE_CHILD_SESSION) before
// spawning: left in place, they silently disable transcript persistence when this
// backend itself is running inside a Claude Code session.
function scrubEnv(): NodeJS.ProcessEnv {
  const scrubbed = { ...process.env };
  for (const envKey of Object.keys(scrubbed)) {
    if (/^CLAUDE|^ANTHROPIC/.test(envKey)) delete scrubbed[envKey];
  }
  return scrubbed;
}

function spawnClaude(workspaceDir: string, sessionId: string): IPty {
  const cliPath = ConfigManager.load().claudeCliPath || 'claude';
  const { resolved } = resolveCli(cliPath);
  return spawnPty(resolved, ['--session-id', sessionId], {
    name: 'xterm-256color',
    cols: 120,
    rows: 32,
    cwd: workspaceDir,
    env: scrubEnv()
  });
}

function buildAgentInfo(agentId: string, sessionId: string, options: CreateAgentOptions): AgentInfo {
  return {
    agentId,
    title: options.title || 'agent',
    sessionId,
    projectDir: encodeCwd(options.cwd),
    cwd: options.cwd,
    status: 'running',
    createdAt: new Date().toISOString()
  };
}

export class TerminalManager {
  private readonly agents = new Map<string, AgentRecord>();
  private dataCallback: ((agentId: string, data: string) => void) | null = null;
  private exitCallback: ((agentId: string, exitCode: number | null) => void) | null = null;

  constructor(private readonly registryPath = path.join(process.cwd(), '.novakai-command', 'agents.json')) {
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
    this.agents.set(info.agentId, { info: { ...info, status: 'exited' }, archived });
  }

  private saveRegistry(): void {
    mkdirSync(path.dirname(this.registryPath), { recursive: true });
    const entries: RegistryEntry[] = Array.from(this.agents.values(), (record) => ({
      ...record.info,
      archived: record.archived
    }));
    writeFileSync(this.registryPath, JSON.stringify(entries, null, 2));
  }

  create(options: CreateAgentOptions): AgentInfo {
    const agentId = `agent_${randomUUID()}`;
    const sessionId = randomUUID();
    const proc = spawnClaude(options.cwd, sessionId);
    const info = buildAgentInfo(agentId, sessionId, options);
    const buffer = new AgentBuffer();
    this.agents.set(agentId, { info, ptyProcess: proc, buffer });
    this.wire(agentId, proc, buffer);
    this.saveRegistry();
    return info;
  }

  private wire(agentId: string, proc: IPty, buffer: AgentBuffer): void {
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
