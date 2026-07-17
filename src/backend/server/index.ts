import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { createServer, Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentCoordinator } from '../agent/index.js';
import { ConfigManager } from '../config/index.js';
import { StateManager } from '../state/index.js';
import { exec } from 'node:child_process';
import { listSessions, readSession, listSubagents, readSubagent, CLAUDE_DIR } from '../transcript/parser.js';
import { matchSessions } from '../transcript/repoIndex.js';
import { sessionUsage } from '../transcript/usage/index.js';
import { readRuleset } from '../ruleset/reader.js';
import { listDir, resolveGitRoot, clampToHome, PathDeniedError, NotFoundError } from '../fs/explorer.js';
import { getRepoInfo } from '../versionControl/index.js';
import { AgentsHub } from './agents.js';
import { ProjectsHub } from './projects/index.js';
import { CanvasHub } from './canvas/index.js';
import { AnalyticsHub } from './analytics/index.js';
import { DesignHub } from './design/index.js';
import { MessagingHub } from '../messaging/index.js';
import type { TerminalRuntime } from '../terminal/runtime/index.js';

const PROJECT_RE = /^[A-Za-z0-9._-]+$/;
const SESSION_RE = /^[A-Za-z0-9-]+$/;
const AGENT_RE = /^agent-[A-Za-z0-9]+$/;

function isValidProjectDir(value: unknown): value is string {
  return typeof value === 'string' && PROJECT_RE.test(value) && value !== '.' && value !== '..';
}

function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_RE.test(value);
}

function validateProjectSession(
  request: express.Request,
  response: express.Response
): { projectDir: string; sessionId: string } | null {
  const projectDir = request.query.project as string;
  const sessionId = request.query.session as string;
  if (!isValidProjectDir(projectDir)) {
    response.status(400).json({ error: 'invalid project parameter' });
    return null;
  }
  if (!isValidSessionId(sessionId)) {
    response.status(400).json({ error: 'invalid session parameter' });
    return null;
  }
  return { projectDir, sessionId };
}

export class ServerController {
  private readonly app = express();
  private readonly server: HttpServer;
  private readonly wsServer: WebSocketServer;
  private readonly activeSockets = new Set<WebSocket>();
  private readonly agentsHub: AgentsHub;
  private readonly projectsHub: ProjectsHub;
  private readonly canvasHub: CanvasHub;
  private readonly analyticsHub: AnalyticsHub;
  private readonly designHub: DesignHub;
  private readonly messagingHub: MessagingHub;

  constructor(
    private readonly port: number,
    private readonly coordinator: AgentCoordinator,
    private readonly stateManager: StateManager,
    terminals: TerminalRuntime,
  ) {
    this.agentsHub = new AgentsHub(this.activeSockets, terminals);
    this.projectsHub = new ProjectsHub(this.agentsHub);
    [this.canvasHub, this.analyticsHub, this.designHub] = this.buildStudioHubs();
    this.messagingHub = this.buildMessagingHub();
    this.server = createServer(this.app); this.wsServer = new WebSocketServer({ server: this.server });

    this.configureExpress();
    this.configureWebSockets();
    this.configureRoutes();

    this.coordinator.setBroadcastHandler((event, payload) => {
      this.broadcastEvent(event, payload);
    });
  }

  /** Studio lenses share one event broadcast boundary. */
  private buildStudioHubs(): [CanvasHub, AnalyticsHub, DesignHub] {
    const broadcast = (event: string, payload: unknown): void => this.broadcastEvent(event, payload);
    return [new CanvasHub(broadcast), new AnalyticsHub(broadcast), new DesignHub(broadcast)];
  }

  /**
   * Agent messaging tunnel (docs/agent-messaging.md): envelopes broadcast on
   * the shared ws so the Messages view can build a live feed; new agents get
   * their spawn briefing typed into their PTY.
   */
  private buildMessagingHub(): MessagingHub {
    const messagingHub = new MessagingHub(
      this.agentsHub.terminals,
      (event, payload) => this.broadcastEvent(event, payload),
      { serverPort: this.port },
    );
    this.agentsHub.onLaunch((info) => messagingHub.handleAgentSpawned(info));
    return messagingHub;
  }

