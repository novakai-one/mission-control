// PTY delivery — types messages into a recipient's terminal
// (docs/agent-messaging.md §4). Per-provider quirks (Esc semantics, prompt
// states) live entirely here; the router doesn't know them.
//   normal:    type + submit (both CLIs queue mid-turn input natively)
//   interrupt: Esc first, settle, then type + submit
// Every recipient kind sits behind MessageDeliveryAdapter so the router is
// uniform: PtyDeliveryAdapter is today's typing, MailboxDeliveryAdapter is
// the log+ws record a durable non-PTY identity reads, and future API-native
// agents slot in here.
import { formatInbound } from '../types.js';
import type { ResolvedActor } from '../actors/index.js';
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
  /** After submitting, one bare \r at this delay flushes unsubmitted input.
   * kimi's TUI swallows an \r sent right after typed text (drops it or makes
   * it a newline); a bare \r on a settled box submits. Omit = no flush. */
  flushDelayMs?: number;
}

const DEFAULT_TIMINGS: DeliveryTimings = { interruptSettleMs: 400, submitDelayMs: 900, flushDelayMs: 6000 };

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

  async deliver(
    address: AgentAddress,
    envelope: MessageEnvelope,
    line = formatInbound(envelope),
  ): Promise<DeliveryReceipt> {
    if (envelope.delivery === 'interrupt') {
      this.write(address, this.interruptSequence(address.provider));
      await delay(this.timings.interruptSettleMs);
    }
    await this.type(address, line);
    return { messageId: envelope.id, deliveredAt: new Date().toISOString(), mode: envelope.delivery };
  }

  /** Type one submission into the PTY. Raw newlines would submit early, so they become literal "\n". */
  async type(address: AgentAddress, text: string): Promise<void> {
    this.write(address, text.replace(/\r?\n/g, '\\n'));
    await delay(this.timings.submitDelayMs);
    this.write(address, '\r');
    this.scheduleFlush(address);
  }

  /**
   * kimi-only flush: one bare \r after the box settles, submitting anything the
   * first \r missed. Hazard (accepted, documented): at +6s this submits whatever
   * sits in the input box, and on a menu/dialog a bare \r can pick the
   * highlighted option — so it fires only for kimi, where the swallowed-\r bug
   * is proven. Never throws: a dead PTY at flush time is a silent no-op, not a
   * backend-crashing uncaught exception.
   */
  private scheduleFlush(address: AgentAddress): void {
    if (address.provider !== 'kimi' || !this.timings.flushDelayMs) return;
    const timer = setTimeout(() => {
      try {
        this.writer.write(address.agentId, '\r');
      } catch {
        // best-effort flush — the PTY may be gone; nothing to do
      }
    }, this.timings.flushDelayMs);
    timer.unref?.();
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

/** The delivery seam: one adapter per recipient kind (messaging rework task 3). */
export interface MessageDeliveryAdapter {
  deliver(
    target: ResolvedActor,
    envelope: MessageEnvelope,
    line?: string,
  ): Promise<DeliveryReceipt>;
}

/** Today's PTY typing behind the seam. PtyDelivery itself stays exported for existing callers. */
export class PtyDeliveryAdapter implements MessageDeliveryAdapter {
  constructor(private readonly ptyDelivery: PtyDelivery) {}

  deliver(
    target: ResolvedActor,
    envelope: MessageEnvelope,
    line?: string,
  ): Promise<DeliveryReceipt> {
    if (target.kind !== 'agent') {
      throw new DeliveryFailedError(`PTY delivery requires an agent recipient, got ${target.kind}`);
    }
    return this.ptyDelivery.deliver(target.address, envelope, line);
  }
}

/**
 * A durable mailbox identity reads the log + ws push, so "delivery" is the
 * record itself — persistence and the message-envelope broadcast already
 * happen via store.onAppend.
 */
export class MailboxDeliveryAdapter implements MessageDeliveryAdapter {
  deliver(target: ResolvedActor, envelope: MessageEnvelope): Promise<DeliveryReceipt> {
    if (target.kind !== 'mailbox') {
      throw new DeliveryFailedError(`mailbox delivery requires a mailbox recipient, got ${target.kind}`);
    }
    const receipt: DeliveryReceipt = {
      messageId: envelope.id,
      deliveredAt: new Date().toISOString(),
      mode: 'mailbox',
    };
    return Promise.resolve(receipt);
  }
}

/** @deprecated Use MailboxDeliveryAdapter for every durable non-PTY identity. */
export class HumanDeliveryAdapter extends MailboxDeliveryAdapter {}
