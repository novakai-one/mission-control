// Agent messaging contracts per docs/agent-messaging.md §3. The envelope is
// the extensible object — permissions and future metadata land here later.

export interface MessageEnvelope {
  id: string;            // msg_<uuid>
  from: string;          // sender agent name
  to: string;            // agent name or '#team'
  delivery: 'normal' | 'interrupt';
  body: string;
  threadId?: string;     // optional conversation grouping
  createdAt: string;     // ISO
  status: 'queued' | 'delivered' | 'failed';
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
}

export interface AgentAddress {
  agentId: string;
  name: string;
  provider: 'claude' | 'codex';
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

export interface UserIdentity {
  id: 'user:chris';
  displayName: 'Chris';
  memberName: typeof CHRIS_MEMBER;
  role: 'owner';
  permissions: readonly ['messages:send', 'rooms:send'];
}

/** Browser-authored messages resolve to this server-owned principal. */
export const CHRIS_IDENTITY: UserIdentity = {
  id: 'user:chris',
  displayName: 'Chris',
  memberName: CHRIS_MEMBER,
  role: 'owner',
  permissions: ['messages:send', 'rooms:send'],
};

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
