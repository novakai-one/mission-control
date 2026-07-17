import type { Express, Request, Response } from 'express';
import { DesignAdapter } from '../../design/adapter/index.js';
import { watchDesignData } from '../../design/watch/index.js';

/** HTTP adapter for Novakai Design prototypes: read-only projection of the
 * html-builder checkout's accepted revisions, plus 'design-event' ws frames
 * when a project's prototype.json marker swaps. */
export class DesignHub {
  private readonly adapter: DesignAdapter;

  constructor(
    broadcast: (event: string, payload: unknown) => void,
    adapter = new DesignAdapter(),
  ) {
    this.adapter = adapter;
    if (this.adapter.available()) {
      watchDesignData(this.adapter.watchRoots(), (projectId) => broadcast('design-event', { projectId }));
    }
  }

  registerRoutes(application: Express): void {
    application.get('/api/design/projects', (_request, response) => this.listProjects(response));
    application.get('/api/design/projects/:projectId', (request, response) => this.renderProject(request, response));
  }

  private async listProjects(response: Response): Promise<void> {
    if (!this.adapter.available()) {
      response.json({ available: false, projects: [] });
      return;
    }
    response.json({ available: true, projects: await this.adapter.listProjects() });
  }

  private async renderProject(request: Request, response: Response): Promise<void> {
    const render = await this.adapter.renderProject(request.params.projectId);
    if (!render) {
      response.status(404).json({ error: `unknown design project: ${request.params.projectId}` });
      return;
    }
    response.json(render);
  }
}
