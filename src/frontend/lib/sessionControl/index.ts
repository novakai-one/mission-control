import type {
  SessionControlIntent,
  SessionControlReceipt,
  SessionControlResult,
} from '../../../shared/sessionControl.js';
import {
  onSessionControlResult,
  sendAgentControl,
} from '../agentSocket/index.js';

interface PendingControl {
  settle: (result: SessionControlResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingControl>();
let listening = false;

function commandId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `control-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function ensureReceiptListener(): void {
  if (listening) return;
  listening = true;
  onSessionControlResult((receipt: SessionControlReceipt) => {
    const request = pending.get(receipt.commandId);
    if (!request) return;
    pending.delete(receipt.commandId);
    clearTimeout(request.timer);
    request.settle(receipt);
  });
}

/**
 * Execute one control against a live session and await the backend receipt.
 *
 * Accepted means the validated provider command reached the live PTY. Model
 * confirmation remains transcript-derived after the provider applies it.
 */
export function runSessionControl(
  agentId: string,
  intent: SessionControlIntent,
  timeoutMs = 3_000,
): Promise<SessionControlResult> {
  ensureReceiptListener();
  const id = commandId();
  return new Promise((settle) => {
    if (!sendAgentControl(id, agentId, intent)) {
      settle({ status: 'rejected', agentId, intent, reason: 'session connection is not ready' });
      return;
    }
    const timer = setTimeout(() => {
      pending.delete(id);
      settle({ status: 'rejected', agentId, intent, reason: 'session control timed out' });
    }, timeoutMs);
    pending.set(id, { settle, timer });
  });
}

export type {
  SessionControlIntent,
  SessionControlResult,
} from '../../../shared/sessionControl.js';
