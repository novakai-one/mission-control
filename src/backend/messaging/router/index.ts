// Message router — records every envelope, then delivers DMs via PTY or
// records channel posts pull-only (docs/agent-messaging.md §2, §4). Failures
// are part of the audit record: the envelope is appended first, and every
// outcome lands as a status amendment.
import { MessageStore } from '../store/index.js';
import { PtyDelivery } from '../delivery/index.js';
import { RoomStore } from '../rooms/index.js';
import { CHRIS_MEMBER, formatRoomInbound, isChannel, isRoom } from '../types.js';
import type { AgentAddress, DeliveryReceipt, MessageEnvelope, Room } from '../types.js';

/** Recipient not found / not running — the error carries the live roster (§5). */
export class RecipientNotFoundError extends Error {
  constructor(recipient: string, public readonly roster: AgentAddress[]) {
    const live = roster.length ? roster.map((agent) => agent.name).join(', ') : '(none running)';
    super(`recipient "${recipient}" is not a live agent — live agents: ${live}`);
  }
}

/** Two agents ping-ponging must not interrupt-storm each other (§6). */
export class InterruptRateLimitError extends Error {
  constructor(sender: string, maxPerMinute: number) {
    super(`interrupt rate cap: ${sender} already sent ${maxPerMinute} interrupts this minute`);
  }
}

/** Interrupting the whole fleet is never what anyone means (§4). */
export class ChannelInterruptError extends Error {
  constructor(channel: string) {
    super(`interrupt delivery is rejected for channel recipients (${channel})`);
  }
}

export class RoomNotFoundError extends Error {
  constructor(roomId: string) {
    super(`room "${roomId}" was not found`);
  }
}

export class NotARoomMemberError extends Error {
  constructor(sender: string, roomId: string) {
    super(`sender "${sender}" is not a member of room "${roomId}"`);
  }
}

export class InterruptRateLimiter {
  private readonly sentAt = new Map<string, number[]>();

  constructor(
    public readonly maxPerMinute = 3,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Records the attempt when allowed; false once the sender hits the cap. */
  tryAcquire(sender: string): boolean {
    const cutoff = this.clock() - 60_000;
    const recent = (this.sentAt.get(sender) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.maxPerMinute) {
      this.sentAt.set(sender, recent);
      return false;
    }
    recent.push(this.clock());
    this.sentAt.set(sender, recent);
    return true;
  }
}

export class MessageRouter {
  constructor(
    private readonly store: MessageStore,
    private readonly delivery: PtyDelivery,
    private readonly rooms: RoomStore,
    private readonly roster: () => AgentAddress[],
    private readonly interruptLimiter = new InterruptRateLimiter(),
  ) {}

  async route(envelope: MessageEnvelope): Promise<DeliveryReceipt> {
    this.store.append(envelope);
    if (isChannel(envelope.to)) return this.routeChannel(envelope);
    if (isRoom(envelope.to)) return this.routeRoom(envelope);
    return this.routeDirect(envelope);
  }

  private async routeRoom(envelope: MessageEnvelope): Promise<DeliveryReceipt> {
    if (envelope.delivery === 'interrupt') {
      throw this.fail(envelope, new ChannelInterruptError(envelope.to));
    }
    const room = this.rooms.get(envelope.to);
    if (!room) throw this.fail(envelope, new RoomNotFoundError(envelope.to));
    if (!room.members.includes(envelope.from)) {
      throw this.fail(envelope, new NotARoomMemberError(envelope.from, envelope.to));
    }

    const liveByName = new Map(this.roster().map((address) => [address.name, address]));
    for (const member of room.members) {
      if (member === envelope.from || member === CHRIS_MEMBER) continue;
      const address = liveByName.get(member);
      if (!address) continue;
      await this.deliverRoomMember(address, room, envelope);
    }
    this.settle(envelope, 'delivered');
    return { messageId: envelope.id, deliveredAt: new Date().toISOString(), mode: 'room' };
  }

  private async deliverRoomMember(
    address: AgentAddress,
    room: Room,
    envelope: MessageEnvelope,
  ): Promise<void> {
    try {
      await this.delivery.deliver(address, envelope, formatRoomInbound(room, envelope));
    } catch {
      // Room delivery is best-effort; history remains available for pulling.
    }
  }

  /** Channel fan-out is record-only: readers pull, nothing is PTY-injected (§4). */
  private routeChannel(envelope: MessageEnvelope): DeliveryReceipt {
    if (envelope.delivery === 'interrupt') {
      throw this.fail(envelope, new ChannelInterruptError(envelope.to));
    }
    this.settle(envelope, 'delivered');
    return { messageId: envelope.id, deliveredAt: new Date().toISOString(), mode: 'channel' };
  }

  private async routeDirect(envelope: MessageEnvelope): Promise<DeliveryReceipt> {
    const roster = this.roster();
    const address = roster.find((agent) => agent.name === envelope.to);
    if (!address) throw this.fail(envelope, new RecipientNotFoundError(envelope.to, roster));
    if (envelope.delivery === 'interrupt' && !this.interruptLimiter.tryAcquire(envelope.from)) {
      throw this.fail(envelope, new InterruptRateLimitError(envelope.from, this.interruptLimiter.maxPerMinute));
    }
    try {
      const receipt = await this.delivery.deliver(address, envelope);
      this.settle(envelope, 'delivered');
      return receipt;
    } catch (error) {
      throw this.fail(envelope, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private settle(envelope: MessageEnvelope, status: MessageEnvelope['status']): void {
    envelope.status = status;
    this.store.updateStatus(envelope.id, status);
  }

  private fail(envelope: MessageEnvelope, error: Error): Error {
    this.settle(envelope, 'failed');
    return error;
  }
}
