import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

interface CodexSessionMetadata {
  id: string;
  cwd: string;
}

function sessionFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const pending = [root];
  const files: string[] = [];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.name.endsWith('.jsonl')) files.push(candidate);
    }
  }
  return files;
}

function sessionMetadata(filePath: string): CodexSessionMetadata | null {
  try {
    const firstLine = readFileSync(filePath, 'utf8').split('\n', 1)[0];
    if (!firstLine) return null;
    const line = JSON.parse(firstLine) as { payload?: Record<string, unknown> };
    const payload = line.payload;
    const id = payload?.session_id ?? payload?.id;
    return typeof id === 'string' && typeof payload?.cwd === 'string'
      ? { id, cwd: payload.cwd }
      : null;
  } catch {
    return null;
  }
}

/** Discovers the provider-owned rollout created by a new Codex TUI process. */
export class CodexSessionLocator {
  constructor(
    private readonly sessionsRoot = path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'sessions'),
    private readonly pollMs = 100,
    private readonly timeoutMs = 15_000,
  ) {}

  snapshot(): Set<string> {
    return new Set(sessionFiles(this.sessionsRoot));
  }

  async waitForNew(cwd: string, known: Set<string>, startedAt: number): Promise<string> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() <= deadline) {
      const match = sessionFiles(this.sessionsRoot)
        .filter((filePath) => !known.has(filePath) && statSync(filePath).mtimeMs >= startedAt)
        .map((filePath) => ({ filePath, metadata: sessionMetadata(filePath) }))
        .filter((entry) => entry.metadata?.cwd === cwd)
        .sort((first, second) => statSync(first.filePath).mtimeMs - statSync(second.filePath).mtimeMs)[0];
      if (match?.metadata) return match.metadata.id;
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    throw new Error(`Codex started, but its saved session was not discovered for ${cwd}`);
  }
}
