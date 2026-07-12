import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export type TranscriptEvent =
  | { kind: 'user_text'; eventKey?: string; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; text: string }
  | { kind: 'assistant_text'; eventKey?: string; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; text: string }
  | { kind: 'assistant_thinking'; eventKey?: string; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; text: string }
  | { kind: 'tool_use'; eventKey?: string; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; tool: string; toolUseId: string; input: any; isAgentSpawn: boolean; agentDescription?: string; agentPrompt?: string; agentType?: string }
  | { kind: 'tool_result'; eventKey?: string; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; toolUseId: string; content: string; isError: boolean }
  | { kind: 'hook_event'; eventKey?: string; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; hookName: string; hookEvent: string; content: string; toolUseID: string }
  | { kind: 'system'; eventKey?: string; uuid: string; parentUuid: string | null; sessionId: string; ts: string; text: string; isSidechain: boolean; subtype?: string }
  | { kind: 'session_meta'; eventKey?: string; uuid: string; parentUuid: string | null; sessionId: string; ts: string; mode?: string; permissionMode?: string; summary?: string }
  | { kind: 'usage'; eventKey?: string; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; model: string; msgId: string; usage: TokenUsage };

/** Per-API-message token usage. One message.id can span multiple JSONL lines with identical usage — always dedupe by msgId. */
export interface TokenUsage {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

function parseTokenUsage(raw: any): TokenUsage {
  const totalWrite = raw.cache_creation_input_tokens || 0;
  const split = raw.cache_creation;
  return {
    input: raw.input_tokens || 0,
    // Older transcripts lack the 5m/1h split — bill the total as 5m (the cheaper multiplier's tier is the default TTL).
    cacheWrite5m: split ? (split.ephemeral_5m_input_tokens || 0) : totalWrite,
    cacheWrite1h: split ? (split.ephemeral_1h_input_tokens || 0) : 0,
    cacheRead: raw.cache_read_input_tokens || 0,
    output: raw.output_tokens || 0,
  };
}

/**
 * Stamp each event from a single JSONL line with a stable, unique eventKey so
 * the frontend can upsert instead of blindly appending. Keyed on the line's
 * uuid — unique per line, identical when the watcher re-emits the same line.
 * message.id must NOT lead here: one API message spans many lines (thinking,
 * text, tool_use blocks), so message.id#0 collides across distinct events.
 * Sibling blocks within one line get distinct indexes.
 */
export function stampEventKeys(rawLine: any, lineKey: string, events: TranscriptEvent[]): TranscriptEvent[] {
  const lineId = rawLine?.uuid ?? rawLine?.message?.id ?? `${rawLine?.sessionId || ''}:${lineKey}`;
  events.forEach((event, index) => { event.eventKey = `${lineId}#${index}`; });
  return events;
}

export const CLAUDE_DIR = path.join(process.env.HOME || '', '.claude', 'projects');

// Encode a cwd to Claude Code's project-dir name: '/' and '.' both become '-'.
// ponytail: covers normal repo paths; exotic chars (spaces) unhandled — add if a path needs it.
export function encodeCwd(cwdPath: string): string {
  return cwdPath.replace(/[/.]/g, '-');
}

export interface SessionMeta {
  sessionId: string;
  filePath: string;
  modified: number;     // mtime ms
  size: number;         // bytes
}

export interface SubagentMeta {
  agentId: string;        // "agent-a05912ddc6868417f" (filename minus .jsonl)
  agentType: string;
  description: string;
  toolUseId: string;
  spawnDepth: number;
  modified: number;       // mtime ms
  size: number;            // bytes
}

/**
 * List all sessions (JSONL files) for a given project folder.
 */
export function listSessions(projectDirName: string): SessionMeta[] {
  const projectPath = path.join(CLAUDE_DIR, projectDirName);
  if (!fs.existsSync(projectPath)) return [];
  return fs.readdirSync(projectPath)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      const filePath = path.join(projectPath, f);
      const stat = fs.statSync(filePath);
      return {
        sessionId: f.replace('.jsonl', ''),
        filePath,
        modified: stat.mtimeMs,
        size: stat.size,
      };
    })
    .sort((a, b) => b.modified - a.modified);
}

/**
 * Read and parse an entire session JSONL file into events.
 */
export function readSession(filePath: string): TranscriptEvent[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const events: TranscriptEvent[] = [];
  const lines = content.split('\n');
  let lastTs = '';
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (!lines[lineIndex].trim()) continue;
    try {
      const parsed = JSON.parse(lines[lineIndex]);
      if (parsed.timestamp) lastTs = parsed.timestamp;
      const lineKey = `${lineIndex}`;
      const parsedEvents = parseJsonlLine(parsed, lineKey, lastTs);
      if (parsedEvents) events.push(...stampEventKeys(parsed, lineKey, parsedEvents));
    } catch {
      // skip unparseable lines
    }
  }
  return events;
}

