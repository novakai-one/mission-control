import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

export interface AgentStep {
  id: string;
  agentId: string;
  timestamp: string;
  type: 'thought' | 'action' | 'command' | 'stdout' | 'spawn';
  content: string;
  tokenCount?: number;
  stream?: 'stdout' | 'stderr';
}

export interface BuildRecord {
  id: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'success' | 'failed' | 'stopped';
  steps: AgentStep[];
  gitCommitHash?: string;
  // Debug facts (surfaced by the Debug tab). Populated as the build runs.
  llm?: 'claude' | 'gemini';
  command?: string;
  args?: string[];
  cwd?: string;
  pid?: number;
  cliExists?: boolean;
  sessionId?: string;
  exitCode?: number;
  errorMessage?: string;
  durationMs?: number;
}

export class StateManager {
  private readonly buildDirectory: string;

  constructor(private readonly workspacePath: string) {
    this.buildDirectory = path.join(workspacePath, '.novakai-command', 'builds');
    if (!fs.existsSync(this.buildDirectory)) {
      fs.mkdirSync(this.buildDirectory, { recursive: true });
    }
  }

  private runShellCommand(command: string): Promise<string> {
    return new Promise((resolve) => {
      exec(command, { cwd: this.workspacePath }, (error, stdout) => {
        resolve(error ? '' : stdout.trim());
      });
    });
  }

  public saveBuild(build: BuildRecord): void {
    const filePath = path.join(this.buildDirectory, `${build.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(build, null, 2), 'utf8');
  }

  public loadBuild(id: string): BuildRecord {
    const filePath = path.join(this.buildDirectory, `${id}.json`);
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }

  public listBuilds(): BuildRecord[] {
    if (!fs.existsSync(this.buildDirectory)) return [];
    return fs.readdirSync(this.buildDirectory)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        try {
          const content = fs.readFileSync(path.join(this.buildDirectory, file), 'utf8');
          return JSON.parse(content) as BuildRecord;
        } catch {
          return null as any;
        }
      })
      .filter(Boolean)
      .sort((first, second) => second.startTime.localeCompare(first.startTime));
  }

  public async captureGitDiff(): Promise<string> {
    return this.runShellCommand('git diff HEAD');
  }

  public async createGitCommit(message: string): Promise<string> {
    const isGitRepo = await this.runShellCommand('git rev-parse --is-inside-work-tree');
    if (isGitRepo !== 'true') {
      return '';
    }
    await this.runShellCommand('git add .');
    await this.runShellCommand(`git commit -m "${message.replace(/"/g, '\\"')}"`);
    return this.runShellCommand('git rev-parse HEAD');
  }
}
