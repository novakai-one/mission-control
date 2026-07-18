// Persistent-agent wiring: ws agent-* frames, watch-session (additive per
// socket, now also drives a SubagentWatcher), and the /api/agents REST
// surface. Kept out of server/index.ts to hold that file's diff to a few
// lines per docs/persistent-agents.md §3, §5, §6.
import type { Express, Request, Response } from 'express';
import path from 'node:path';
import { WebSocket } from 'ws';
import { PROVIDER_IDS } from '../../shared/project/schema.js';
import type { ProviderId } from '../../shared/project/schema.js';
import { TerminalManager, type AgentInfo, type CreateAgentOptions } from '../terminal/manager.js';
import type { TerminalRuntime } from '../terminal/runtime/index.js';
import { nextSpawnName, isNameTaken } from '../messaging/address/index.js';
import { ConfigManager } from '../config/index.js';
import { SessionWatcher, CLAUDE_DIR, listSessions } from '../transcript/parser.js';
import { SubagentWatcher } from '../transcript/subagents/index.js';

const PROJECT_RE = /^[A-Za-z0-9._-]+$/;
const SESSION_RE = /^[A-Za-z0-9-]+$/;

function isValidProject(value: unknown): value is string {
  return typeof value === 'string' && PROJECT_RE.test(value) && value !== '.' && value !== '..';
}

function isValidSession(value: unknown): value is string {
  return typeof value === 'string' && SESSION_RE.test(value);
}

function resolveSessionPath(projectDir: string, sessionId: string): string | null {
  const sessions = listSessions(projectDir);
  const found = sessions.find((session) => session.sessionId === sessionId);
  const filePath = found ? found.filePath : path.join(CLAUDE_DIR, projectDir, `${sessionId}.jsonl`);
  const resolved = path.resolve(filePath);
  return resolved.startsWith(CLAUDE_DIR + path.sep) ? resolved : null;
}

interface SessionWatchPair {
  session: SessionWatcher;
  subagent: SubagentWatcher;
}

export class AgentsHub {
  private readonly agentSubs = new Map<WebSocket, Set<string>>();
  private readonly sessionWatchers = new Map<WebSocket, Map<string, SessionWatchPair>>();
  private readonly sessionListeners: Array<(info: AgentInfo) => void> = [];
  private readonly launchListeners: Array<(info: AgentInfo) => void> = [];

  constructor(
    private readonly sockets: Set<WebSocket>,
    private readonly manager: TerminalRuntime = new TerminalManager(),
  ) {
    this.manager.onData((agentId, data) => {
      this.sendToSubscribers(agentId, { type: 'agent-data', agentId, data });
    });
    this.manager.onExit((agentId, exitCode) => this.handleExit(agentId, exitCode));
    this.manager.onSession((info) => {
      this.broadcastAgentsChanged();
      for (const listener of this.sessionListeners) listener(info);
    });
  }

  onSessionResolved(listener: (info: AgentInfo) => void): void {
    this.sessionListeners.push(listener);
  }

  /** Fires after every successful launch — the messaging tunnel briefs new agents here. */
  onLaunch(listener: (info: AgentInfo) => void): void {
    this.launchListeners.push(listener);
  }

  /** The terminal surface the messaging tunnel routes through (roster + PTY writes). */
  get terminals(): TerminalRuntime {
    return this.manager;
  }

  handleMessage(socket: WebSocket, message: Record<string, unknown>): boolean {
    if (message.type === 'agent-subscribe') return this.subscribe(socket, message);
    if (message.type === 'agent-input') return this.input(message);
    if (message.type === 'agent-resize') return this.resize(message);
    if (message.type === 'watch-session') return this.watchSession(socket, message);
    if (message.type === 'unwatch-session') return this.unwatchSession(socket, message);
    return false;
  }

  handleClose(socket: WebSocket): void {
    this.agentSubs.delete(socket);
    this.stopAllForSocket(socket);
    this.sessionWatchers.delete(socket);
  }

