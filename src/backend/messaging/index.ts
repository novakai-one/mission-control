// Agent messaging tunnel wiring (docs/agent-messaging.md). Owns the REST
// surface (POST/GET /api/messages), pushes every appended envelope over the
// existing WebSocket broadcast for the future Messages view (R6), and types
// the spawn briefing into each new agent's PTY (R5). Kept out of
// server/index.ts the same way AgentsHub is.
import type { Express, Request, Response } from 'express';
import type { AgentInfo } from '../terminal/manager.js';
import { rosterFromAgents } from './address/index.js';
import { composeSpawnBriefing } from './address/briefing.js';
import { PtyDelivery, DeliveryFailedError } from './delivery/index.js';
import type { DeliveryTimings, PtyWriter } from './delivery/index.js';
import {
  MessageRouter,
  InterruptRateLimiter,
  RecipientNotFoundError,
  InterruptRateLimitError,
  ChannelInterruptError,
  NotARoomMemberError,
  RoomNotFoundError,
} from './router/index.js';
import { RoomStore } from './rooms/index.js';
import { MailboxConflictError, MailboxRegistry } from './mailbox/index.js';
import { SendApi, InvalidSendError } from './send/index.js';
import { MessageStore } from './store/index.js';
import { CHRIS_IDENTITY, CHRIS_MEMBER } from './types.js';
import type { MessageQuery, Room, SendMessage } from './types.js';

export { MessageStore } from './store/index.js';
export { RoomStore } from './rooms/index.js';
export {
  PtyDelivery,
  PtyDeliveryAdapter,
  MailboxDeliveryAdapter,
  HumanDeliveryAdapter,
} from './delivery/index.js';
export type { MessageDeliveryAdapter } from './delivery/index.js';
export { resolveActor } from './actors/index.js';
export type { ResolvedActor } from './actors/index.js';
export { MessageRouter, InterruptRateLimiter } from './router/index.js';
export { MailboxConflictError, MailboxRegistry } from './mailbox/index.js';
export { SendApi } from './send/index.js';
export { rosterFromAgents, nextSpawnName, isNameTaken } from './address/index.js';
export { composeSpawnBriefing } from './address/briefing.js';
export * from './types.js';

/** The TerminalManager surface messaging consumes. */
export interface AgentTerminals extends PtyWriter {
  list(): AgentInfo[];
}

export interface MessagingOptions {
  storePath?: string;
  roomsStorePath?: string;
  /** Durable mailbox registry file; defaults to .novakai-command/mailboxes.jsonl. */
  mailboxStorePath?: string;
  /** Inject a registry directly (tests/scratch rigs); wins over mailboxStorePath. */
  mailboxRegistry?: MailboxRegistry;
  timings?: DeliveryTimings;
  maxInterruptsPerMinute?: number;
  /** How long a freshly spawned CLI gets to boot before the briefing is typed. */
  spawnBriefingDelayMs?: number;
  /** Port quoted in the briefing's curl instructions. */
  serverPort?: number;
}

export class MessagingHub {
  private readonly store: MessageStore;
  private readonly delivery: PtyDelivery;
  private readonly rooms: RoomStore;
  private readonly mailboxes: MailboxRegistry;
  private readonly sendApi: SendApi;
  private readonly spawnBriefingDelayMs: number;
  private readonly serverPort: number;

  constructor(
    private readonly terminals: AgentTerminals,
    private readonly broadcast: (event: string, payload: unknown) => void,
    options: MessagingOptions = {},
  ) {
    this.store = new MessageStore(options.storePath); this.rooms = new RoomStore(options.roomsStorePath);
    this.mailboxes = options.mailboxRegistry ?? new MailboxRegistry(options.mailboxStorePath);
    this.store.onAppend((envelope) => this.broadcast('message-envelope', envelope));
    this.rooms.onAppend(() => this.broadcast('rooms-changed', { rooms: this.rooms.list() }));
    this.delivery = new PtyDelivery(this.terminals, options.timings);
    this.sendApi = new SendApi(this.buildRouter(options));
    this.spawnBriefingDelayMs = options.spawnBriefingDelayMs ?? 3000;
    this.serverPort = options.serverPort ?? 3031;
  }

