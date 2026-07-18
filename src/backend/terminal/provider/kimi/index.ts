// Kimi session discovery (messaging rework task 5), mirroring
// codexDiscovery.ts. The kimi CLI indexes every session it opens in
// ~/.kimi-code/session_index.jsonl — append-only, one JSON object per line:
// {"sessionId":"session_<uuid>","sessionDir":...,"workDir":...}. We snapshot
// the known ids before spawn and wait for a new line whose workDir equals
// the spawn cwd. If the index lags or the shape changes, discovery times
// out and fails the spawn loudly — the same contract as CodexSessionLocator.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

interface KimiSessionEntry {
  sessionId: string;
  workDir: string;
}

function readEntries(indexPath: string): KimiSessionEntry[] {
  if (!existsSync(indexPath)) return [];
  const entries: KimiSessionEntry[] = [];
  for (const line of readFileSync(indexPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as { sessionId?: unknown; workDir?: unknown };
      if (typeof parsed.sessionId === 'string' && typeof parsed.workDir === 'string') {
        entries.push({ sessionId: parsed.sessionId, workDir: parsed.workDir });
      }
    } catch {
      // a torn index line never blocks discovery
    }
  }
  return entries;
}

/** Discovers the session a newly spawned Kimi TUI registers in the CLI's session index. */
export class KimiSessionLocator {
  private cancelReason: string | null = null;

  constructor(
    private readonly indexPath = path.join(homedir(), '.kimi-code', 'session_index.jsonl'),
    private readonly pollMs = 100,
    private readonly timeoutMs = 300_000,
  ) {}

  snapshot(): Set<string> {
    return new Set(readEntries(this.indexPath).map((entry) => entry.sessionId));
  }

  /** Stop a pending waitForNew, rejecting it with the given reason. */
  cancel(reason = 'Kimi session discovery cancelled'): void {
    this.cancelReason = reason;
  }

  async waitForNew(cwd: string, known: Set<string>): Promise<string> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() <= deadline) {
      if (this.cancelReason) throw new Error(this.cancelReason);
      const match = readEntries(this.indexPath)
        .find((entry) => !known.has(entry.sessionId) && entry.workDir === cwd);
      if (match) return match.sessionId;
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    throw new Error(`Kimi started, but its session was not discovered for ${cwd}`);
  }
}
