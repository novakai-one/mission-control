import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { connect, createServer, type Server, type Socket } from 'node:net';
import type { TerminalRuntime } from '../../runtime/index.js';
import {
  TERMINAL_HOST_PROTOCOL,
  encodeFrame,
  type AgentSnapshot,
  type HostCommand,
  type HostFrame,
} from '../protocol/index.js';

interface OutputCursor {
  value: number;
}

/** Owns PTYs and exposes one same-user Unix-socket protocol. */
export class TerminalHostServer {
  private readonly server: Server;
  private readonly clients = new Set<Socket>();
  private readonly cursors = new Map<string, OutputCursor>();

  constructor(
    private readonly socketPath: string,
    private readonly terminals: TerminalRuntime,
    private readonly snapshotId?: string,
  ) {
    this.server = createServer((socket) => this.accept(socket));
    this.terminals.onData((agentId, data) => this.handleData(agentId, data));
    this.terminals.onExit((agentId, exitCode) => {
      this.broadcast({ type: 'exit', agentId, exitCode });
      this.broadcastAgents();
    });
    this.terminals.onSession((info) => {
      this.broadcast({ type: 'session', info });
      this.broadcastAgents();
    });
  }

  async listen(): Promise<void> {
    await this.removeStaleSocket();
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.socketPath, () => {
        this.server.off('error', reject);
        chmodSync(this.socketPath, 0o600);
        resolve();
      });
    });
  }

  private async removeStaleSocket(): Promise<void> {
    if (!existsSync(this.socketPath)) return;
    const active = await new Promise<boolean>((resolve) => {
      const probe = connect(this.socketPath);
      probe.once('connect', () => {
        probe.destroy();
        resolve(true);
      });
      probe.once('error', () => resolve(false));
    });
    if (active) throw new Error(`terminal host already owns ${this.socketPath}`);
    unlinkSync(this.socketPath);
  }

  async close(): Promise<void> {
    for (const client of this.clients) client.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    if (existsSync(this.socketPath)) unlinkSync(this.socketPath);
  }

  private accept(socket: Socket): void {
    this.clients.add(socket);
    socket.setEncoding('utf8');
    let pending = '';
    socket.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) this.handleLine(socket, line);
    });
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
    this.send(socket, {
      type: 'ready',
      protocol: TERMINAL_HOST_PROTOCOL,
      hostPid: process.pid,
      agents: this.snapshots(),
      snapshotId: this.snapshotId,
    });
  }

  private snapshots(): AgentSnapshot[] {
    return this.terminals.list().map((info) => ({
      info,
      data: this.terminals.snapshot(info.agentId),
      cursor: this.cursors.get(info.agentId)?.value ?? 0,
    }));
  }

  private handleLine(socket: Socket, line: string): void {
    if (!line) return;
    try {
      void this.handleCommand(socket, JSON.parse(line) as HostCommand);
    } catch {
      socket.destroy();
    }
  }

  private async handleCommand(socket: Socket, command: HostCommand): Promise<void> {
    if (command.type === 'create') {
      await this.handleCreate(socket, command);
      return;
    }
    switch (command.type) {
      case 'write': this.terminals.write(command.agentId, command.data); break;
      case 'resize': this.terminals.resize(command.agentId, command.cols, command.rows); break;
      case 'rename':
        this.terminals.rename(command.agentId, command.title);
        this.broadcastAgents();
        break;
      case 'kill': this.terminals.kill(command.agentId); break;
      case 'archive':
        this.terminals.archive(command.agentId);
        this.broadcastAgents();
        break;
    }
  }

  private async handleCreate(
    socket: Socket,
    command: Extract<HostCommand, { type: 'create' }>,
  ): Promise<void> {
    try {
      const info = await this.terminals.create(command.options);
      this.send(socket, { type: 'created', requestId: command.requestId, info });
      this.broadcastAgents();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.send(socket, { type: 'created', requestId: command.requestId, error: message });
    }
  }

  private handleData(agentId: string, data: string): void {
    const cursor = this.cursors.get(agentId) ?? { value: 0 };
    cursor.value += 1;
    this.cursors.set(agentId, cursor);
    this.broadcast({ type: 'data', agentId, data, cursor: cursor.value });
  }

  private broadcastAgents(): void {
    this.broadcast({ type: 'agents', agents: this.terminals.list() });
  }

  private broadcast(frame: HostFrame): void {
    for (const client of this.clients) this.send(client, frame);
  }

  private send(socket: Socket, frame: HostFrame): void {
    if (socket.writable) socket.write(encodeFrame(frame));
  }
}
