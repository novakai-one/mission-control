import express from 'express';
import cors from 'cors';
import { createServer, Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentCoordinator } from '../agent/index.js';
import { ConfigManager } from '../config/index.js';
import { StateManager } from '../state/index.js';
import { exec } from 'node:child_process';

export class ServerController {
  private readonly app = express();
  private readonly server: HttpServer;
  private readonly wsServer: WebSocketServer;
  private readonly activeSockets = new Set<WebSocket>();

  constructor(
    private readonly port: number,
    private readonly coordinator: AgentCoordinator,
    private readonly stateManager: StateManager
  ) {
    this.server = createServer(this.app);
    this.wsServer = new WebSocketServer({ server: this.server });

    this.configureExpress();
    this.configureWebSockets();
    this.configureRoutes();

    this.coordinator.setBroadcastHandler((event, payload) => {
      this.broadcastEvent(event, payload);
    });
  }

  private configureExpress(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private configureWebSockets(): void {
    this.wsServer.on('connection', (socket) => {
      this.activeSockets.add(socket);
      socket.on('close', () => {
        this.activeSockets.delete(socket);
      });
    });
  }

  private configureRoutes(): void {
    this.app.get('/api/config', (_, res) => {
      res.json(ConfigManager.load());
    });

    this.app.post('/api/config', (req, res) => {
      ConfigManager.save(req.body);
      res.json({ success: true });
    });

    this.app.get('/api/builds', (_, res) => {
      res.json(this.stateManager.listBuilds());
    });

    this.app.get('/api/builds/:id', (req, res) => {
      try {
        res.json(this.stateManager.loadBuild(req.params.id));
      } catch {
        res.status(404).json({ error: 'Build not found' });
      }
    });

    this.app.post('/api/builds/start', async (req, res) => {
      const { prompt, llmType, geminiApiKey } = req.body;
      const buildId = await this.coordinator.startBuild(prompt, llmType, geminiApiKey);
      res.json({ buildId });
    });

    this.app.post('/api/builds/stop', async (req, res) => {
      const { buildId } = req.body;
      await this.coordinator.stopBuild(buildId);
      res.json({ success: true });
    });

    this.app.post('/api/subagents/spawn', async (req, res) => {
      const { parentAgentId, role, prompt, llmType, geminiApiKey } = req.body;
      const subagentId = await this.coordinator.spawnSubagent(parentAgentId, role, prompt, llmType, geminiApiKey);
      res.json({ subagentId });
    });

    this.app.post('/api/browse', (_, res) => {
      const appleScript = `osascript -e 'POSIX path of (choose folder with prompt "Select Workspace Folder")'`;
      exec(appleScript, (error, stdout) => {
        if (error) {
          res.status(500).json({ error: 'Folder selection cancelled' });
        } else {
          res.json({ path: stdout.trim() });
        }
      });
    });
  }

  public broadcastEvent(event: string, payload: any): void {
    const rawMessage = JSON.stringify({ event, payload });
    for (const socket of this.activeSockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(rawMessage);
      }
    }
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wsServer.close(() => {
        this.server.close(() => {
          resolve();
        });
      });
    });
  }
}
