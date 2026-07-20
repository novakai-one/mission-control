// nvk watchdog — agent-activity monitor (Chris ask via Message Man, 2026-07-17).
//
//   node scripts/nvk-watchdog.mjs tick    one pass, print events
//   node scripts/nvk-watchdog.mjs watch   loop forever on config interval
//
// Liveness = transcript mtime per seat (never the roster's status field —
// stale registrations lie). Boundaries live in .novakai-command/watchdog.json;
// breaches append JSON events (with ids) to watchdog-events.jsonl — the same
// feed a mission-status screen or in-app amber can render later — and post one
// plain-English line to #team via nvk-msg.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_DIR = path.join(ROOT, '.novakai-command');
const CONFIG_PATH = path.join(STORE_DIR, 'watchdog.json');
const STATE_PATH = path.join(STORE_DIR, 'watchdog-state.json');
const EVENTS_PATH = path.join(STORE_DIR, 'watchdog-events.jsonl');
const MESSAGES_PATH = path.join(STORE_DIR, 'messages.jsonl');
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const SERVER = process.env.NVK_COMMAND_URL || 'http://127.0.0.1:3031';
const WATCHDOG_NAME = 'Watchdog · ops';

const DEFAULT_CONFIG = {
  intervalSec: 60,
  defaults: { quietAfterSec: 900, escalate: 'team' },
  // Per-seat overrides match by agentId first, then exact title.
  seats: [],
  // Titles the watchdog never alerts on.
  ignoreTitles: ['chris'],
  stuckQueuedAfterSec: 600,
};

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function config() {
  const loaded = loadJson(CONFIG_PATH, null);
  if (!loaded) fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return { ...DEFAULT_CONFIG, ...(loaded || {}) };
}

function boundaryFor(agent, cfg) {
  const seat = cfg.seats.find((s) => s.agentId === agent.agentId)
    || cfg.seats.find((s) => s.title === agent.title);
  return { ...cfg.defaults, ...(seat || {}) };
}

function roster() {
  try {
    const raw = execFileSync('curl', ['-s', '-m', '5', `${SERVER}/api/agents`], { encoding: 'utf8' });
    return JSON.parse(raw).agents;
  } catch {
    return loadJson(path.join(STORE_DIR, 'agents.json'), []).filter((a) => !a.archived);
  }
}

function transcriptPath(agent) {
  if (!agent.sessionId || !agent.projectDir) return null;
  const file = path.join(CLAUDE_PROJECTS, agent.projectDir, `${agent.sessionId}.jsonl`);
  return fs.existsSync(file) ? file : null;
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Best-effort sniff: is the seat sitting on a question/approval for a human?
// A transcript whose last entry is an assistant tool_use with no tool_result
// after it means the tool never ran — for AskUserQuestion/ExitPlanMode that is
// definitely a human prompt; for anything else it is likely a permission stop.
function pendingPrompt(file) {
  let tail;
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    const len = Math.min(size, 16384);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    tail = buf.toString('utf8');
  } catch { return null; }
  const lines = tail.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (!entry.type) continue;
    if (entry.type !== 'assistant') return null;
    const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
    const tool = blocks.find((b) => b.type === 'tool_use');
    if (!tool) return null;
    if (tool.name === 'AskUserQuestion') return 'a question for a human';
    if (tool.name === 'ExitPlanMode') return 'plan approval';
    return `a possible permission stop (${tool.name})`;
  }
  return null;
}

function appendEvent(event) {
  const record = { eventId: `wde_${crypto.randomUUID()}`, ts: new Date().toISOString(), ...event };
  fs.appendFileSync(EVENTS_PATH, `${JSON.stringify(record)}\n`);
  return record;
}

function post(line, escalate) {
  const body = escalate === 'chris' ? `@chris ${line}` : line;
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'nvk-msg.mjs'),
      'send', '--from', WATCHDOG_NAME, '--to', '#team', body], { encoding: 'utf8' });
  } catch (error) {
    appendEvent({ type: 'watchdog-post-failed', detail: String(error).slice(0, 200) });
  }
}

