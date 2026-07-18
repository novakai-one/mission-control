// Actor resolution (messaging rework task 2): one pure resolver maps a
// recipient name to its kind — the human (CHRIS_MEMBER), a live agent, a
// room, or a channel. It persists nothing; the live roster and the room
// store stay the sources of truth. The router picks a delivery adapter from
// the resolved kind.
import { CHRIS_MEMBER, isChannel, isRoom } from '../types.js';
import type { AgentAddress, Room } from '../types.js';

export type ResolvedActor =
  | { kind: 'human'; name: string }
  | { kind: 'agent'; address: AgentAddress }
  | { kind: 'room'; room: Room }
  | { kind: 'channel'; name: string };

/** Map a recipient name to its actor; null when nothing live answers to it. */
export function resolveActor(
  name: string,
  roster: AgentAddress[],
  rooms: Room[],
): ResolvedActor | null {
  if (name === CHRIS_MEMBER) return { kind: 'human', name: CHRIS_MEMBER };
  if (isChannel(name)) return { kind: 'channel', name };
  if (isRoom(name)) {
    const room = rooms.find((entry) => entry.roomId === name);
    return room ? { kind: 'room', room } : null;
  }
  const address = roster.find((agent) => agent.name === name);
  return address ? { kind: 'agent', address } : null;
}
