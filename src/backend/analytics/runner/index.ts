import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AnalyticsRunEvent } from '../../../shared/analytics/types.js';
import { analyticsOutDir, analyticsRepoDir } from '../store/index.js';

/** How an analysis run is launched: command + args, run with cwd = the
 * Novakai-Analytics checkout. Injectable so tests can substitute a stub. */
export type AnalyzeCommand = (repoPath: string, outDir: string) => { command: string; args: string[] };

/** `npm run analyze -- <repo>` minus the npm wrapper: the analyzer script
 * itself, told to write into Command's persistence dir. */
function defaultCommand(repoPath: string, outDir: string): { command: string; args: string[] } {
  return { command: 'npx', args: ['tsx', 'src/cli.ts', repoPath, '--out', outDir] };
}

const RUN_TIMEOUT_MS = 10 * 60 * 1000;

/** Spawns the sibling analyzer as an async job — one in-flight run per repo.
 * Emits a run event on start, completion, and failure; never re-implements
 * any analysis. */
export class AnalyticsRunner {
  private readonly running = new Map<string, AnalyticsRunEvent>();

  constructor(
    private readonly emit: (event: AnalyticsRunEvent) => void,
    private readonly repoDir = analyticsRepoDir(),
    private readonly command: AnalyzeCommand = defaultCommand,
    private readonly outDirFor: (repoPath: string) => string = analyticsOutDir,
  ) {}

  isRunning(repoPath: string): boolean {
    return this.running.has(resolve(repoPath));
  }

  /** Starts a run; returns null when one is already in flight for the repo. */
  start(repoPath: string): AnalyticsRunEvent | null {
    const repoKey = resolve(repoPath);
    if (this.running.has(repoKey)) return null;
    const event: AnalyticsRunEvent = { repoPath: repoKey, status: 'running', startedAt: new Date().toISOString() };
    this.running.set(repoKey, event);
    this.spawnAnalyze(repoKey, event.startedAt);
    this.emit(event);
    return event;
  }

  private spawnAnalyze(repoKey: string, startedAt: string): void {
    const outDir = this.outDirFor(repoKey);
    mkdirSync(outDir, { recursive: true });
    const { command, args } = this.command(repoKey, outDir);
    const child = spawn(command, args, { cwd: this.repoDir, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString()}`.slice(-2000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), RUN_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      this.finish(repoKey, startedAt, 1, error.message);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      this.finish(repoKey, startedAt, code ?? 1, stderrTail.trim());
    });
  }

  private finish(repoKey: string, startedAt: string, code: number, errorText: string): void {
    if (!this.running.has(repoKey)) return; // 'error' already finished this run
    this.running.delete(repoKey);
    const failed = code !== 0;
    this.emit({
      repoPath: repoKey,
      status: failed ? 'failed' : 'completed',
      startedAt,
      finishedAt: new Date().toISOString(),
      ...(failed ? { error: errorText || `analyzer exited with code ${code}` } : {}),
    });
  }
}
