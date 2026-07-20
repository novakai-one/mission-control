// transcripts.mjs — locate and read provider session transcripts.
// Single responsibility: given a roster agent ({provider, sessionId, projectDir}),
// find its on-disk transcript and normalize its events into user turns and
// assistant texts. No delivery, no process checks — those live elsewhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Read a JSONL file tolerantly: torn/trailing lines are skipped, never fatal. */
export function readEvents(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // torn line (writer mid-append) — ignore
    }
  }
  return events;
}

function readJsonl(filePath) {
  return readEvents(filePath);
}

/** kimi: session_index.jsonl maps sessionId -> sessionDir; wire lives below it. */
export function findKimiTranscript(sessionId, home = os.homedir()) {
  if (!sessionId) return null;
  const index = path.join(home, '.kimi-code', 'session_index.jsonl');
  for (const entry of readJsonl(index)) {
    if (entry.sessionId === sessionId && typeof entry.sessionDir === 'string') {
      const wire = path.join(entry.sessionDir, 'agents', 'main', 'wire.jsonl');
      return fs.existsSync(wire) ? wire : null;
    }
  }
  return null;
}

/** claude: one JSONL per session under the project-slug directory. */
export function findClaudeTranscript(agent, home = os.homedir()) {
  if (!agent.sessionId || !agent.projectDir) return null;
  const file = path.join(home, '.claude', 'projects', agent.projectDir, `${agent.sessionId}.jsonl`);
  return fs.existsSync(file) ? file : null;
}

function walkFiles(root, limit = 4000) {
  const out = [];
  const stack = [root];
  while (stack.length > 0 && out.length < limit) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

/** codex: rollout-<ts>-<sessionId>.jsonl under sessions/ (or archived_sessions/). */
export function findCodexTranscript(sessionId, home = os.homedir()) {
  if (!sessionId) return null;
  for (const rootName of ['sessions', 'archived_sessions']) {
    const root = path.join(home, '.codex', rootName);
    if (!fs.existsSync(root)) continue;
    const match = walkFiles(root).find((file) => file.endsWith(`${sessionId}.jsonl`));
    if (match) return match;
  }
  return null;
}

/** Locate the transcript for a roster agent. Returns a path or null (honest). */
export function locateTranscript(agent, { home = os.homedir() } = {}) {
  switch (agent.provider) {
    case 'kimi': return findKimiTranscript(agent.sessionId, home);
    case 'claude': return findClaudeTranscript(agent, home);
    case 'codex': return findCodexTranscript(agent.sessionId, home);
    default: return null;
  }
}

function eventTime(event) {
  return typeof event?.time === 'number' ? event.time : null;
}

/** Normalized user turns: [{ text, time }]. Claude tool_result arrays are NOT
 * user turns — filtering string content only avoids false-confirming on tool
 * output that echoes the marker (e.g. an agent reading its own logs). */
export function userTurns(events, provider) {
  const turns = [];
  for (const event of events) {
    if (provider === 'kimi' && event.type === 'turn.prompt' && Array.isArray(event.input)) {
      const text = event.input.filter((part) => part?.type === 'text').map((part) => part.text).join('');
      if (text) turns.push({ text, time: eventTime(event) });
    } else if (provider === 'claude' && event.type === 'user' && typeof event.message?.content === 'string') {
      turns.push({ text: event.message.content, time: eventTime(event) });
    } else if (provider === 'codex' && event.type === 'response_item'
      && event.payload?.type === 'message' && event.payload?.role === 'user'
      && Array.isArray(event.payload?.content)) {
      const text = event.payload.content
        .filter((part) => part?.type === 'input_text')
        .map((part) => part.text)
        .join('');
      if (text) turns.push({ text, time: eventTime(event) });
    }
  }
  return turns;
}

/** Normalized assistant texts: [{ text, time }] — the "latest useful message". */
export function assistantTexts(events, provider) {
  const texts = [];
  for (const event of events) {
    if (provider === 'kimi' && event.type === 'context.append_loop_event'
      && event.event?.type === 'content.part' && event.event?.part?.type === 'text') {
      texts.push({ text: event.event.part.text, time: eventTime(event) });
    } else if (provider === 'claude' && event.type === 'assistant' && Array.isArray(event.message?.content)) {
      for (const part of event.message.content) {
        if (part?.type === 'text' && part.text) texts.push({ text: part.text, time: eventTime(event) });
      }
    } else if (provider === 'codex' && event.type === 'response_item'
      && event.payload?.type === 'message' && event.payload?.role === 'assistant'
      && Array.isArray(event.payload?.content)) {
      const text = event.payload.content
        .filter((part) => part?.type === 'output_text')
        .map((part) => part.text)
        .join('');
      if (text) texts.push({ text, time: eventTime(event) });
    }
  }
  return texts;
}