  private configureExpress(): void {
    this.app.use(cors({ origin: 'http://localhost:3030' }));
    this.app.use(express.json());
  }

  private configureWebSockets(): void {
    this.wsServer.on('connection', (socket) => {
      this.activeSockets.add(socket);

      socket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.agentsHub.handleMessage(socket, message);
        } catch {
          // ignore malformed messages
        }
      });

      socket.on('close', () => {
        this.activeSockets.delete(socket);
        this.agentsHub.handleClose(socket);
      });
    });
  }

  private configureRoutes(): void {
    this.agentsHub.registerRoutes(this.app);
    this.projectsHub.registerRoutes(this.app);
    this.canvasHub.registerRoutes(this.app);
    this.analyticsHub.registerRoutes(this.app);
    this.designHub.registerRoutes(this.app);
    this.messagingHub.registerRoutes(this.app);

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
      const { prompt, llmType, geminiApiKey, resumeSessionId } = req.body;
      try {
        const buildId = await this.coordinator.startBuild(prompt, llmType, geminiApiKey, resumeSessionId);
        res.json({ buildId });
      } catch (error) {
        if (error instanceof Error && error.message === 'BUILD_BUSY') {
          res.status(409).json({ error: 'A build is already running' });
          return;
        }
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
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
      // ponytail: route the picker through System Events so a background node
      // process can present the GUI dialog; bare `choose folder` errors instantly.
      const appleScript = `osascript -e 'tell application "System Events" to POSIX path of (choose folder with prompt "Select Workspace Folder")'`;
      exec(appleScript, (error, stdout) => {
        if (error) {
          res.status(500).json({ error: 'Folder selection cancelled' });
        } else {
          res.json({ path: stdout.trim() });
        }
      });
    });

    // ===== Transcript API (reads from ~/.claude/projects/) =====

    this.app.get('/api/sessions', async (_request, response) => {
      try {
        const configuration = ConfigManager.load();
        if (!configuration.activeRepo) {
          response.json([]);
          return;
        }
        response.json(await matchSessions(configuration.activeRepo));
      } catch (error) {
        response.status(500).json({ error: String(error) });
      }
    });

    const validateTranscriptParams = (
      request: express.Request,
      response: express.Response
    ): { projectDir: string; sessionId: string } | null => {
      const params = validateProjectSession(request, response);
      if (!params) return null;
      const resolved = path.resolve(CLAUDE_DIR, params.projectDir);
      if (!resolved.startsWith(CLAUDE_DIR + path.sep)) {
        response.status(400).json({ error: 'invalid path' });
        return null;
      }
      return params;
    };

    this.app.get('/api/transcript', (request, response) => {
      const params = validateTranscriptParams(request, response);
      if (!params) return;
      const sessions = listSessions(params.projectDir);
      const session = sessions.find(entry => entry.sessionId === params.sessionId);
      if (!session) {
        response.status(404).json({ error: 'Session not found' });
        return;
      }
      response.json(readSession(session.filePath));
    });

    this.app.get('/api/usage', (request, response) => {
      const params = validateTranscriptParams(request, response);
      if (!params) return;
      const session = listSessions(params.projectDir).find(entry => entry.sessionId === params.sessionId);
      if (!session) {
        response.status(404).json({ error: 'Session not found' });
        return;
      }
      response.json(sessionUsage(session.filePath, params.projectDir, params.sessionId));
    });

    // ===== Subagent transcript API =====

    const validateSubagentParams = (
      request: express.Request,
      response: express.Response,
      requireAgent: boolean
    ): { projectDir: string; sessionId: string; agentId: string } | null => {
      const params = validateProjectSession(request, response);
      if (!params) return null;
      const agentId = request.query.agent as string;
      if (requireAgent && (typeof agentId !== 'string' || !AGENT_RE.test(agentId))) {
        response.status(400).json({ error: 'invalid agent parameter' });
        return null;
      }
      const targetPath = path.resolve(CLAUDE_DIR, params.projectDir, params.sessionId, 'subagents');
      if (!targetPath.startsWith(CLAUDE_DIR + path.sep)) {
        response.status(400).json({ error: 'invalid path' });
        return null;
      }
      return { ...params, agentId };
    };

    this.app.get('/api/subagents', (req, res) => {
      const params = validateSubagentParams(req, res, false);
      if (!params) return;
      res.json(listSubagents(params.projectDir, params.sessionId));
    });

    this.app.get('/api/subagent-transcript', (req, res) => {
      const params = validateSubagentParams(req, res, true);
      if (!params) return;
      const events = readSubagent(params.projectDir, params.sessionId, params.agentId);
      if (events === null) {
        res.status(404).json({ error: 'Subagent transcript not found' });
        return;
      }
      res.json(events);
    });

    // ===== Ruleset API (reads from project repo) =====

    this.app.get('/api/ruleset', (_request, response) => {
      const configuration = ConfigManager.load();
      if (!configuration.activeRepo) {
        response.json({ hooks: [], gates: [], claudeMd: null, claudeMdPath: null, projectPath: '', toolsPath: null });
        return;
      }
      try {
        response.json(readRuleset(configuration.activeRepo));
      } catch (error) {
        response.status(500).json({ error: String(error) });
      }
    });

    // ===== Filesystem Explorer API =====

    const sendFsError = (res: express.Response, e: unknown): void => {
      if (e instanceof PathDeniedError || (e as NodeJS.ErrnoException)?.code === 'EACCES') {
        res.status(403).json({ error: e instanceof Error ? e.message : String(e) });
      } else if (e instanceof NotFoundError || (e as NodeJS.ErrnoException)?.code === 'ENOENT') {
        res.status(404).json({ error: e instanceof Error ? e.message : String(e) });
      } else {
        res.status(500).json({ error: String(e) });
      }
    };

    this.app.get('/api/fs', (req, res) => {
      const targetPath = req.query.path as string;
      const showHidden = req.query.showHidden === 'true';
      try {
        res.json(listDir(targetPath, showHidden));
      } catch (e) {
        sendFsError(res, e);
      }
    });

    this.app.get('/api/fs/resolve-root', (req, res) => {
      const targetPath = req.query.path as string;
      try {
        res.json(resolveGitRoot(targetPath));
      } catch (e) {
        sendFsError(res, e);
      }
    });

    // Thin adapter over the version-control module. clampToHome + error
    // mapping happen inside getRepoInfo → resolveGitRoot (outside-$HOME → 403);
    // a valid in-sandbox dir degrades to nulls rather than 500.
    this.app.get('/api/repo-info', async (request, response) => {
      const targetPath = request.query.path as string;
      try {
        response.json(await getRepoInfo(targetPath));
      } catch (error) {
        sendFsError(response, error);
      }
    });

    this.app.post('/api/active-repo', (req, res) => {
      const rawPath = req.body?.path as string;
      const resolved = clampToHome(rawPath);
      if (resolved === null) {
        res.status(403).json({ error: 'Path denied' });
        return;
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        res.status(404).json({ error: 'Not a directory' });
        return;
      }
      const configuration = ConfigManager.load();
      configuration.activeRepo = resolved;
      ConfigManager.save(configuration);
      res.json({ activeRepo: resolved });
    });

    this.app.get('/api/active-repo', (_, res) => {
      const configuration = ConfigManager.load();
      res.json({ activeRepo: configuration.activeRepo ?? null });
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
    return new Promise((resolve, reject) => {
      // ws re-emits http-server errors on the WebSocketServer; without a
      // listener there, listen() failures crash as an unhandled 'error'
      // event "on WebSocketServer instance" instead of reaching reject.
      this.wsServer.on('error', () => {});
      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.error(
            `[Novakai Command Backend] Port ${this.port} is already in use — a stale dev backend is probably still running.\n` +
            `Free it with: lsof -ti:${this.port} | xargs kill`
          );
        }
        reject(error);
      });
      this.server.listen(this.port, '127.0.0.1', () => {
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