  private buildRouter(options: MessagingOptions): MessageRouter {
    return new MessageRouter(
      this.store,
      this.delivery,
      this.rooms,
      () => rosterFromAgents(this.terminals.list()),
      new InterruptRateLimiter(options.maxInterruptsPerMinute),
      (name) => this.mailboxes.identityFor(name),
    );
  }

  /** The durable mailbox registry — shared with AgentsHub for name checks. */
  get mailboxRegistry(): MailboxRegistry {
    return this.mailboxes;
  }

  registerRoutes(application: Express): void {
    application.post('/api/messages', (request, response) => void this.handleSend(request, response));
    application.post('/api/user/messages', (request, response) => void this.handleUserSend(request, response));
    application.get('/api/messages', (request, response) => this.handleHistory(request, response));
    application.get('/api/identity', (_request, response) => response.json({ identity: CHRIS_IDENTITY }));
    application.get('/api/messaging/address-book', (_request, response) => response.json({
      mailboxes: this.mailboxes.list(),
      presences: rosterFromAgents(this.terminals.list()),
    }));
    application.post('/api/mailboxes', (request, response) => this.handleRegisterMailbox(request, response));
    application.post('/api/rooms', (request, response) => this.handleCreateRoom(request, response));
    application.post('/api/user/rooms', (request, response) => this.handleCreateUserRoom(request, response));
    application.get('/api/rooms', (_request, response) => response.json({ rooms: this.rooms.list() }));
    application.post(
      '/api/rooms/:roomId/members',
      (request, response) => this.handleAddMembers(request, response),
    );
  }

