// Actor resolution (messaging rework task 2): one pure resolver maps a
// recipient name to its kind — a durable mailbox identity, a live agent, a
// room, or a channel. It persists nothing; the identity registry, live roster
// and room store stay the sources of truth. The router picks a delivery
// adapter from the resolved kind.
import { isChannel, isRoom, mailboxIdentityFor } from '../types.js';
import type { AgentAddress, MailboxIdentity, MailboxLookup, Room } from '../types.js';

export type ResolvedActor =
  | { kind: 'mailbox'; identity: MailboxIdentity }
  | { kind: 'agent'; address: AgentAddress }
  | { kind: 'room'; room: Room }
  | { kind: 'channel'; name: string };

/** Map a recipient name to its actor; null when nothing live answers to it. */
export function resolveActor(
  name: string,
  roster: AgentAddress[],
  rooms: Room[],
  lookup: MailboxLookup = mailboxIdentityFor,
): ResolvedActor | null {
  const identity = lookup(name);
  if (identity) return { kind: 'mailbox', identity };
  if (isChannel(name)) return { kind: 'channel', name };
  if (isRoom(name)) {
    const room = rooms.find((entry) => entry.roomId === name);
    return room ? { kind: 'room', room } : null;
  }
  const address = roster.find((agent) => agent.name === name);
  return address ? { kind: 'agent', address } : null;
}
