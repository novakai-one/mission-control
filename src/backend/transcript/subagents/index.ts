// Live-tails a session's subagents/ dir: discovers agent-*.jsonl files as
// they appear (the dir doesn't exist until the first subagent spawns) and
// tails each one, reusing SessionWatcher's stat-poll/partial-line-safe
// tailing + eventKey stamping rather than reimplementing it.
import nodeFs from 'node:fs';
import path from 'node:path';
import { CLAUDE_DIR, SessionWatcher, type TranscriptEvent } from '../parser.js';

export interface SubagentSummary {
  subagentId: string;
  agentType: string;
  description: string;
  toolUseId: string;
  spawnDepth: number;
}

type SubagentFields = Omit<SubagentSummary, 'subagentId'>;

const EMPTY_FIELDS: SubagentFields = { agentType: '', description: '', toolUseId: '', spawnDepth: 0 };

function readMetaFields(subagentsDir: string, subagentId: string): SubagentFields {
  try {
    const metaPath = path.join(subagentsDir, `${subagentId}.meta.json`);
    const parsed = JSON.parse(nodeFs.readFileSync(metaPath, 'utf8'));
    return {
      agentType: parsed.agentType || '',
      description: parsed.description || '',
      toolUseId: parsed.toolUseId || '',
      spawnDepth: parsed.spawnDepth || 0,
    };
  } catch {
    return EMPTY_FIELDS; // missing/corrupt meta.json -> fallback fields
  }
}

export class SubagentWatcher {
  private timer: NodeJS.Timeout | null = null;
  private tails = new Map<string, SessionWatcher>();
  private known = new Map<string, string>(); // subagentId -> serialized SubagentFields
  private readonly subagentsDir: string;

  // rootOverride: test seam to point at a fixture dir instead of CLAUDE_DIR.
  constructor(
    private projectDir: string,
    private sessionId: string,
    private emit: (message: object) => void,
    rootOverride?: string,
  ) {
    this.subagentsDir = path.join(rootOverride ?? CLAUDE_DIR, projectDir, sessionId, 'subagents');
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), 500);
    this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const tail of this.tails.values()) tail.stop();
    this.tails.clear();
  }

  private poll(): void {
    const fileNames = this.listAgentFiles();
    let changed = false;
    for (const fileName of fileNames) {
      const subagentId = fileName.replace('.jsonl', '');
      if (this.refreshMeta(subagentId)) changed = true;
      if (!this.tails.has(subagentId)) this.startTail(subagentId, fileName);
    }
    if (changed) this.emitSummaries();
  }

  private listAgentFiles(): string[] {
    try {
      return nodeFs.readdirSync(this.subagentsDir)
        .filter((fileName) => fileName.endsWith('.jsonl') && fileName.startsWith('agent-'));
    } catch {
      return []; // subagents/ doesn't exist yet — tolerate forever
    }
  }

  private refreshMeta(subagentId: string): boolean {
    const fields = readMetaFields(this.subagentsDir, subagentId);
    const serialized = JSON.stringify(fields);
    if (this.known.get(subagentId) === serialized) return false;
    this.known.set(subagentId, serialized);
    return true;
  }

  private startTail(subagentId: string, fileName: string): void {
    const tail = new SessionWatcher(path.join(this.subagentsDir, fileName));
    tail.on('event', (event: TranscriptEvent) => {
      this.emit({ type: 'subagent-event', sessionId: this.sessionId, subagentId, event });
    });
    tail.start();
    this.tails.set(subagentId, tail);
  }

  private emitSummaries(): void {
    const subagents: SubagentSummary[] = [...this.known.entries()].map(([subagentId, serialized]) => ({
      subagentId,
      ...JSON.parse(serialized),
    }));
    this.emit({ type: 'subagents-changed', sessionId: this.sessionId, subagents });
  }
}