/**
 * List subagent transcripts spawned within a session.
 * Reads <CLAUDE_DIR>/<projectDirName>/<sessionId>/subagents/agent-*.jsonl,
 * pairing each with its sibling agent-*.meta.json (missing/corrupt meta
 * falls back to empty-string/0 fields but the agent is still listed).
 */
export function listSubagents(projectDirName: string, sessionId: string): SubagentMeta[] {
  const subagentsDir = path.join(CLAUDE_DIR, projectDirName, sessionId, 'subagents');
  if (!fs.existsSync(subagentsDir)) return [];
  return fs.readdirSync(subagentsDir)
    .filter(f => f.endsWith('.jsonl') && f.startsWith('agent-'))
    .map(f => {
      const agentId = f.replace('.jsonl', '');
      const jsonlPath = path.join(subagentsDir, f);
      const stat = fs.statSync(jsonlPath);
      let agentType = '';
      let description = '';
      let toolUseId = '';
      let spawnDepth = 0;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(subagentsDir, `${agentId}.meta.json`), 'utf8'));
        agentType = meta.agentType || '';
        description = meta.description || '';
        toolUseId = meta.toolUseId || '';
        spawnDepth = meta.spawnDepth || 0;
      } catch {
        // missing/corrupt meta.json -> fallbacks above
      }
      return { agentId, agentType, description, toolUseId, spawnDepth, modified: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => a.modified - b.modified);
}

/**
 * Read and parse a single subagent's JSONL transcript.
 * Returns null if the file does not exist.
 */
export function readSubagent(projectDirName: string, sessionId: string, agentId: string): TranscriptEvent[] | null {
  const jsonlPath = path.join(CLAUDE_DIR, projectDirName, sessionId, 'subagents', `${agentId}.jsonl`);
  if (!fs.existsSync(jsonlPath)) return null;
  return readSession(jsonlPath);
}

/**
 * Watch a specific session file for changes (appends).
 * Emits 'event' for each new parsed event, 'error' on failure.
 */
export class SessionWatcher extends EventEmitter {
  // Start from offset 0: a prompt written before the watcher attaches would
  // otherwise fall in the gap between the initial fetch and "start from end".
  // Replayed lines share eventKeys with the initial fetch, so the frontend
  // upsert dedupes the overlap.
  private lastSize = 0;
  private interval: NodeJS.Timeout | null = null;
  // Mirrors readSession's line index so uuid-less lines (mode, summary)
  // produce identical synthetic keys and dedupe too.
  private liveLineCount = 0;
  private lastTs = '';

  constructor(private filePath: string) {
    super();
  }

  start(): void {
    if (this.interval) return;
    // 100ms: claude -p cold-start dominates latency (~8s); keep display lag negligible.
    this.interval = setInterval(() => this.check(), 100);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private check(): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      return;
    }

    if (stat.size <= this.lastSize) {
      // File might have been truncated/recreated
      if (stat.size < this.lastSize) {
        this.lastSize = 0;
        this.liveLineCount = 0;
        this.lastTs = '';
      }
      return;
    }

    const start = this.lastSize;
    const stream = fs.createReadStream(this.filePath, {
      start,
      end: stat.size,
    });
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => {
      const data = Buffer.concat(chunks);
      // Only advance past complete lines; an in-progress final line (no
      // trailing '\n' yet) is left for the next poll so it isn't dropped.
      const lastNewline = data.lastIndexOf(0x0a);
      if (lastNewline === -1) return;
      const complete = data.subarray(0, lastNewline + 1);
      this.lastSize = start + complete.length;
      this.emitParsedLines(complete.toString('utf8'));
    });
    stream.on('error', (err) => {
      // An 'error' emit with no listener is fatal to the whole backend, and
      // most watch call sites only attach 'event' — don't let a transient
      // read failure (file swapped/deleted mid-poll) crash the process.
      if (this.listenerCount('error') > 0) this.emit('error', err);
      else console.error('[SessionWatcher] read error:', err);
    });
  }

  private emitParsedLines(buffer: string): void {
    // buffer always ends with '\n', so drop the trailing '' — but count blank
    // mid-file lines, exactly like readSession's lineIndex.
    const lines = buffer.split('\n');
    lines.pop();
    for (const line of lines) {
      const lineIndex = this.liveLineCount++;
      if (line.trim()) this.emitParsedLine(line, lineIndex);
    }
  }

  private emitParsedLine(line: string, lineIndex: number): void {
    try {
      const parsed = JSON.parse(line);
      if (parsed.timestamp) this.lastTs = parsed.timestamp;
      const lineKey = `${lineIndex}`;
      const events = parseJsonlLine(parsed, lineKey, this.lastTs);
      for (const event of stampEventKeys(parsed, lineKey, events ?? [])) this.emit('event', event);
    } catch {
      // partial line, skip
    }
  }
}

/**
 * Convert a raw JSONL line object into a typed TranscriptEvent.
 * Some line types (mode, permission-mode, summary) carry no uuid/timestamp:
 * lineKey gives them a stable unique uuid, lastTs the preceding event's time —
 * never a parse-time stamp, which made old events look freshly appended.
 */
