import { createHash } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
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

function spawnHost(workspace: string, socketPath: string, registryPath: string): void {
  const snapshot = snapshotSource(workspace);
  const entry = path.join(snapshot, 'src', 'backend', 'terminal', 'host', 'process.ts');
  const tsxCli = path.join(workspace, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  mkdirSync(path.dirname(socketPath), { recursive: true });
  const logFile = openHostLog(workspace, snapshot);
  const child = spawn(process.execPath, [
    tsxCli,
    entry,
    '--workspace', workspace,
    '--socket', socketPath,
    '--registry', registryPath,
    '--snapshot', path.basename(snapshot),
  ], {
    cwd: workspace,
    detached: true,
    stdio: ['ignore', logFile, logFile],
  });
  closeSync(logFile); child.unref();
}

/**
 * What to do about a connected host built from a different src/ snapshot.
 * A host with no snapshotId predates the handshake — always treated as stale.
 * 'restart' is only ever chosen with zero running agents: a stale host keeps
 * its live PTYs, and killing those would be worse than stale code.
 */
export function staleHostAction(
  hostSnapshotId: string | null,
  currentSnapshotId: string,
  runningAgents: number,
): 'ok' | 'restart' | 'warn' {
  if (hostSnapshotId === currentSnapshotId) return 'ok';
  return runningAgents === 0 ? 'restart' : 'warn';
}

/** Poll until the pid is gone (SIGTERM drain) so the socket frees before respawn. */
async function waitForPidExit(processId: number, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      process.kill(processId, 0);
    } catch {
      return true;
    }
    await delay(100);
  }
  return false;
}

function openHostLog(workspace: string, snapshot: string): number {
  const hostDir = path.join(workspace, '.novakai-command', 'terminal-host');
  mkdirSync(hostDir, { recursive: true });
  const logPath = path.join(hostDir, 'host.log');
  appendFileSync(logPath, `\n--- launch ${new Date().toISOString()} snapshot ${path.basename(snapshot)} ---\n`);
  return openSync(logPath, 'a');
}

export function terminalSocketPath(workspace: string, safePort?: string): string {
  if (process.env.NOVAKAI_HOST_SOCKET) return process.env.NOVAKAI_HOST_SOCKET;
  const workspaceId = createHash('sha256').update(workspace).digest('hex').slice(0, 10);
  const userId = process.getuid?.() ?? 'user';
  const portSuffix = safePort ? `-${safePort}` : '';
  return path.join(
    tmpdir(),
    `novakai-${userId}-${workspaceId}-v${TERMINAL_HOST_PROTOCOL}${portSuffix}.sock`,
  );
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

/** Production uses the detached host; scratch-port rigs stay isolated in-process.
 * After connecting, the host must run the CURRENT src/ snapshot — a stale host
 * silently applies old provider-launch behavior. Stale + empty fleet: terminate
 * and respawn fresh. Stale + live agents: warn loudly and keep it (its PTYs
 * matter more than its code). */
export async function createTerminalRuntime(workspace = process.cwd()): Promise<TerminalRuntime> {
  const scratchPort = process.env.NOVAKAI_SERVER_PORT;
  const safePort = scratchPort?.replace(/[^0-9A-Za-z_-]/g, '_');
  const stateDir = path.join(workspace, '.novakai-command');
  const registryPath = path.join(stateDir, safePort ? `agents-${safePort}.json` : 'agents.json');
  if (safePort && process.env.NOVAKAI_TERMINAL_RUNTIME !== 'host') {
    return new TerminalManager(registryPath);
  }
  const socketPath = terminalSocketPath(workspace, safePort);
  let client: TerminalHostClient;
  try {
    client = await TerminalHostClient.connect(socketPath);
  } catch {
    spawnHost(workspace, socketPath, registryPath);
    return connectEventually(socketPath);
  }
  return reconcileHost(client, workspace, socketPath, registryPath);
}

async function reconcileHost(
  client: TerminalHostClient,
  workspace: string,
  socketPath: string,
  registryPath: string,
): Promise<TerminalRuntime> {
  const currentSnapshotId = path.basename(snapshotSource(workspace));
  const running = client.list().filter((agent) => agent.status === 'running').length;
  const action = staleHostAction(client.hostSnapshotId(), currentSnapshotId, running);
  if (action === 'ok') return client;
  if (action === 'warn') {
    console.error(
      `[terminal-host] STALE: host runs snapshot ${client.hostSnapshotId() ?? '(pre-handshake)'}, `
      + `current src is ${currentSnapshotId}; ${running} agent(s) running — kept alive. `
      + 'Provider-launch code changes will NOT apply until the fleet is empty and the backend restarts.',
    );
    return client;
  }
  return restartHost(client, workspace, socketPath, registryPath);
}

async function restartHost(
  client: TerminalHostClient,
  workspace: string,
  socketPath: string,
  registryPath: string,
): Promise<TerminalRuntime> {
  const stalePid = client.hostPid();
  console.error(
    `[terminal-host] stale snapshot ${client.hostSnapshotId() ?? '(pre-handshake)'} `
    + `(current ${path.basename(snapshotSource(workspace))}), empty fleet — restarting host`,
  );
  client.disconnect();
  if (stalePid) {
    try { process.kill(stalePid, 'SIGTERM'); } catch { /* already gone */ }
    await waitForPidExit(stalePid);
  }
  spawnHost(workspace, socketPath, registryPath);
  return connectEventually(socketPath);
}
