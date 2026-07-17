// PTY delivery — types messages into a recipient's terminal
// (docs/agent-messaging.md §4). Per-provider quirks (Esc semantics, prompt
// states) live entirely here; the router doesn't know them.
//   normal:    type + submit (both CLIs queue mid-turn input natively)
//   interrupt: Esc first, settle, then type + submit
import { formatInbound } from '../types.js';
import type { AgentAddress, DeliveryReceipt, MessageEnvelope } from '../types.js';

/** The one TerminalManager capability delivery needs. */
export interface PtyWriter {
  write(agentId: string, data: string): boolean;
}

export interface DeliveryTimings {
  /** Pause after Esc so the CLI settles back to its prompt before typing. */
  interruptSettleMs: number;
  /** Pause between typing the line and submitting it. */
  submitDelayMs: number;
}

const DEFAULT_TIMINGS: DeliveryTimings = { interruptSettleMs: 400, submitDelayMs: 150 };

export class DeliveryFailedError extends Error {}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class PtyDelivery {
  constructor(
    private readonly writer: PtyWriter,
    private readonly timings: DeliveryTimings = DEFAULT_TIMINGS,
  ) {}

  async deliver(address: AgentAddress, envelope: MessageEnvelope): Promise<DeliveryReceipt> {
    if (envelope.delivery === 'interrupt') {
      this.write(address, this.interruptSequence(address.provider));
      await delay(this.timings.interruptSettleMs);
    }
    await this.type(address, formatInbound(envelope));
    return { messageId: envelope.id, deliveredAt: new Date().toISOString(), mode: envelope.delivery };
  }

  /** Type one submission into the PTY. Raw newlines would submit early, so they become literal "\n". */
  async type(address: AgentAddress, text: string): Promise<void> {
    this.write(address, text.replace(/\r?\n/g, '\\n'));
    await delay(this.timings.submitDelayMs);
    this.write(address, '\r');
  }

  /** Esc breaks the current turn in both CLIs today; provider divergence slots in here. */
  private interruptSequence(_provider: AgentAddress['provider']): string {
    return '\x1b';
  }

  private write(address: AgentAddress, data: string): void {
    if (!this.writer.write(address.agentId, data)) {
      throw new DeliveryFailedError(`no live PTY for ${address.name} (${address.agentId})`);
    }
  }
}