export function parseJsonlLine(obj: any, lineKey: string, lastTs: string): TranscriptEvent[] | null {
  if (!obj || typeof obj !== 'object') return null;
  const type = obj.type;
  const sessionId = obj.sessionId || '';
  const uuid = obj.uuid || `${sessionId}:${lineKey}`;
  const parentUuid = obj.parentUuid || null;
  const ts = obj.timestamp || lastTs || new Date().toISOString();
  const isSidechain = obj.isSidechain || false;

  // Session metadata
  if (type === 'mode') {
    return [{ kind: 'session_meta', uuid, parentUuid, sessionId, ts, mode: obj.mode }];
  }
  if (type === 'permission-mode') {
    return [{ kind: 'session_meta', uuid, parentUuid, sessionId, ts, permissionMode: obj.permissionMode }];
  }
  if (type === 'summary') {
    return [{ kind: 'session_meta', uuid, parentUuid, sessionId, ts, summary: obj.summary }];
  }

  // Attachments (hooks, file references, etc.)
  if (type === 'attachment') {
    const att = obj.attachment || {};
    return [{
      kind: 'hook_event',
      uuid,
      parentUuid,
      sessionId,
      ts,
      isSidechain,
      hookName: att.hookName || '',
      hookEvent: att.hookEvent || att.type || '',
      content: att.content || '',
      toolUseID: att.toolUseID || '',
    }];
  }

  // System messages
  if (type === 'system') {
    const msg = obj.message;
    let text = typeof msg === 'string' ? msg : (msg?.content ?? '');
    if (!text && typeof obj.content === 'string') text = obj.content;            // away_summary
    if (!text && obj.subtype === 'turn_duration' && typeof obj.durationMs === 'number') {
      text = `turn: ${(obj.durationMs / 1000).toFixed(1)}s · ${obj.messageCount ?? 0} messages`;
    }
    // ponytail: unknown content-less subtypes render blank, not the string "undefined"
    return [{ kind: 'system', uuid, parentUuid, sessionId, ts, text, isSidechain, subtype: typeof obj.subtype === 'string' ? obj.subtype : undefined }];
  }

  // User / assistant messages
  if (type === 'user' || type === 'assistant') {
    const msg = obj.message || {};
    const role = msg.role || type;
    const content = msg.content;

    // Appended LAST so sibling block eventKeys (lineUuid#index) keep their
    // positional index stable; emitted even when the line has no renderable blocks.
    const usageEvent: TranscriptEvent | null = (type === 'assistant' && msg.usage)
      ? { kind: 'usage', uuid, parentUuid, sessionId, ts, isSidechain, model: msg.model || '', msgId: msg.id || uuid, usage: parseTokenUsage(msg.usage) }
      : null;

    // Tool result (user message with tool_result content)
    if (Array.isArray(content)) {
      const events: TranscriptEvent[] = [];
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;

        if (block.type === 'tool_result') {
          const resultContent = Array.isArray(block.content)
            ? block.content.map((c: any) => c.text || '').join('')
            : (typeof block.content === 'string' ? block.content : JSON.stringify(block.content));
          events.push({
            kind: 'tool_result',
            uuid,
            parentUuid,
            sessionId,
            ts,
            isSidechain,
            toolUseId: block.tool_use_id || '',
            content: resultContent,
            isError: block.is_error || false,
          });
        }

        if (block.type === 'tool_use') {
          const isAgentSpawn = block.name === 'Agent' || block.name === 'Task';
          const input = block.input || {};
          events.push({
            kind: 'tool_use',
            uuid,
            parentUuid,
            sessionId,
            ts,
            isSidechain,
            tool: block.name || 'unknown',
            toolUseId: block.id || '',
            input,
            isAgentSpawn,
            agentDescription: isAgentSpawn ? (input.description || '') : undefined,
            agentPrompt: isAgentSpawn ? (input.prompt || '') : undefined,
            agentType: isAgentSpawn ? (input.subagent_type || '') : undefined,
          });
        }

        if (block.type === 'thinking') {
          events.push({
            kind: 'assistant_thinking',
            uuid,
            parentUuid,
            sessionId,
            ts,
            isSidechain,
            text: block.thinking || '',
          });
        }

        if (block.type === 'text') {
          events.push({
            kind: role === 'assistant' ? 'assistant_text' : 'user_text',
            uuid,
            parentUuid,
            sessionId,
            ts,
            isSidechain,
            text: block.text || '',
          });
        }
      }
      if (usageEvent) events.push(usageEvent);
      return events.length > 0 ? events : null;
    }

    // Simple text content
    if (typeof content === 'string') {
      const events: TranscriptEvent[] = [{
        kind: role === 'assistant' ? 'assistant_text' : 'user_text',
        uuid,
        parentUuid,
        sessionId,
        ts,
        isSidechain,
        text: content,
      }];
      if (usageEvent) events.push(usageEvent);
      return events;
    }

    return usageEvent ? [usageEvent] : null;
  }

  return null;
}
