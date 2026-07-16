import type { Express, Request, Response } from 'express';
import type { SessionReference } from '../../../shared/project/schema.js';
import { ProjectStore } from '../../project/persistence/store.js';
import { ProjectService } from '../../project/service/service.js';
import { ClaudeSessionSource } from '../../provider/claude/source.js';
import { CodexSessionSource } from '../../provider/codex/source.js';
import { ThreadProjector } from '../../thread/projection/projector.js';

function sessionReference(body: unknown): SessionReference {
  if (!body || typeof body !== 'object') throw new Error('session reference is required');
  const input = body as Record<string, unknown>;
  if (input.provider !== 'claude' && input.provider !== 'codex') {
    throw new Error('provider must be claude or codex');
  }
  if (typeof input.sessionId !== 'string' || !input.sessionId.trim()) {
    throw new Error('sessionId is required');
  }
  if (input.cwd !== undefined && typeof input.cwd !== 'string') {
    throw new Error('cwd must be a string');
  }
  return {
    provider: input.provider,
    sessionId: input.sessionId.trim(),
    ...(input.cwd ? { cwd: input.cwd } : {}),
  };
}

function requiredBodyText(request: Request, field: string): string {
  const value = request.body?.[field];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value;
}

function sendError(response: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const notFound = message.includes('not found:');
  response.status(notFound ? 404 : 400).json({ error: message });
}

/** HTTP adapter for project, thread, and provider-session operations. */
export class ProjectsHub {
  private readonly projects: ProjectService;
  private readonly projector: ThreadProjector;

  constructor(store = new ProjectStore()) {
    this.projects = new ProjectService(store);
    this.projector = new ThreadProjector({
      claude: new ClaudeSessionSource(),
      codex: new CodexSessionSource(),
    });
  }

  /** Register the complete project workspace route surface. */
  registerRoutes(application: Express): void {
    application.get('/api/projects', (_request, response) => response.json({ projects: this.projects.list() }));
    application.post('/api/projects', (request, response) => this.createProject(request, response));
    application.get('/api/projects/:projectId', (request, response) => this.getProject(request, response));
    application.post('/api/projects/:projectId/threads', (request, response) => this.createThread(request, response));
    application.post('/api/projects/:projectId/threads/:threadId/select', (request, response) => this.selectThread(request, response));
    application.post('/api/projects/:projectId/threads/:threadId/sessions', (request, response) => this.attachSession(request, response));
    application.get('/api/projects/:projectId/threads/:threadId/events', (request, response) => this.getEvents(request, response));
  }

  private createProject(request: Request, response: Response): void {
    try {
      const project = this.projects.create({
        name: requiredBodyText(request, 'name'),
        rootPath: requiredBodyText(request, 'rootPath'),
      });
      response.status(201).json(project);
    } catch (error) {
      sendError(response, error);
    }
  }

  private getProject(request: Request, response: Response): void {
    try {
      response.json(this.projects.getProject(request.params.projectId));
    } catch (error) {
      sendError(response, error);
    }
  }

  private createThread(request: Request, response: Response): void {
    try {
      const project = this.projects.createThread(
        request.params.projectId,
        requiredBodyText(request, 'title'),
      );
      response.status(201).json(project);
    } catch (error) {
      sendError(response, error);
    }
  }

  private selectThread(request: Request, response: Response): void {
    try {
      response.json(this.projects.selectThread(request.params.projectId, request.params.threadId));
    } catch (error) {
      sendError(response, error);
    }
  }

  private attachSession(request: Request, response: Response): void {
    try {
      response.json(this.projects.attachSession(
        request.params.projectId,
        request.params.threadId,
        sessionReference(request.body),
      ));
    } catch (error) {
      sendError(response, error);
    }
  }

  private getEvents(request: Request, response: Response): void {
    try {
      const project = this.projects.getProject(request.params.projectId);
      response.json(this.projector.build(project, request.params.threadId));
    } catch (error) {
      sendError(response, error);
    }
  }
}
