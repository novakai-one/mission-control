#!/usr/bin/env node
/**
 * scripts/nvk-status.mjs — read-only fleet status.
 * Reads .novakai-command/agents.json, cross-checks terminalPid with the
 * process table, and tails messages.jsonl for each agent's last activity.
 * No writes, no messaging, no gates. Usage: node scripts/nvk-status.mjs [--all]
 */
import fs from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const STATE = `${ROOT}.novakai-command`
const showAll = process.argv.includes('--all')

const agents = JSON.parse(fs.readFileSync(`${STATE}/agents.json`, 'utf8'))

const alive = (pid) => {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

// last journal line per participant name
const lastSeen = {}
try {
  for (const line of fs.readFileSync(`${STATE}/messages.jsonl`, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const m = JSON.parse(line)
      for (const name of [m.from, m.to]) if (name) lastSeen[name] = m.ts || m.createdAt || lastSeen[name]
    } catch { /* skip bad lines */ }
  }
} catch { /* no journal yet */ }

const rows = agents
  .filter((a) => showAll || (!a.archived && a.status !== 'exited'))
  .map((a) => ({
    title: a.title,
    provider: a.provider,
    status: a.status,
    pid: a.terminalPid ?? '-',
    proc: a.terminalPid ? (alive(a.terminalPid) ? 'alive' : 'DEAD') : '-',
    lastJournal: lastSeen[a.title] ?? '(never)',
    created: a.createdAt,
  }))

if (!rows.length) { console.log('no matching agents (try --all)'); process.exit(0) }
const w = (s, n) => String(s ?? '').slice(0, n).padEnd(n)
console.log(w('title', 26), w('provider', 8), w('status', 8), w('pid', 7), w('proc', 6), w('lastJournal', 26), 'created')
for (const r of rows) {
  console.log(w(r.title, 26), w(r.provider, 8), w(r.status, 8), w(r.pid, 7), w(r.proc, 6), w(r.lastJournal, 26), r.created)
}
