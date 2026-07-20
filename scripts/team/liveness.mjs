// liveness.mjs — truth about a spawned agent's process and activity.
// Single responsibility: answer "is the process what it claims to be, and is
// it actually doing anything?" — never trust the roster's status string.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { assistantTexts, locateTranscript, readEvents, userTurns } from './transcripts.mjs';

/** Binary names each provider's PTY command line must contain. */
export const PROVIDER_BINARIES = {
  kimi: /kimi/i,
  claude: /claude/i,
  codex: /codex/i,
};

function defaultPs(pid) {
  return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
}

/**
 * Is the agent's PID alive, and does its command line match the claimed
 * provider? (The mismatch branch exists because a stale terminal host once
 * launched codex for a kimi spawn — the roster said "kimi", the truth said codex.)
 */
export function checkProcess(agent, { ps = defaultPs } = {}) {
  const pid = agent.terminalPid;
  const expected = PROVIDER_BINARIES[agent.provider] ?? null;
  if (!pid) return { alive: false, pid: null, command: null, providerMatch: false };
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  let command = null;
  if (alive) {
    try {
      command = ps(pid);
    } catch {
      alive = false;
    }
  }
  const providerMatch = alive && expected ? expected.test(command ?? '') : false;
  return { alive, pid, command, providerMatch };
}

/**
 * Proof of actual activity from the agent's own transcript: does it exist,
 * how many events/user turns, and how fresh is the last event.
 */
export function activityProof(agent, { home, now = Date.now() } = {}) {
  const transcript = locateTranscript(agent, home ? { home } : {});
  if (!transcript) return { transcript: null, events: 0, userTurns: 0, lastEventAgeMs: null };
  const events = readEvents(transcript);
  const times = events.map((event) => event?.time).filter((time) => typeof time === 'number');
  const lastEventTime = times.length > 0 ? Math.max(...times) : null;
  let lastEventAgeMs = null;
  if (lastEventTime !== null) {
    lastEventAgeMs = now - lastEventTime;
  } else {
    try {
      lastEventAgeMs = now - fs.statSync(transcript).mtimeMs;
    } catch {
      // keep null — unknown, not zero
    }
  }
  return {
    transcript,
    events: events.length,
    userTurns: userTurns(events, agent.provider).length,
    lastEventAgeMs,
  };
}

/** The agent's latest useful message: last assistant text from its transcript. */
export function latestUseful(agent, { home, maxLen = 600 } = {}) {
  const transcript = locateTranscript(agent, home ? { home } : {});
  if (!transcript) return { transcript: null, text: null };
  const texts = assistantTexts(readEvents(transcript), agent.provider);
  const last = texts[texts.length - 1] ?? null;
  if (!last) return { transcript, text: null };
  const collapsed = last.text.replace(/\s+/g, ' ').trim();
  return {
    transcript,
    time: last.time ?? null,
    text: collapsed.length > maxLen ? `${collapsed.slice(0, maxLen)}…` : collapsed,
  };
}
