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
import { listProjects, listSessions, readSession, decodeProjectDir, SessionWatcher, listSubagents, readSubagent, CLAUDE_DIR } from '../transcript/parser.js';
import { readRuleset } from '../ruleset/reader.js';
import { listDir, resolveGitRoot, clampToHome, PathDeniedError, NotFoundError } from '../fs/explorer.js';

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

      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'watch-session' && msg.project && msg.session) {
            this.startSessionWatch(socket, msg.project, msg.session);
          }
        } catch {
          // ignore malformed messages
        }
      });

      socket.on('close', () => {
        this.activeSockets.delete(socket);
      });
    });
  }

  private activeWatchers = new Map<WebSocket, SessionWatcher>();

  private startSessionWatch(socket: WebSocket, projectDir: string, sessionId: string): void {
    // Stop any existing watcher for this socket
    const existing = this.activeWatchers.get(socket);
    if (existing) {
      existing.stop();
      this.activeWatchers.delete(socket);
    }

    const sessions = listSessions(projectDir);
    const session = sessions.find(s => s.sessionId === sessionId);
    if (!session) return;

    const watcher = new SessionWatcher(session.filePath);
    watcher.on('event', (event) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event: 'transcript-event', payload: event }));
      }
    });
    watcher.start();
    this.activeWatchers.set(socket, watcher);

    socket.send(JSON.stringify({ event: 'watch-started', payload: { project: projectDir, session: sessionId } }));
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

    this.app.get('/api/projects', (_, res) => {
      const projects = listProjects().map(name => ({
        dirName: name,
        displayPath: decodeProjectDir(name),
      }));
      res.json(projects);
    });

    this.app.get('/api/sessions', (req, res) => {
      const projectDir = req.query.project as string;
      if (!projectDir) {
        res.status(400).json({ error: 'project parameter required' });
        return;
      }
      const sessions = listSessions(projectDir);
      res.json(sessions);
    });

    this.app.get('/api/transcript', (req, res) => {
      const projectDir = req.query.project as string;
      const sessionId = req.query.session as string;
      if (!projectDir || !sessionId) {
        res.status(400).json({ error: 'project and session parameters required' });
        return;
      }
      const sessions = listSessions(projectDir);
      const session = sessions.find(s => s.sessionId === sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      const events = readSession(session.filePath);
      res.json(events);
    });

    // ===== Subagent transcript API =====

    const PROJECT_RE = /^[A-Za-z0-9._-]+$/;
    const SESSION_RE = /^[A-Za-z0-9-]+$/;
    const AGENT_RE = /^agent-[A-Za-z0-9]+$/;

    const validateSubagentParams = (
      req: express.Request,
      res: express.Response,
      requireAgent: boolean
    ): { projectDir: string; sessionId: string; agentId: string } | null => {
      const projectDir = req.query.project as string;
      const sessionId = req.query.session as string;
      const agentId = req.query.agent as string;
      if (!projectDir || !PROJECT_RE.test(projectDir) || projectDir === '.' || projectDir === '..') {
        res.status(400).json({ error: 'invalid project parameter' });
        return null;
      }
      if (!sessionId || !SESSION_RE.test(sessionId)) {
        res.status(400).json({ error: 'invalid session parameter' });
        return null;
      }
      if (requireAgent && (!agentId || !AGENT_RE.test(agentId))) {
        res.status(400).json({ error: 'invalid agent parameter' });
        return null;
      }
      const targetPath = path.resolve(CLAUDE_DIR, projectDir, sessionId, 'subagents');
      if (!targetPath.startsWith(CLAUDE_DIR + path.sep)) {
        res.status(400).json({ error: 'invalid path' });
        return null;
      }
      return { projectDir, sessionId, agentId };
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

    this.app.get('/api/ruleset', (req, res) => {
      const projectDir = req.query.project as string;
      if (!projectDir) {
        res.status(400).json({ error: 'project parameter required' });
        return;
      }
      try {
        const data = readRuleset(projectDir);
        res.json(data);
      } catch (e) {
        res.status(500).json({ error: String(e) });
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
