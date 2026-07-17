import type { Express, Request, Response } from 'express';
import { CanvasStore, StaleRevisionError } from '../../canvas/store/index.js';
import { watchCanvasData } from '../../canvas/watch/index.js';

/** HTTP adapter for the canvas architecture documents. Serves the same
 * GET/PUT + revision-CAS contract as Novakai Canvas's dev bridge so the
 * ./canvas CLI and the studio view stay coherent; external file writes are
 * pushed to clients as 'canvas-event' ws frames. */
export class CanvasHub {
  private readonly store: CanvasStore;

  constructor(
    broadcast: (event: string, payload: unknown) => void,
    store = new CanvasStore(),
  ) {
    this.store = store;
    if (this.store.available()) {
      watchCanvasData(this.store, (fileName) => broadcast('canvas-event', { path: fileName }));
    }
  }

  registerRoutes(application: Express): void {
    application.get('/api/canvas/architecture', (_request, response) => this.getArchitecture(response));
    application.put('/api/canvas/architecture', (request, response) => this.putArchitecture(request, response));
    application.get('/api/canvas/preferences', (_request, response) => this.getPreferences(response));
    application.put('/api/canvas/preferences', (request, response) => this.putPreferences(request, response));
  }

  private async getArchitecture(response: Response): Promise<void> {
    response.json(await this.store.loadArchitecture());
  }

  private async getPreferences(response: Response): Promise<void> {
    response.json(await this.store.loadPreferences());
  }

  private async putArchitecture(request: Request, response: Response): Promise<void> {
    try {
      await this.store.saveArchitecture(request.body);
      response.status(204).end();
    } catch (error) {
      if (error instanceof StaleRevisionError) {
        response.status(409).json({ error: 'stale revision', disk: error.diskRevision });
        return;
      }
      response.status(400).json({ error: error instanceof Error ? error.message : 'invalid document' });
    }
  }

  private async putPreferences(request: Request, response: Response): Promise<void> {
    try {
      await this.store.savePreferences(request.body);
      response.status(204).end();
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'invalid preferences' });
    }
  }
}
