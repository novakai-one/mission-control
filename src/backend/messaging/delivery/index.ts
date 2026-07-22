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
  /** Timed submission owned by the PTY-hosting process (D2): when present,
   * the type→settle→submit→flush sequence survives a backend restart and
   * duplicate messageIds are no-ops. Absent in minimal rigs — delivery then
   * falls back to in-process timers. */
  submit?(job: { agentId: string; messageId: string; text: string; settleMs: number; flushMs?: number; leadIn?: { data: string; settleMs: number } }): boolean;
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
  /** Per-agent serialization (S6): one in-flight delivery per PTY, so two
   * concurrent sends can never interleave their type/submit sequences. */
  private readonly lanes = new Map<string, Promise<void>>();

  constructor(
    private readonly writer: PtyWriter,
    private readonly timings: DeliveryTimings = DEFAULT_TIMINGS,
  ) {}

  deliver(
    address: AgentAddress,
    envelope: MessageEnvelope,
    line = formatInbound(envelope),
  ): Promise<DeliveryReceipt> {
    return this.serialized(address.agentId, async () => {
      await this.typeSequenced(address, envelope, line);
      return { messageId: envelope.id, deliveredAt: new Date().toISOString(), mode: envelope.delivery };
    });
  }

  /** An interrupt's Esc rides INSIDE the host lane (C2) — it can never clear
   * a prior job's mid-settle input, because it queues behind that job. */
  private async typeSequenced(address: AgentAddress, envelope: MessageEnvelope, line: string): Promise<void> {
    const interrupt = envelope.delivery === 'interrupt';
    if (interrupt && this.writer.submit) {
      await this.type(address, line, envelope.id, {
        data: this.interruptSequence(address.provider), settleMs: this.timings.interruptSettleMs,
      });
      return;
    }
    if (interrupt) {
      this.write(address, this.interruptSequence(address.provider));
      await delay(this.timings.interruptSettleMs);
    }
    await this.type(address, line, envelope.id);
  }

  /**
   * Type one submission into the PTY. Raw newlines would submit early, so they
   * become literal "\n". When the writer offers a host-owned submit job, the
   * settle/submit/flush timers live in the PTY-hosting process (keyed by
   * messageId, duplicate-safe) and survive a backend restart (D2). The
   * in-process fallback keeps the old behavior for minimal rigs. The
   * kimi-only flush \r hazard is unchanged and documented: on a settled box
   * it submits swallowed text; only kimi has the proven swallowed-\r bug.
   */
  async type(
    address: AgentAddress,
    text: string,
    messageId = `job_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    leadIn?: { data: string; settleMs: number },
  ): Promise<void> {
    const oneLine = text.replace(/\r?\n/g, '\\n');
    const flushMs = address.provider === 'kimi' ? this.timings.flushDelayMs : undefined;
    if (this.writer.submit) {
      const accepted = this.writer.submit({
        agentId: address.agentId, messageId, text: oneLine, settleMs: this.timings.submitDelayMs,
        ...(flushMs !== undefined ? { flushMs } : {}),
        ...(leadIn ? { leadIn } : {}),
      });
      if (!accepted) throw new DeliveryFailedError(`no live PTY for ${address.name} (${address.agentId})`);
      return;
    }
    await this.typeInProcess(address, oneLine, flushMs);
  }

  /** In-process fallback for rigs without a host-owned submit lane. */
  private async typeInProcess(address: AgentAddress, oneLine: string, flushMs: number | undefined): Promise<void> {
    this.write(address, oneLine);
    await delay(this.timings.submitDelayMs);
    this.write(address, '\r');
    if (flushMs !== undefined) {
      const timer = setTimeout(() => {
        try {
          this.writer.write(address.agentId, '\r');
        } catch {
          // best-effort flush — the PTY may be gone; nothing to do
        }
      }, flushMs);
      timer.unref?.();
    }
  }

  private serialized<T>(agentId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.lanes.get(agentId) ?? Promise.resolve();
    const chained = previous.then(task, task);
    this.lanes.set(agentId, chained.then(() => undefined, () => undefined));
    return chained;
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
