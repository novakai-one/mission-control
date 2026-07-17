// SessionBroker — the application core. Get-or-create one isolated browser per
// session id, persisted to a JSON registry so ephemeral CLI processes reconnect
// across runs. Contention is eliminated by partition (one session ⇢ one
// instance), not by locking a shared tab. Impure work (spawning Chrome) lives
// behind the injected BrowserProvider port.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isLeaseExpired, leaseExpiresAt } from './lease.js';
import { decideAllocation } from './policy.js';
import type { BrowserInstance, LaunchSpec, Session, SessionHandle } from './types.js';

/** Port the broker depends on for the impure browser lifecycle. */
export interface BrowserProvider {
  launch(spec: LaunchSpec): Promise<BrowserInstance>;
  dispose(instance: BrowserInstance): Promise<void>;
}

export interface BrokerDeps {
  provider: BrowserProvider;
  /** Directory holding one JSON file per session. One-file-per-session keeps
   *  concurrent CLI processes for different sessions from clobbering each other. */
  registryDir: string;
  now?: () => Date;
  ttlMs?: number;
  isAlive?: (pid: number) => boolean;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class SessionBroker {
  private readonly provider: BrowserProvider;
  private readonly registryDir: string;
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly isAlive: (pid: number) => boolean;
  private sessions = new Map<string, Session>();

  constructor(deps: BrokerDeps) {
    this.provider = deps.provider;
    this.registryDir = deps.registryDir;
    this.now = deps.now ?? (() => new Date());
    this.ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
    this.isAlive = deps.isAlive ?? defaultIsAlive;
    this.load();
  }

  /** Get the agent's session, creating (or replacing a stale) one as needed. */
  async acquire(sessionId: string, agentId: string): Promise<SessionHandle> {
    await this.sweep();
    const existing = this.sessions.get(sessionId);
    const alive = existing ? this.isAlive(existing.instance.pid) : false;
    const decision = decideAllocation(existing, alive, this.now());

    if (decision.kind === 'reuse' && decision.session) {
      const renewed: Session = { ...decision.session, leaseExpiresAt: leaseExpiresAt(this.now(), this.ttlMs) };
      this.sessions.set(sessionId, renewed);
      this.persist(renewed);
      return this.toHandle(renewed);
    }

    if (existing) {
      await this.provider.dispose(existing.instance);
    }
    const instance = await this.provider.launch({ headless: true });
    const session: Session = {
      sessionId,
      agentId,
      instance,
      status: 'active',
      leaseExpiresAt: leaseExpiresAt(this.now(), this.ttlMs),
    };
    this.sessions.set(sessionId, session);
    this.persist(session);
    return this.toHandle(session);
  }

  /** Explicitly tear down a session and free its instance. */
  async release(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    await this.provider.dispose(session.instance);
    this.sessions.delete(sessionId);
    this.forget(sessionId);
  }

  /** Reclaim every expired or dead session's instance. */
  async sweep(): Promise<void> {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (isLeaseExpired(session, now) || !this.isAlive(session.instance.pid)) {
        await this.provider.dispose(session.instance);
        this.sessions.delete(id);
        this.forget(id);
      }
    }
  }

  /** Live roster — the seam a future mirror viewer consumes. */
  list(): SessionHandle[] {
    return [...this.sessions.values()].map((s) => this.toHandle(s));
  }

  /** Record the last URL a session navigated to (keeps handles useful). */
  record(sessionId: string, url: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.lastUrl = url;
    this.persist(session);
  }

  private toHandle(session: Session): SessionHandle {
    return { sessionId: session.sessionId, cdpEndpoint: session.instance.cdpEndpoint, pageUrl: session.lastUrl ?? null };
  }

  private sessionFile(sessionId: string): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.registryDir, `${safe}.json`);
  }

  private load(): void {
    if (!existsSync(this.registryDir)) return;
    for (const file of readdirSync(this.registryDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const session = JSON.parse(readFileSync(path.join(this.registryDir, file), 'utf8')) as Session;
        this.sessions.set(session.sessionId, session);
      } catch {
        // skip a corrupt entry rather than fail the whole load
      }
    }
  }

  private persist(session: Session): void {
    mkdirSync(this.registryDir, { recursive: true });
    writeFileSync(this.sessionFile(session.sessionId), JSON.stringify(session, null, 2));
  }

  private forget(sessionId: string): void {
    rmSync(this.sessionFile(sessionId), { force: true });
  }
}
