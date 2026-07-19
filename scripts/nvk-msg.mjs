#!/usr/bin/env node
// nvk msg — agent-to-agent messaging per docs/agent-messaging.md (phase 7).
// Thin wrapper over the backend REST API when the Novakai Command server is
// up (real PTY delivery, live roster); falls back to the original file-based
// pull-only mode when it isn't.
//
//   node scripts/nvk-msg.mjs send  --from claude-1 --to codex-1 [--interrupt] "body"
//   node scripts/nvk-msg.mjs send  --from claude-1 --to '#team' "body"
//   node scripts/nvk-msg.mjs read  <name|#team> [--since 2026-07-17T08:00:00Z]
//   node scripts/nvk-msg.mjs names            # live roster (server) or seen names (file)
//
// Sender identity: --from or NVK_AGENT env var.
// Server: NVK_COMMAND_URL (default http://127.0.0.1:3031).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE = path.join(ROOT, '.novakai-command', 'messages.jsonl');
const SERVER = process.env.NVK_COMMAND_URL || 'http://127.0.0.1:3031';

const args = process.argv.slice(2);
const cmd = args.shift();
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 1) && true : false; };
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };

const readAll = () => fs.existsSync(STORE)
  ? fs.readFileSync(STORE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : [];

// Fold status-amendment lines (same id, later wins) into one envelope each.
const foldAll = () => {
  const byId = new Map();
  for (const m of readAll()) byId.set(m.id, m);
  return [...byId.values()];
};

const printMessage = (m) => console.log(
  `[nvk-msg from ${m.from} id ${m.id}] ${m.createdAt} → ${m.to}` +
  `${m.delivery === 'interrupt' ? ' (interrupt)' : ''}${m.status ? ` [${m.status}]` : ''}\n` +
  `  ${m.body.replace(/\n/g, '\n  ')}`);

// null → server unreachable (caller falls back to file mode).
async function api(pathname, init) {
  try {
    return await fetch(SERVER + pathname, { signal: AbortSignal.timeout(3000), ...init });
  } catch {
    return null;
  }
}

if (cmd === 'send') {
  const interrupt = flag('--interrupt');
  const from = opt('--from') || process.env.NVK_AGENT;
  const to = opt('--to');
  const threadId = opt('--thread');
  const body = args.join(' ').trim();
  if (!from || !to || !body) { console.error('usage: nvk-msg send --from <me> --to <name|#team> [--interrupt] [--thread <id>] "body"'); process.exit(1); }
  if (interrupt && to.startsWith('#')) { console.error('interrupt is rejected for channels (never interrupt the whole fleet)'); process.exit(1); }

  const response = await api('/api/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, delivery: interrupt ? 'interrupt' : 'normal', body, ...(threadId ? { threadId } : {}) }),
  });
  // A pre-tunnel server 404s the route itself with no JSON error — treat it
  // like no server. A new-server 404 (unknown recipient) carries `error`.
  const payload = response ? await response.json().catch(() => ({})) : null;
  const preTunnelServer = response && response.status === 404 && !payload?.error;
  if (response && !preTunnelServer) {
    if (!response.ok) {
      console.error(`send failed (${response.status}): ${payload.error || 'unknown error'}`);
      if (payload.roster) console.error('live agents: ' + (payload.roster.map(a => a.name).join(', ') || '(none)'));
      process.exit(1);
    }
    console.log(`${payload.envelope.id} → ${to} (${payload.envelope.status})`);
  } else {
    // File fallback: pull-only, recipients check at natural pauses.
    const envelope = {
      id: 'msg_' + crypto.randomUUID(),
      from, to,
      delivery: interrupt ? 'interrupt' : 'normal',
      body,
      ...(threadId ? { threadId } : {}),
      createdAt: new Date().toISOString(),
      status: 'queued',
    };
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.appendFileSync(STORE, JSON.stringify(envelope) + '\n');
    console.log(`${envelope.id} → ${to} (queued; server down — pull-only file mode)`);
  }

} else if (cmd === 'read') {
  const since = opt('--since');
  const who = args[0];
  if (!who) { console.error('usage: nvk-msg read <name|#team> [--since ISO]'); process.exit(1); }

  const query = new URLSearchParams({ withAgent: who, ...(since ? { since } : {}) });
  const response = await api(`/api/messages?${query}`);
  let msgs;
  if (response && response.ok) {
    msgs = (await response.json()).messages;
    if (!who.startsWith('#')) msgs = msgs.filter(m => m.to === who || m.from === who);
  } else {
    msgs = foldAll().filter(m =>
      (m.to === who || (!who.startsWith('#') && m.from === who)) &&
      (!since || m.createdAt >= since));
  }
  if (!msgs.length) { console.log('(no messages)'); process.exit(0); }
  for (const m of msgs) printMessage(m);

} else if (cmd === 'names') {
  const addressBookResponse = await api('/api/messaging/address-book');
  if (addressBookResponse && addressBookResponse.ok) {
    const { mailboxes = [], presences = [] } = await addressBookResponse.json();
    const mailboxLines = mailboxes.map(
      (identity) => `${identity.memberName} (mailbox:${identity.role})`);
    const presenceLines = presences.map(
      (presence) => `${presence.name} (${presence.provider})`);
    console.log([...mailboxLines, ...presenceLines].join('\n') || '(empty address book)');
  } else {
    const response = await api('/api/agents');
    if (response && response.ok) {
      const { agents } = await response.json();
      const live = agents.filter(a => a.status === 'running');
      console.log(live.map(a => `${a.title} (${a.provider})`).join('\n') || '(no live agents)');
    } else {
      const names = new Set();
      for (const m of foldAll()) { names.add(m.from); names.add(m.to); }
      console.log([...names].join('\n') || '(empty store)');
    }
  }

} else {
  console.error('usage: nvk-msg <send|read|names>'); process.exit(1);
}
