#!/usr/bin/env node
// nvk slack-mirror — read-only mirror of the team messaging journal
// (.novakai-command/messages.jsonl) into a Slack channel via an Incoming
// Webhook. One-way: this script never writes to the journal or the backend.
//
//   node scripts/nvk-slack-mirror.mjs [--backlog N] [--dry-run] [--verbose] [--file <path>]
//
// Webhook URL: env NVK_SLACK_WEBHOOK_URL wins; fallback is
// .novakai-command/slack-mirror.json ({"webhookUrl": "..."}). Never hardcoded.
// See docs/operations/SLACK-MIRROR.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 1) && true : false; };
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };

const DRY_RUN = flag('--dry-run');
const VERBOSE = flag('--verbose');
const BACKLOG = Math.max(0, Number.parseInt(opt('--backlog') ?? '20', 10) || 0);
const JOURNAL = path.resolve(opt('--file') || path.join(ROOT, '.novakai-command', 'messages.jsonl'));
const CONFIG_FILE = path.join(ROOT, '.novakai-command', 'slack-mirror.json');

const POLL_MS = 2000;
const POST_GAP_MS = 1100;      // Slack webhooks allow ~1 msg/sec
const BODY_MAX = 500;
const SEEN_MAX = 5000;
const RETRY_DELAY_MS = 5000;

const log = (...a) => console.log('[slack-mirror]', ...a);
const warn = (...a) => console.warn('[slack-mirror] WARN:', ...a);
const vlog = (...a) => { if (VERBOSE) log(...a); };

// --- webhook resolution ------------------------------------------------------

function resolveWebhook() {
  const fromEnv = process.env.NVK_SLACK_WEBHOOK_URL;
  if (fromEnv) return { url: fromEnv, source: 'NVK_SLACK_WEBHOOK_URL' };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (typeof parsed.webhookUrl === 'string' && parsed.webhookUrl) {
        return { url: parsed.webhookUrl, source: CONFIG_FILE };
      }
    }
  } catch (error) {
    warn(`could not read ${CONFIG_FILE}: ${error.message}`);
  }
  return null;
}

const webhook = DRY_RUN ? null : resolveWebhook();
if (!DRY_RUN && !webhook) {
  console.error(`[slack-mirror] no Slack webhook configured.

Set the env var:
  export NVK_SLACK_WEBHOOK_URL="https://hooks.slack.com/services/…"

or create the config file:
  echo '{"webhookUrl":"https://hooks.slack.com/services/…"}' > ${CONFIG_FILE}

Create a webhook at https://api.slack.com/apps → Incoming Webhooks.
See docs/operations/SLACK-MIRROR.md.`);
  process.exit(1);
}

// --- seen-id tracking (bounded) ----------------------------------------------

const seen = new Map(); // id → last status posted
function remember(id, status) {
  if (seen.has(id)) seen.delete(id);
  seen.set(id, status);
  if (seen.size > SEEN_MAX) seen.delete(seen.keys().next().value);
}

// --- formatting --------------------------------------------------------------

const timeOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '??:??'
    : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const truncate = (body) => {
  const flat = String(body ?? '').replace(/\s+/g, ' ').trim();
  return flat.length <= BODY_MAX ? flat : `${flat.slice(0, BODY_MAX)}… (truncated)`;
};

const STATUS_ICON = { delivered: '↳', partial: '⚠', failed: '✗', queued: '…' };

// Status semantics always win over sender identity: failed/partial = muted
// red, other amendments = grey. Sender colors apply to new messages only.
const COLOR_FAILED = '#B05A5A';
const COLOR_AMENDMENT = '#9E9E9E';

// Muted/professional palette; a deterministic name hash picks one per sender
// so an agent always shows the same color across restarts.
const SENDER_COLORS = [
  '#5B7A99', // slate blue
  '#7A9B76', // sage
  '#9B7B8C', // dusty mauve
  '#B0816A', // terracotta
  '#8A8B5C', // olive
  '#5F8B8B', // steel teal
  '#8C8377', // warm grey
  '#7E6B8F', // muted plum
  '#6E86A0', // faded denim
  '#A08A6B', // khaki
  '#6B9B8A', // sea glass
  '#96778A', // heather
];

// Known actors get a fixed emoji (loose, case-insensitive substring match);
// unknown senders get a stable pick from the fallback list via the same hash.
const KNOWN_EMOJI = [
  ['fable', '🦊'],
  ['scribe', '📜'],
  ['watchdog', '🐶'],
  ['chief', '🎖️'],
  ['chris', '👤'],
  ['manager', '🧭'],
  ['kimi', '🌙'],
  ['claude', '🎻'],
];
const FALLBACK_EMOJI = ['🤖', '🛰️', '📡', '🧪', '🦉', '🐙', '🌿', '🔧', '📐', '🧵'];

