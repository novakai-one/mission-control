import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TerminalManager } from '../../manager.js';
import type { TerminalRuntime } from '../../runtime/index.js';
import { TerminalHostClient } from '../client/index.js';
import { TERMINAL_HOST_PROTOCOL } from '../protocol/index.js';

const CONNECT_ATTEMPTS = 80;
const CONNECT_DELAY_MS = 50;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(target) : [target];
    })
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .sort();
}

function snapshotSource(workspace: string): string {
  const sourceRoot = path.join(workspace, 'src');
  const hash = createHash('sha256');
  for (const file of sourceFiles(sourceRoot)) {
    hash.update(path.relative(sourceRoot, file));
    hash.update(readFileSync(file));
  }
  const snapshotId = hash.digest('hex').slice(0, 16);
  const snapshotRoot = snapshotPath(workspace, snapshotId);
  const snapshotSourceRoot = path.join(snapshotRoot, 'src');
  if (!existsSync(snapshotSourceRoot)) {
    mkdirSync(snapshotRoot, { recursive: true });
    cpSync(sourceRoot, snapshotSourceRoot, { recursive: true, errorOnExist: true });
  }
  return snapshotRoot;
}

function snapshotPath(workspace: string, snapshotId: string): string {
  return path.join(
    workspace,
    '.novakai-command',
    'terminal-host',
    'snapshots',
    snapshotId,
  );
}

function spawnHost(workspace: string, socketPath: string): void {
  const snapshot = snapshotSource(workspace);
  const entry = path.join(snapshot, 'src', 'backend', 'terminal', 'host', 'process.ts');
  const tsxCli = path.join(workspace, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const hostDir = path.dirname(socketPath);
  mkdirSync(hostDir, { recursive: true });
  const logPath = path.join(hostDir, 'host.log');
  appendFileSync(logPath, `\n--- launch ${new Date().toISOString()} snapshot ${path.basename(snapshot)} ---\n`);
  const logFile = openSync(logPath, 'a');
  const child = spawn(process.execPath, [tsxCli, entry, '--workspace', workspace, '--socket', socketPath], {
    cwd: workspace,
    detached: true,
    stdio: ['ignore', logFile, logFile],
  });
  child.unref();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connectEventually(socketPath: string): Promise<TerminalHostClient> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await TerminalHostClient.connect(socketPath);
    } catch (error) {
      lastError = error;
      await delay(CONNECT_DELAY_MS);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('terminal host failed to start');
}

/** Production uses the detached host; scratch-port rigs stay isolated in-process. */
export async function createTerminalRuntime(workspace = process.cwd()): Promise<TerminalRuntime> {
  const scratchPort = process.env.NOVAKAI_SERVER_PORT;
  if (scratchPort) {
    const safePort = scratchPort.replace(/[^0-9A-Za-z_-]/g, '_');
    const registry = path.join(workspace, '.novakai-command', `agents-${safePort}.json`);
    return new TerminalManager(registry);
  }

  const socketPath = path.join(
    workspace,
    '.novakai-command',
    'terminal-host',
    `host-v${TERMINAL_HOST_PROTOCOL}.sock`,
  );
  try {
    return await TerminalHostClient.connect(socketPath);
  } catch {
    spawnHost(workspace, socketPath);
    return connectEventually(socketPath);
  }
}