  private handleRegisterMailbox(request: Request, response: Response): void {
    const payload = (request.body ?? {}) as { displayName?: unknown; memberName?: unknown };
    try {
      const displayName = this.requireText(payload.displayName, 'displayName');
      const memberName = this.requireText(payload.memberName, 'memberName');
      response.status(201).json({ identity: this.mailboxes.register({ displayName, memberName }) });
    } catch (error) {
      if (error instanceof MailboxConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private handleCreateRoom(request: Request, response: Response): void {
    const payload = (request.body ?? {}) as { name?: unknown; members?: unknown; from?: unknown };
    try {
      const name = this.requireText(payload.name, 'name');
      const members = this.requireStringArray(payload.members, 'members');
      const createdBy = this.requireText(payload.from, 'from');
      const resolvedMembers = createdBy === CHRIS_MEMBER
        ? [...new Set([...members, CHRIS_IDENTITY.memberName])]
        : members;
      response.status(201).json({ room: this.rooms.create({ name, members: resolvedMembers, createdBy }) });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private handleCreateUserRoom(request: Request, response: Response): void {
    const payload = (request.body ?? {}) as { name?: unknown; members?: unknown };
    try {
      const name = this.requireText(payload.name, 'name');
      const members = this.requireStringArray(payload.members, 'members');
      response.status(201).json({
        room: this.rooms.create({
          name,
          members: [...new Set([...members, CHRIS_IDENTITY.memberName])],
          createdBy: CHRIS_IDENTITY.memberName,
        }),
      });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private handleAddMembers(request: Request, response: Response): void {
    const roomId = request.params.roomId;
    const room = this.rooms.get(roomId);
    if (!room) {
      response.status(404).json({ error: new RoomNotFoundError(roomId).message });
      return;
    }
    const payload = (request.body ?? {}) as { 'add'?: unknown; from?: unknown };
    try {
      const sender = this.requireText(payload.from, 'from');
      if (!room.members.includes(sender)) {
        response.status(403).json({ error: new NotARoomMemberError(sender, roomId).message });
        return;
      }
      const membersToAdd = this.requireStringArray(payload.add, 'add');
      response.json({ room: this.rooms.addMembers(roomId, membersToAdd) as Room });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private requireText(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${field} must be a non-empty string`);
    }
    return value;
  }

  private requireStringArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
      throw new Error(`${field} must be an array of non-empty strings`);
    }
    return value;
  }

  /**
   * Phase 5: standing instructions typed into the agent's PTY once its CLI
   * has had time to boot. Best-effort — a briefing must never fail a spawn.
   */
  handleAgentSpawned(info: AgentInfo): void {
    const timer = setTimeout(() => {
      const roster = rosterFromAgents(this.terminals.list());
      const self = roster.find((agent) => agent.agentId === info.agentId);
      if (!self) return; // exited before the briefing was due
      const peers = roster.filter((agent) => agent.agentId !== info.agentId);
      void this.delivery
        .type(self, composeSpawnBriefing(self.name, peers, this.serverPort, this.mailboxes.list()))
        .catch(() => { /* PTY already gone — nothing to brief */ });
    }, this.spawnBriefingDelayMs);
    timer.unref?.();
  }

  private async handleSend(request: Request, response: Response): Promise<void> {
    const payload = (request.body ?? {}) as Partial<SendMessage> & { from?: string; threadId?: string };
    // SECURITY DEBT (M2): this agent route still trusts the submitted `from`
    // string. Authenticate live agents and give orchestrators a server-owned
    // send route before treating sender identity as an authorization fact.
    const sender = payload.from === CHRIS_MEMBER ? CHRIS_IDENTITY.memberName : payload.from as string;
    await this.sendPayload(sender, payload, response);
  }

  private async handleUserSend(request: Request, response: Response): Promise<void> {
    const payload = (request.body ?? {}) as Partial<SendMessage> & { threadId?: string };
    await this.sendPayload(CHRIS_IDENTITY.memberName, payload, response);
  }

  private async sendPayload(
    sender: string,
    payload: Partial<SendMessage> & { threadId?: string },
    response: Response,
  ): Promise<void> {
    try {
      const envelope = await this.sendApi.send(sender, {
        'to': payload.to as string,
        delivery: payload.delivery as SendMessage['delivery'],
        body: payload.body as string,
        threadId: payload.threadId,
      });
      response.status(201).json({ envelope });
    } catch (error) {
      this.sendFailure(response, error);
    }
  }

  private sendFailure(response: Response, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof InvalidSendError || error instanceof ChannelInterruptError) {
      response.status(400).json({ error: message });
    } else if (error instanceof RecipientNotFoundError) {
      response.status(404).json({ error: message, roster: error.roster, mailboxes: this.mailboxes.list() });
    } else if (error instanceof RoomNotFoundError) {
      response.status(404).json({ error: message });
    } else if (error instanceof NotARoomMemberError) {
      response.status(403).json({ error: message });
    } else if (error instanceof InterruptRateLimitError) {
      response.status(429).json({ error: message });
    } else if (error instanceof DeliveryFailedError) {
      response.status(502).json({ error: message });
    } else {
      response.status(500).json({ error: message });
    }
  }

  private handleHistory(request: Request, response: Response): void {
    const query: MessageQuery = {};
    if (typeof request.query.withAgent === 'string') query.withAgent = request.query.withAgent;
    if (typeof request.query.withRoom === 'string') query.withRoom = request.query.withRoom;
    if (typeof request.query.threadId === 'string') query.threadId = request.query.threadId;
    if (typeof request.query.since === 'string') query.since = request.query.since;
    if (typeof request.query.limit === 'string') {
      const limit = Number.parseInt(request.query.limit, 10);
      if (Number.isFinite(limit) && limit > 0) query.limit = limit;
    }
    response.json({ messages: this.store.history(query) });
  }
}
