// Agent messaging contracts per docs/agent-messaging.md §3. The envelope is
// the extensible object — permissions and future metadata land here later.
import type { ProviderId } from '../../shared/project/schema.js';

export interface MessageEnvelope {
  id: string;            // msg_<uuid>
  from: string;          // sender agent name
  to: string;            // agent name or '#team'
  delivery: 'normal' | 'interrupt';
  body: string;
  threadId?: string;     // optional conversation grouping
  createdAt: string;     // ISO
  status: 'queued' | 'delivered' | 'partial' | 'failed';
}

export interface Room {
  roomId: string;
  name: string;
  members: string[];
  createdBy: string;
  createdAt: string;
  archived: boolean;
}

export interface SendMessage {
  to: string;
  delivery: 'normal' | 'interrupt';
  body: string;
}

export interface DeliveryReceipt {
  messageId: string;
  deliveredAt: string;
  mode: string;
  failed?: string[];   // room fan-out: members whose PTY write failed (status 'partial')
}

export interface AgentAddress {
  agentId: string;
  name: string;
  provider: ProviderId;
}

export interface MessageQuery {
  withAgent?: string;
  withRoom?: string;
  threadId?: string;
  since?: string;
  limit?: number;
}

export interface ChannelQuery {
  since?: string;
  limit?: number;
}

export const TEAM_CHANNEL = '#team';
export const CHRIS_MEMBER = 'chris';

export function isChannel(recipient: string): boolean {
  return recipient.startsWith('#');
}

export function isRoom(recipient: string): boolean {
  return recipient.startsWith('room_');
}

/** Inbound line typed into a recipient PTY — distinguishes agent mail from Chris typing. */
export function formatInbound(envelope: MessageEnvelope): string {
  return `[nvk-msg from ${envelope.from} id ${envelope.id}] ${envelope.body}`;
}

/** Inbound PTY line for a room post. */
export function formatRoomInbound(room: Room, envelope: MessageEnvelope): string {
  return `[nvk-room ${room.name} from ${envelope.from} id ${envelope.id}] ${envelope.body}`;
}