// Simple stable string hash (FNV-1a 32-bit).
function hashName(name) {
  let h = 0x811c9dc5;
  for (const ch of String(name)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const senderColor = (name) => SENDER_COLORS[hashName(name) % SENDER_COLORS.length];

function senderEmoji(name) {
  const lower = String(name).toLowerCase();
  for (const [needle, emoji] of KNOWN_EMOJI) {
    if (lower.includes(needle)) return emoji;
  }
  return FALLBACK_EMOJI[hashName(lower) % FALLBACK_EMOJI.length];
}

// Recipient emoji: channels/rooms get their own symbols, people get the
// same known/fallback mapping as senders.
function recipientEmoji(to) {
  const t = String(to).toLowerCase();
  if (t === '#team' || t.startsWith('#')) return '📣';
  if (t.startsWith('room')) return '🏠';
  return senderEmoji(to);
}

// New message → one Slack message. to '#team' shows as the channel name;
// room_* shows as room id; anything else is a direct message. Sender identity
// is carried primarily by an inline emoji in the text header (always renders,
// even when the Slack app overrides webhook username/avatar), plus username +
// icon_emoji + a muted per-sender attachment color for clients that honor them.
function formatNew(env) {
  const flags = env.delivery === 'interrupt' ? ' · ⚡interrupt' : '';
  const text = `${senderEmoji(env.from)} *${env.from}* → ${recipientEmoji(env.to)} *${env.to}* · ${timeOf(env.createdAt)}${flags}\n${truncate(env.body)}`;
  return {
    username: env.from,
    icon_emoji: senderEmoji(env.from),
    text,
    attachments: [{ color: senderColor(env.from), fallback: text }],
  };
}

function formatStatus(env) {
  const icon = STATUS_ICON[env.status] ?? '↳';
  const bad = env.status === 'failed' || env.status === 'partial';
  const attachments = bad
    ? [{ color: COLOR_FAILED, fallback: `${env.id} → ${env.status}` }]
    : [{ color: COLOR_AMENDMENT, fallback: `${env.id} → ${env.status}` }];
  return {
    text: `${icon} \`${env.id}\` → *${env.status}* (${env.from} → ${env.to}, ${timeOf(env.createdAt)})`,
    attachments,
  };
}

function formatLine(env) {
  const prior = seen.get(env.id);
  const payload = (prior === undefined)
    ? formatNew(env)
    : (prior === env.status ? null : formatStatus(env));
  if (payload) remember(env.id, env.status);
  return payload;
}

// --- send queue (spaced posts, one retry) ------------------------------------

const queue = [];
let sending = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postOnce(payload) {
  const res = await fetch(webhook.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Slack HTTP ${res.status} ${await res.text().catch(() => '')}`);
}

async function drain() {
  if (sending) return;
  sending = true;
  while (queue.length > 0) {
    const payload = queue.shift();
    if (DRY_RUN) {
      const meta = [
        payload.username ? `user=${payload.username}` : null,
        payload.icon_emoji ? `emoji=${payload.icon_emoji}` : null,
        payload.attachments.length ? `color=${payload.attachments.map((a) => a.color).join(',')}` : null,
      ].filter(Boolean).join(' ');
      console.log(`[dry-run]${meta ? ` (${meta})` : ''} ${payload.text}`);
      continue;
    }
    try {
      await postOnce(payload);
      vlog(`posted: ${payload.text.split('\n')[0]}`);
    } catch (first) {
      warn(`post failed (${first.message}); retrying in ${RETRY_DELAY_MS / 1000}s`);
      await sleep(RETRY_DELAY_MS);
      try {
        await postOnce(payload);
        vlog(`posted on retry: ${payload.text.split('\n')[0]}`);
      } catch (second) {
        warn(`post failed again (${second.message}); dropping message, continuing`);
      }
    }
    await sleep(POST_GAP_MS);
  }
  sending = false;
}

const enqueue = (payload) => { if (payload) { queue.push(payload); void drain(); } };

// --- journal reading ----------------------------------------------------------

let offset = 0;
let remainder = '';

function readNewLines() {
  let stats;
  try {
    stats = fs.statSync(JOURNAL);
  } catch {
    return; // journal may not exist yet; keep polling
  }
  if (stats.size < offset) { // truncated / rotated
    warn('journal shrank (truncated or rotated); restarting from beginning');
    offset = 0;
    remainder = '';
  }
  if (stats.size === offset) return;
  const fd = fs.openSync(JOURNAL, 'r');
  try {
    const length = stats.size - offset;
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, offset);
    offset = stats.size;
    const chunk = remainder + buffer.toString('utf8');
    const lines = chunk.split('\n');
    remainder = lines.pop(); // last piece may be a partial line
    for (const line of lines) handleLine(line);
  } finally {
    fs.closeSync(fd);
  }
}

function handleLine(line) {
  if (!line.trim()) return;
  let env;
  try {
    env = JSON.parse(line);
  } catch {
    warn(`skipping malformed JSONL line (${line.slice(0, 80)}…)`);
    return;
  }
  if (typeof env?.id !== 'string') {
    warn('skipping line without a string id');
    return;
  }
  enqueue(formatLine(env));
}

function loadBacklog(n) {
  if (!fs.existsSync(JOURNAL) || n === 0) return;
  const all = fs.readFileSync(JOURNAL, 'utf8').split('\n').filter((l) => l.trim());
  const slice = all.slice(-n);
  // Fold by id within the backlog slice: post each message once, in its latest
  // state, rather than a send plus its amendments.
  const folded = new Map();
  for (const line of slice) {
    try {
      const env = JSON.parse(line);
      if (typeof env?.id === 'string') folded.set(env.id, env);
    } catch {
      warn(`skipping malformed backlog line (${line.slice(0, 80)}…)`);
    }
  }
  for (const env of folded.values()) enqueue(formatLine(env));
}

// --- main ----------------------------------------------------------------------

if (!fs.existsSync(JOURNAL)) {
  warn(`journal not found at ${JOURNAL} — will start when it appears`);
}

loadBacklog(BACKLOG);
// Seek to end for live tailing (backlog lines were already posted folded).
try {
  offset = fs.statSync(JOURNAL).size;
} catch {
  offset = 0;
}

log(`tailing ${JOURNAL}`);
log(`mode: ${DRY_RUN ? 'dry-run (no Slack posts)' : `live → Slack via ${webhook.source}`} · backlog ${BACKLOG} · poll ${POLL_MS}ms`);

const timer = setInterval(readNewLines, POLL_MS);

process.on('SIGINT', () => {
  clearInterval(timer);
  log(`stopping (SIGINT). ${queue.length} message(s) still queued — drained or dropped on exit.`);
  process.exit(0);
});