  registerRoutes(application: Express): void {
    application.post('/api/agents', (request, response) => this.createAgent(request, response));
    application.get('/api/agents', (_request, response) => response.json({ agents: this.manager.list() }));
    application.patch('/api/agents/:agentId', (request, response) => this.renameAgent(request, response));
    application.post('/api/agents/:agentId/kill', (request, response) => this.killAgent(request, response));
    application.delete('/api/agents/:agentId', (request, response) => this.archiveAgent(request, response));
  }

  /** Launch one persistent provider terminal and announce it to every client. */
  async launch(options: CreateAgentOptions) {
    const info = await this.manager.create(options);
    this.broadcastAgentsChanged();
    for (const listener of this.launchListeners) listener(info);
    return info;
  }

  private handleExit(agentId: string, exitCode: number | null): void {
    this.sendToSubscribers(agentId, { type: 'agent-exit', agentId, exitCode });
    this.broadcastAgentsChanged();
  }

  private sendToSubscribers(agentId: string, message: object): void {
    const payload = JSON.stringify(message);
    for (const [socket, agentIds] of this.agentSubs) {
      if (agentIds.has(agentId) && socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
  }

  private broadcastAgentsChanged(): void {
    const payload = JSON.stringify({ type: 'agents-changed', agents: this.manager.list() });
    for (const socket of this.sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
  }

  private subscribe(socket: WebSocket, message: Record<string, unknown>): boolean {
    if (typeof message.agentId !== 'string') return true;
    const agentIds = this.agentSubs.get(socket) ?? new Set<string>();
    agentIds.add(message.agentId);
    this.agentSubs.set(socket, agentIds);
    const snapshot = this.manager.snapshot(message.agentId);
    socket.send(JSON.stringify({ type: 'agent-replay', agentId: message.agentId, data: snapshot }));
    return true;
  }

  private input(message: Record<string, unknown>): boolean {
    if (typeof message.agentId !== 'string' || typeof message.data !== 'string') return true;
    this.manager.write(message.agentId, message.data);
    return true;
  }

  private resize(message: Record<string, unknown>): boolean {
    const valid = typeof message.agentId === 'string'
      && typeof message.cols === 'number' && typeof message.rows === 'number';
    if (!valid) return true;
    this.manager.resize(message.agentId as string, message.cols as number, message.rows as number);
    return true;
  }

  private watchSession(socket: WebSocket, message: Record<string, unknown>): boolean {
    const projectDir = message.projectDir ?? message.project;
    const sessionId = message.sessionId ?? message.session;
    // Dialect: new clients (agentSocket) send projectDir/sessionId and get the
    // spec §5 type-keyed frames (additive/deduped, multi-watch per socket); the
    // legacy tab sends project/session and re-sends watch-session on every
    // session switch, so it must stop+replace (single-watch-per-socket).
    const newDialect = message.projectDir !== undefined;
    if (!isValidProject(projectDir) || !isValidSession(sessionId)) return true;
    if (!newDialect) this.stopAllForSocket(socket);
    else if (this.watchersFor(socket).has(sessionId)) return true;
    this.startWatchers(socket, projectDir, sessionId, newDialect);
    return true;
  }

  private unwatchSession(socket: WebSocket, message: Record<string, unknown>): boolean {
    const { projectDir, sessionId } = message;
    if (!isValidProject(projectDir) || !isValidSession(sessionId)) return true;
    const watcherMap = this.sessionWatchers.get(socket);
    const pair = watcherMap?.get(sessionId);
    if (!watcherMap || !pair) return true;
    this.stopPair(pair);
    watcherMap.delete(sessionId);
    return true;
  }

  private stopAllForSocket(socket: WebSocket): void {
    const watcherMap = this.sessionWatchers.get(socket);
    if (!watcherMap) return;
    for (const pair of watcherMap.values()) this.stopPair(pair);
    watcherMap.clear();
  }

  private watchersFor(socket: WebSocket): Map<string, SessionWatchPair> {
    let watcherMap = this.sessionWatchers.get(socket);
    if (!watcherMap) {
      watcherMap = new Map();
      this.sessionWatchers.set(socket, watcherMap);
    }
    return watcherMap;
  }

  private startWatchers(socket: WebSocket, projectDir: string, sessionId: string, newDialect: boolean): void {
    const resolved = resolveSessionPath(projectDir, sessionId);
    if (!resolved) return;
    const session = this.startSessionWatcher(socket, projectDir, sessionId, resolved, newDialect);
    const subagent = new SubagentWatcher(projectDir, sessionId, (event) => this.sendIfOpen(socket, event));
    subagent.start();
    this.watchersFor(socket).set(sessionId, { session, subagent });
  }

  private startSessionWatcher(
    socket: WebSocket, projectDir: string, sessionId: string, resolved: string, newDialect: boolean
  ): SessionWatcher {
    const watcher = new SessionWatcher(resolved);
    watcher.on('event', (event) => this.sendIfOpen(socket, newDialect
      ? { type: 'transcript-event', sessionId, event }
      : { event: 'transcript-event', payload: event }));
    watcher.start();
    this.sendIfOpen(socket, newDialect
      ? { type: 'watch-started', sessionId }
      : { event: 'watch-started', payload: { project: projectDir, session: sessionId } });
    return watcher;
  }

  private sendIfOpen(socket: WebSocket, message: object): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  private stopPair(pair: SessionWatchPair): void {
    pair.session.stop();
    pair.subagent.stop();
  }

  private async createAgent(request: Request, response: Response): Promise<void> {
    const configuration = ConfigManager.load();
    const cwd = request.body?.cwd ?? configuration.activeRepo ?? process.cwd();
    const requestedProvider = request.body?.provider;
    if (requestedProvider !== undefined && !PROVIDER_IDS.includes(requestedProvider)) {
      response.status(400).json({ error: `provider must be one of ${PROVIDER_IDS.join(', ')}` });
      return;
    }
    const provider = (requestedProvider ?? 'claude') as ProviderId;
    // Messaging addressing (§5): every agent gets a short unique name at
    // spawn — provider + ordinal when none is supplied, 409 on collisions.
    const requested = typeof request.body?.title === 'string' ? request.body.title : undefined;
    if (requested !== undefined && isNameTaken(requested, this.manager.list())) {
      response.status(409).json({ error: `agent name "${requested}" is already taken` });
      return;
    }
    const title = requested ?? nextSpawnName(provider, this.manager.list().map((agent) => agent.title));
    try {
      response.status(201).json(await this.launch({ title, cwd, provider }));
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private renameAgent(request: Request, response: Response): void {
    const title = request.body?.title;
    if (typeof title !== 'string') {
      response.status(400).json({ error: 'title is required' });
      return;
    }
    if (isNameTaken(title, this.manager.list(), request.params.agentId)) {
      response.status(409).json({ error: `agent name "${title}" is already taken` });
      return;
    }
    if (!this.manager.rename(request.params.agentId, title)) {
      response.status(404).json({ error: 'Agent not found' });
      return;
    }
    this.broadcastAgentsChanged();
    response.status(204).end();
  }

  private killAgent(request: Request, response: Response): void {
    if (!this.manager.kill(request.params.agentId)) {
      response.status(404).json({ error: 'Agent not found' });
      return;
    }
    this.broadcastAgentsChanged();
    response.status(204).end();
  }

  private archiveAgent(request: Request, response: Response): void {
    if (!this.manager.archive(request.params.agentId)) {
      response.status(404).json({ error: 'Agent not found' });
      return;
    }
    this.broadcastAgentsChanged();
    response.status(204).end();
  }
}
