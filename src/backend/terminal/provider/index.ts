import { spawn as spawnPty } from 'node-pty';
import type { IPty } from 'node-pty';
import type { ProviderId } from '../../../shared/project/schema.js';
import { ConfigManager } from '../../config/index.js';
import { resolveCli } from '../../agent/executor/index.js';
import { CodexSessionLocator } from './codexDiscovery.js';

/** Minimal PTY interface consumed by the persistent terminal module. */
export type ProviderTerminalProcess = Pick<IPty, 'onData' | 'onExit' | 'write' | 'resize' | 'kill'>;

/** Spawn result whose provider session identity may resolve asynchronously. */
export interface ProviderLaunch {
  process: ProviderTerminalProcess;
  sessionId: Promise<string>;
}

/** Injectable provider launcher used by TerminalManager and its tests. */
export type ProviderLauncher = (
  provider: ProviderId,
  cwd: string,
  requestedSessionId: string,
) => ProviderLaunch;

function scrubEnv(provider: ProviderId): NodeJS.ProcessEnv {
  const scrubbed = { ...process.env };
  for (const envKey of Object.keys(scrubbed)) {
    if (/^CLAUDE|^ANTHROPIC/.test(envKey)) delete scrubbed[envKey];
    if (provider === 'codex' && /^CODEX_/.test(envKey) && envKey !== 'CODEX_HOME') delete scrubbed[envKey];
  }
  return scrubbed;
}

function spawn(provider: ProviderId, cwd: string, args: string[]): ProviderTerminalProcess {
  const configuration = ConfigManager.load();
  const configured = provider === 'claude' ? configuration.claudeCliPath : undefined;
  const { resolved } = resolveCli(configured || provider);
  return spawnPty(resolved, args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 32,
    cwd,
    env: scrubEnv(provider),
  });
}

/** Launch Claude or Codex while resolving its authoritative session ID. */
export function launchProvider(provider: ProviderId, cwd: string, requestedSessionId: string): ProviderLaunch {
  if (provider === 'claude') {
    return {
      process: spawn('claude', cwd, ['--session-id', requestedSessionId]),
      sessionId: Promise.resolve(requestedSessionId),
    };
  }
  const locator = new CodexSessionLocator();
  const known = locator.snapshot();
  const startedAt = Date.now();
  return {
    process: spawn('codex', cwd, ['--no-alt-screen']),
    sessionId: locator.waitForNew(cwd, known, startedAt),
  };
}
