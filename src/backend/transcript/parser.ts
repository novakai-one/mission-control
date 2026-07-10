import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export type TranscriptEvent =
  | { kind: 'user_text'; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; text: string }
  | { kind: 'assistant_text'; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; text: string }
  | { kind: 'assistant_thinking'; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; text: string }
  | { kind: 'tool_use'; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; tool: string; toolUseId: string; input: any; isAgentSpawn: boolean; agentDescription?: string; agentPrompt?: string; agentType?: string }
  | { kind: 'tool_result'; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; toolUseId: string; content: string; isError: boolean }
  | { kind: 'hook_event'; uuid: string; parentUuid: string | null; sessionId: string; ts: string; isSidechain: boolean; hookName: string; hookEvent: string; content: string; toolUseID: string }
  | { kind: 'system'; uuid: string; parentUuid: string | null; sessionId: string; ts: string; text: string; isSidechain: boolean }
  | { kind: 'session_meta'; uuid: string; parentUuid: string | null; sessionId: string; ts: string; mode?: string; permissionMode?: string; summary?: string };

export const CLAUDE_DIR = path.join(process.env.HOME || '', '.claude', 'projects');

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
      const parsedEvents = parseJsonlLine(parsed, `${lineIndex}`, lastTs);
      if (parsedEvents) events.push(...parsedEvents);
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
  private lastSize = 0;
  private interval: NodeJS.Timeout | null = null;
  // 'live:' namespace keeps synthetic uuids from colliding with the initial
  // fetch's line-index-based uuids for the same file.
  private liveLineCount = 0;
  private lastTs = '';

  constructor(private filePath: string) {
    super();
    // Start from end of file
    try {
      this.lastSize = fs.statSync(filePath).size;
    } catch {
      this.lastSize = 0;
    }
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.check(), 500);
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

    const stream = fs.createReadStream(this.filePath, {
      start: this.lastSize,
      end: stat.size,
    });
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
    });
    stream.on('end', () => {
      this.lastSize = stat.size;
      this.emitParsedLines(buffer);
    });
    stream.on('error', (err) => this.emit('error', err));
  }

  private emitParsedLines(buffer: string): void {
    for (const line of buffer.split('\n')) {
      if (line.trim()) this.emitParsedLine(line);
    }
  }

  private emitParsedLine(line: string): void {
    try {
      const parsed = JSON.parse(line);
      if (parsed.timestamp) this.lastTs = parsed.timestamp;
      const events = parseJsonlLine(parsed, `live:${this.liveLineCount++}`, this.lastTs);
      for (const ev of events ?? []) this.emit('event', ev);
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
function parseJsonlLine(obj: any, lineKey: string, lastTs: string): TranscriptEvent[] | null {
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
    const text = typeof msg === 'string' ? msg : (msg?.content || JSON.stringify(msg));
    return [{ kind: 'system', uuid, parentUuid, sessionId, ts, text, isSidechain }];
  }

  // User / assistant messages
  if (type === 'user' || type === 'assistant') {
    const msg = obj.message || {};
    const role = msg.role || type;
    const content = msg.content;

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
      return events.length > 0 ? events : null;
    }

    // Simple text content
    if (typeof content === 'string') {
      return [{
        kind: role === 'assistant' ? 'assistant_text' : 'user_text',
        uuid,
        parentUuid,
        sessionId,
        ts,
        isSidechain,
        text: content,
      }];
    }
  }

  return null;
}
