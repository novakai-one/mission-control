import { existsSync, statSync } from 'node:fs';
import type { Express, Request, Response } from 'express';
import { AnalyticsRunner } from '../../analytics/runner/index.js';
import { AnalyticsStore } from '../../analytics/store/index.js';
import { clampToHome } from '../../fs/explorer.js';

/** HTTP adapter for the Analytics lens. Runs the sibling Novakai-Analytics
 * analyzer as an async job (POST /run), serves its persisted output verbatim
 * (GET /latest), and pushes run lifecycle to clients as 'analytics-event'
 * ws frames. The analyzer's data and CLI stay untouched. */
export class AnalyticsHub {
  private readonly store: AnalyticsStore;
  private readonly runner: AnalyticsRunner;

  constructor(
    broadcast: (event: string, payload: unknown) => void,
    store = new AnalyticsStore(),
    runner?: AnalyticsRunner,
  ) {
    this.store = store;
    this.runner = runner ?? new AnalyticsRunner((event) => broadcast('analytics-event', event));
  }

  registerRoutes(application: Express): void {
    application.post('/api/analytics/run', (request, response) => this.postRun(request, response));
    application.get('/api/analytics/latest', (request, response) => this.getLatest(request, response));
  }

  /** Validates the target the same way /api/active-repo does: a real
   * directory inside $HOME. Rejects a second concurrent run per repo. */
  private validRepoPath(request: Request, response: Response): string | null {
    const rawPath: unknown = request.method === 'GET' ? request.query.repoPath : request.body?.repoPath;
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      response.status(400).json({ error: 'repoPath required' });
      return null;
    }
    const resolved = clampToHome(rawPath);
    if (resolved === null) {
      response.status(403).json({ error: 'path denied' });
      return null;
    }
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      response.status(404).json({ error: 'not a directory' });
      return null;
    }
    return resolved;
  }

  private postRun(request: Request, response: Response): void {
    const repoPath = this.validRepoPath(request, response);
    if (repoPath === null) return;
    const started = this.runner.start(repoPath);
    if (started === null) {
      response.status(409).json({ error: 'a run is already in flight for this repo' });
      return;
    }
    response.status(202).json(started);
  }

  private async getLatest(request: Request, response: Response): Promise<void> {
    const repoPath = this.validRepoPath(request, response);
    if (repoPath === null) return;
    response.json(await this.store.loadLatest(repoPath, this.runner.isRunning(repoPath)));
  }
}
