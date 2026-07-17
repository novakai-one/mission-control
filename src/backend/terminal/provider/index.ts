import { spawn as spawnPty } from 'node-pty';
import type { IPty } from 'node-pty';
import type { ProviderId } from '../../../shared/project/schema.js';
import { ConfigManager } from '../../config/index.js';
import { resolveCli } from '../../agent/executor/index.js';
import { CodexSessionLocator } from './codexDiscovery.js';

/** Minimal PTY interface consumed by the persistent terminal module. */
export type ProviderTerminalProcess =
  Pick<IPty, 'onData' | 'onExit' | 'write' | 'resize' | 'kill'>
  & Partial<Pick<IPty, 'pid'>>;

/** Spawn result whose provider session identity may resolve asynchronously. */
export interface ProviderLaunch {
  process: ProviderTerminalProcess;
  sessionId: Promise<string>;
  cancelSessionWait?(reason?: string): void;
}

/** Injectable provider launcher used by TerminalManager and its tests. */
export type ProviderLauncher = (
  provider: ProviderId,
  cwd: string,
  requestedSessionId: string,
) => ProviderLaunch;

export function providerArguments(provider: ProviderId, requestedSessionId: string): string[] {
  return provider === 'claude'
    ? ['--session-id', requestedSessionId]
    : ['-c', 'check_for_update_on_startup=false', '--no-alt-screen'];
}

export function providerEnvironment(
  provider: ProviderId,
  browserSession?: string,
  serverPort?: number,
): NodeJS.ProcessEnv {
  const scrubbed = { ...process.env };
  for (const envKey of Object.keys(scrubbed)) {
    if (/^CLAUDE|^ANTHROPIC/.test(envKey)) delete scrubbed[envKey];
    if (provider === 'codex' && /^CODEX_/.test(envKey) && envKey !== 'CODEX_HOME') delete scrubbed[envKey];
  }
  scrubbed.TERM = 'xterm-256color';
  // Bind each agent to its own isolated browser session. When the agent runs
  // `browse`, it auto-scopes to this id — parallel agents never share a tab.
  if (browserSession) scrubbed.NVK_SESSION = browserSession;
  // Point the agent's nvk-msg / nvk-live at THIS backend, so a scratch stack's
  // agents post into their own tunnel instead of leaking into prod's :3031.
  // An explicit inherited NVK_COMMAND_URL wins.
  if (serverPort && !scrubbed.NVK_COMMAND_URL) {
    scrubbed.NVK_COMMAND_URL = `http://127.0.0.1:${serverPort}`;
  }
  return scrubbed;
}

function spawn(provider: ProviderId, cwd: string, args: string[], browserSession: string): ProviderTerminalProcess {
  const configuration = ConfigManager.load();
  const serverPort = Number(process.env.NOVAKAI_SERVER_PORT) || configuration.serverPort;
  const configured = provider === 'claude' ? configuration.claudeCliPath : configuration.codexCliPath;
  const { resolved, exists } = resolveCli(configured || provider);
  if (!exists) {
    throw new Error(`${provider} CLI not found (looked for "${configured || provider}"). `
      + `Set ${provider}CliPath in .novakai-command/config.json or start the backend from a shell with ${provider} on PATH.`);
  }
  return spawnPty(resolved, args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 32,
    cwd,
    env: providerEnvironment(provider, browserSession, serverPort),
  });
}

/** Launch Claude or Codex while resolving its authoritative session ID. */
export function launchProvider(provider: ProviderId, cwd: string, requestedSessionId: string): ProviderLaunch {
  if (provider === 'claude') {
    return {
      process: spawn('claude', cwd, providerArguments(provider, requestedSessionId), requestedSessionId),
      sessionId: Promise.resolve(requestedSessionId),
    };
  }
  const locator = new CodexSessionLocator();
  const known = locator.snapshot();
  const startedAt = Date.now();
  const process = spawn('codex', cwd, providerArguments(provider, requestedSessionId), requestedSessionId);
  return {
    process,
    sessionId: locator.waitForNew(cwd, known, startedAt),
    cancelSessionWait: (reason) => locator.cancel(reason),
  };
}
