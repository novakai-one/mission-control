// Singleton ws client for persistent agents. Wire protocol frozen in
// docs/persistent-agents.md §5 — DO NOT deviate from the message shapes below.

export interface AgentInfo {
  agentId: string;
  title: string;
  sessionId: string;
  projectDir: string;
  cwd: string;
  status: 'running' | 'exited';
  createdAt: string;
}

export interface SubagentSummary {
  subagentId: string;
  agentType: string;
  description: string;
  toolUseId: string;
  spawnDepth: number;
}

export interface AgentHandlers {
  onReplay: (data: string) => void;
  onData: (data: string) => void;
  onExit: (exitCode: number | null) => void;
}

interface ServerFrame {
  type: string;
  [prop: string]: unknown;
}

interface WatchTarget {
  projectDir: string;
  sessionId: string;
}

const READY_CONNECTING = 0;
const READY_OPEN = 1;

let socket: WebSocket | null = null;
const queue: string[] = [];
const agentHandlers = new Map<string, AgentHandlers>();
const watchedSessions = new Map<string, WatchTarget>();

const agentsChangedListeners: Array<(agents: AgentInfo[]) => void> = [];
const transcriptEventListeners: Array<(sessionId: string, event: unknown) => void> = [];
const subagentsChangedListeners: Array<(sessionId: string, subagents: SubagentSummary[]) => void> = [];
const subagentEventListeners: Array<(sessionId: string, subagentId: string, event: unknown) => void> = [];

let backoffInitialMs = 500;
let backoffMs = 500;
let backoffMaxMs = 8000;

// Test seam: resolved lazily so a fake class installed on globalThis before
// connect() runs is picked up instead of the real browser WebSocket.
function getWebSocketCtor(): typeof WebSocket {
  return globalThis.WebSocket;
}

function socketUrl(): string {
  const host = typeof location !== 'undefined' ? location.host : 'localhost';
  return `ws://${host}/ws`;
}

function emitAll<Args extends unknown[]>(listeners: Array<(...args: Args) => void>, ...args: Args): void {
  for (const listener of listeners) listener(...args);
}

const BROADCAST_HANDLERS: Record<string, (message: ServerFrame) => void> = {
  'agents-changed': message => emitAll(agentsChangedListeners, message.agents as AgentInfo[]),
  'transcript-event': message => emitAll(transcriptEventListeners, message.sessionId as string, message.event),
  'subagents-changed': message =>
    emitAll(subagentsChangedListeners, message.sessionId as string, message.subagents as SubagentSummary[]),
  'subagent-event': message =>
    emitAll(subagentEventListeners, message.sessionId as string, message.subagentId as string, message.event),
};

const AGENT_FRAME_TYPES = new Set(['agent-replay', 'agent-data', 'agent-exit']);

function routeAgentFrame(message: ServerFrame): void {
  const agentId = message.agentId as string;
  const handlers = agentHandlers.get(agentId);
  if (!handlers) return;
  if (message.type === 'agent-replay') return handlers.onReplay(message.data as string);
  if (message.type === 'agent-data') return handlers.onData(message.data as string);
  handlers.onExit((message.exitCode as number | null) ?? null);
}

function routeMessage(message: ServerFrame): void {
  if (AGENT_FRAME_TYPES.has(message.type)) return routeAgentFrame(message);
  const handler = BROADCAST_HANDLERS[message.type];
  if (handler) handler(message);
}

function handleMessage(event: MessageEvent): void {
  const message = JSON.parse(event.data as string) as ServerFrame;
  routeMessage(message);
}

function send(message: Record<string, unknown>): void {
  const frame = JSON.stringify(message);
  if (socket && socket.readyState === READY_OPEN) socket.send(frame);
  else queue.push(frame);
}

function flushQueue(): void {
  const pending = queue.splice(0, queue.length);
  for (const frame of pending) socket?.send(frame);
}

function resubscribeAll(): void {
  for (const agentId of agentHandlers.keys()) send({ type: 'agent-subscribe', agentId });
  for (const watch of watchedSessions.values()) send({ type: 'watch-session', ...watch });
}

function handleOpen(): void {
  backoffMs = backoffInitialMs;
  flushQueue();
  resubscribeAll();
}

function scheduleReconnect(): void {
  const delay = backoffMs;
  backoffMs = Math.min(backoffMs * 2, backoffMaxMs);
  setTimeout(openSocket, delay);
}

function handleClose(): void {
  socket = null;
  scheduleReconnect();
}

function openSocket(): void {
  const Ctor = getWebSocketCtor();
  socket = new Ctor(socketUrl());
  socket.onopen = handleOpen;
  socket.onmessage = handleMessage;
  socket.onclose = handleClose;
}

function watchKey(projectDir: string, sessionId: string): string {
  return `${projectDir}::${sessionId}`;
}

export function connect(): void {
  const busy = socket && (socket.readyState === READY_CONNECTING || socket.readyState === READY_OPEN);
  if (!busy) openSocket();
}

export function subscribeAgent(agentId: string, handlers: AgentHandlers): void {
  agentHandlers.set(agentId, handlers);
  send({ type: 'agent-subscribe', agentId });
}

export function unsubscribeAgent(agentId: string): void {
  agentHandlers.delete(agentId); // local only — no server frame per spec §6
}

export function sendInput(agentId: string, data: string): void {
  send({ type: 'agent-input', agentId, data });
}

export function sendResize(agentId: string, cols: number, rows: number): void {
  send({ type: 'agent-resize', agentId, cols, rows });
}

export function watchSession(projectDir: string, sessionId: string): void {
  watchedSessions.set(watchKey(projectDir, sessionId), { projectDir, sessionId });
  send({ type: 'watch-session', projectDir, sessionId });
}

export function onAgentsChanged(listener: (agents: AgentInfo[]) => void): void {
  agentsChangedListeners.push(listener);
}

export function onTranscriptEvent(listener: (sessionId: string, event: unknown) => void): void {
  transcriptEventListeners.push(listener);
}

export function onSubagentsChanged(listener: (sessionId: string, subagents: SubagentSummary[]) => void): void {
  subagentsChangedListeners.push(listener);
}

export function onSubagentEvent(listener: (sessionId: string, subagentId: string, event: unknown) => void): void {
  subagentEventListeners.push(listener);
}

// Test-only seam: shrinks the backoff window so reconnect tests don't sleep 500ms+.
export function setBackoffForTest(initialMs: number, maxMs: number): void {
  backoffInitialMs = initialMs;
  backoffMs = initialMs;
  backoffMaxMs = maxMs;
}