function checkSeats(cfg, state, now) {
  for (const agent of roster()) {
    if (agent.archived || agent.status === 'exited') continue;
    if (cfg.ignoreTitles.includes(agent.title) || agent.title === WATCHDOG_NAME) continue;
    const bound = boundaryFor(agent, cfg);
    const seatState = state.seats[agent.agentId] || {};
    const file = transcriptPath(agent);
    if (!file) {
      // Codex seats have no claude transcript — fall back to the PTY pid.
      if (pidAlive(agent.terminalPid)) { state.seats[agent.agentId] = {}; continue; }
      if (!seatState.deadAlerted) {
        appendEvent({ type: 'seat-unreachable', agentId: agent.agentId, title: agent.title, escalate: bound.escalate });
        post(`${agent.title} has no transcript and no live process — the seat looks dead despite the roster.`, bound.escalate);
        state.seats[agent.agentId] = { deadAlerted: true };
      }
      continue;
    }
    const quietSec = Math.round((now - fs.statSync(file).mtimeMs) / 1000);
    if (quietSec < bound.quietAfterSec) {
      if (seatState.quietAlerted) {
        appendEvent({ type: 'seat-recovered', agentId: agent.agentId, title: agent.title, quietSec });
      }
      state.seats[agent.agentId] = {};
      continue;
    }
    if (seatState.quietAlerted) continue;
    const prompt = pendingPrompt(file);
    const minutes = Math.round(quietSec / 60);
    const line = prompt
      ? `${agent.title} has been waiting ~${minutes} min on ${prompt} — someone needs to unblock them.`
      : `${agent.title} has gone quiet for ~${minutes} min with nothing pending — worth a look.`;
    appendEvent({
      type: prompt ? 'seat-waiting-human' : 'seat-quiet',
      agentId: agent.agentId, title: agent.title, quietSec, detail: prompt || undefined, escalate: bound.escalate,
    });
    post(line, bound.escalate);
    state.seats[agent.agentId] = { quietAlerted: true };
  }
}

function checkDeliveries(cfg, state, now) {
  let stat;
  try { stat = fs.statSync(MESSAGES_PATH); } catch { return; }
  // First run: baseline silently. History is not a live problem — alerting on
  // it once flooded #team with 99 lines (2026-07-17, never again).
  const firstRun = state.messagesOffset === undefined;
  const from = Math.min(state.messagesOffset || 0, stat.size);
  const fd = fs.openSync(MESSAGES_PATH, 'r');
  const buf = Buffer.alloc(stat.size - from);
  fs.readSync(fd, buf, 0, buf.length, from);
  fs.closeSync(fd);
  state.messagesOffset = stat.size;
  const latest = new Map();
  for (const line of buf.toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id) latest.set(m.id, m);
  }
  state.queued = state.queued || {};
  const problems = [];
  for (const m of latest.values()) {
    if (m.from === WATCHDOG_NAME) continue;
    if (m.status === 'failed' && !state.failedAlerted?.[m.id]) {
      state.failedAlerted = { ...state.failedAlerted, [m.id]: true };
      appendEvent({ type: 'delivery-failed', messageId: m.id, from: m.from, to: m.to, baselined: firstRun || undefined });
      if (!firstRun) problems.push(`${m.from}→${m.to} failed`);
    } else if (m.status === 'queued') {
      state.queued[m.id] = state.queued[m.id] || { to: m.to, from: m.from, seenAt: m.createdAt || new Date(now).toISOString() };
    } else {
      delete state.queued[m.id];
    }
  }
  for (const [id, q] of Object.entries(state.queued)) {
    const age = (now - Date.parse(q.seenAt)) / 1000;
    if (age > cfg.stuckQueuedAfterSec && !q.alerted) {
      q.alerted = true;
      appendEvent({ type: 'delivery-stuck', messageId: id, from: q.from, to: q.to, ageSec: Math.round(age), baselined: firstRun || undefined });
      if (!firstRun) problems.push(`${q.from}→${q.to} stuck ${Math.round(age / 60)}m`);
    }
  }
  // One line per tick no matter how many problems — noise is its own outage.
  if (problems.length) {
    const shown = problems.slice(0, 4).join('; ');
    const more = problems.length > 4 ? ` (+${problems.length - 4} more)` : '';
    post(`Mail trouble: ${shown}${more} — someone's not receiving messages.`, 'team');
  }
}

function tick() {
  const cfg = config();
  const state = loadJson(STATE_PATH, { seats: {} });
  state.seats = state.seats || {};
  const now = Date.now();
  checkSeats(cfg, state, now);
  checkDeliveries(cfg, state, now);
  state.lastTick = new Date(now).toISOString();
  saveState(state);
}

const mode = process.argv[2];
if (mode === 'tick') {
  tick();
  console.log('[watchdog] tick complete — events in', path.relative(ROOT, EVENTS_PATH));
} else if (mode === 'watch') {
  const run = () => { try { tick(); } catch (error) { console.error('[watchdog]', error); } };
  run();
  setInterval(run, config().intervalSec * 1000);
  console.log(`[watchdog] watching every ${config().intervalSec}s`);
} else {
  console.log('usage: nvk-watchdog <tick|watch>');
}
