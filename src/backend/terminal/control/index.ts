import type { ProviderId } from '../../../shared/project/schema.js';
import type { TerminalRuntime } from '../runtime/index.js';

export type SessionControlIntent =
  | { kind: 'interrupt' }
  | { kind: 'model'; model: string };

export type SessionControlResult =
  | { status: 'accepted'; agentId: string; intent: SessionControlIntent }
  | { status: 'rejected'; agentId: string; intent: SessionControlIntent; reason: string };

const MODEL_ID = /^[A-Za-z0-9._-]{1,80}$/;

function commandFor(provider: ProviderId, intent: SessionControlIntent): string | null {
  if (intent.kind === 'interrupt') return '\x1b';
  if (intent.kind === 'model') {
    if (provider !== 'claude' || !MODEL_ID.test(intent.model)) return null;
    return `/model ${intent.model}\r`;
  }
  return null;
}

/**
 * Provider-aware control module for live terminal sessions.
 *
 * Callers express product intents; provider command spelling and validation
 * stay behind this interface. An accepted result means the command reached
 * the live PTY. Provider confirmation remains transcript-derived.
 */
export class SessionControl {
  constructor(private readonly terminals: TerminalRuntime) {}

  execute(agentId: string, intent: SessionControlIntent): SessionControlResult {
    const agent = this.terminals.list().find((candidate) => candidate.agentId === agentId);
    if (!agent) return { status: 'rejected', agentId, intent, reason: 'agent not found' };
    if (agent.status !== 'running') {
      return { status: 'rejected', agentId, intent, reason: 'agent is not running' };
    }
    const command = commandFor(agent.provider, intent);
    if (!command) {
      return { status: 'rejected', agentId, intent, reason: 'control is unsupported for this provider' };
    }
    if (!this.terminals.write(agentId, command)) {
      return { status: 'rejected', agentId, intent, reason: 'terminal write failed' };
    }
    return { status: 'accepted', agentId, intent };
  }
}
