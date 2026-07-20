// Durable mailbox registry (org rails, O11): mailbox identities load from a
// JSONL file instead of a code-static list, so a persistent role (a manager,
// a chief) gets a routable inbox without a code edit. Seeds chris + kimi on
// first run; the file is the source of truth from then on.
// Load-time semantics: first occurrence of a memberName wins, later duplicates
// are skipped with a warning; missing seeds are healed (appended), never fatal.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CHRIS_IDENTITY, KIMI_IDENTITY, isChannel, isRoom } from '../types.js';
import type { MailboxIdentity } from '../types.js';

/** Registering a memberName that already has a mailbox. */
export class MailboxConflictError extends Error {
  constructor(memberName: string) {
    super(`mailbox "${memberName}" already exists`);
  }
}

const SEEDS: readonly MailboxIdentity[] = [CHRIS_IDENTITY, KIMI_IDENTITY];

function isMailboxIdentity(value: unknown): value is MailboxIdentity {
  const entry = value as Partial<MailboxIdentity>;
  return typeof entry?.id === 'string'
    && typeof entry?.displayName === 'string'
    && typeof entry?.memberName === 'string'
    && (entry?.role === 'owner' || entry?.role === 'orchestrator')
    && Array.isArray(entry?.permissions);
}

export class MailboxRegistry {
  private readonly identities = new Map<string, MailboxIdentity>();

  /** Default path matches the other .novakai-command stores; pass '' for in-memory. */
  constructor(
    private readonly storePath = path.join(process.cwd(), '.novakai-command', 'mailboxes.jsonl'),
  ) {
    if (storePath && existsSync(storePath)) this.load();
    this.healSeeds();
  }

  /** Seeds only, no disk — for tests and in-process scratch rigs. */
  static inMemory(): MailboxRegistry {
    return new MailboxRegistry('');
  }

  private load(): void {
    for (const line of readFileSync(this.storePath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        this.addIdentity(JSON.parse(line), { persist: false });
      } catch {
        // torn line (writer mid-append) — skip, never block boot
      }
    }
  }

  private healSeeds(): void {
    for (const seed of SEEDS) {
      if (!this.identities.has(seed.memberName)) this.addIdentity(seed, { persist: true });
    }
  }

  private persistIdentity(identity: MailboxIdentity): void {
    if (!this.storePath) return;
    mkdirSync(path.dirname(this.storePath), { recursive: true });
    appendFileSync(this.storePath, `${JSON.stringify(identity)}\n`);
  }

  private addIdentity(identity: unknown, { persist }: { persist: boolean }): void {
    if (!isMailboxIdentity(identity)) throw new Error('invalid mailbox identity record');
    if (this.identities.has(identity.memberName)) {
      console.warn(`[mailboxes] duplicate memberName "${identity.memberName}" skipped (first wins)`);
      return;
    }
    this.identities.set(identity.memberName, identity);
    if (persist) this.persistIdentity(identity);
  }

  identityFor(memberName: string): MailboxIdentity | undefined {
    return this.identities.get(memberName);
  }

  list(): MailboxIdentity[] {
    return [...this.identities.values()];
  }

  /** Register a durable orchestrator mailbox. Conflicts are loud (409 upstream). */
  register(input: { displayName: string; memberName: string }): MailboxIdentity {
    const displayName = input.displayName?.trim();
    const memberName = input.memberName?.trim();
    if (!displayName || !memberName) throw new Error('displayName and memberName must be non-empty strings');
    if (isChannel(memberName) || isRoom(memberName)) {
      throw new Error(`memberName "${memberName}" collides with channel/room addressing`);
    }
    if (this.identities.has(memberName)) throw new MailboxConflictError(memberName);
    const identity: MailboxIdentity = {
      id: `orchestrator:${memberName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      displayName,
      memberName,
      role: 'orchestrator',
      permissions: ['messages:send'],
    };
    this.identities.set(memberName, identity);
    this.persistIdentity(identity);
    return identity;
  }
}
