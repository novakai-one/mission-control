# Kimi-as-Orchestrator — Working Plan

Date: 2026-07-19
Status: **living document** — update as missions move; this is the reference point until the UI is trustworthy again.

Task list of record: `novakai-docs/data/tasks.jsonl` (Novakai HQ Board) — the M1–M4
missions and fleet-hygiene items are filed there as `task_m1-*` … `task_m4-*`,
`task_fleet-idle-verdict`, `task_review-6hr-kimi-build`. This file holds the detail;
HQ holds the checklist.

## Thesis

The UI is on hold (too glitchy to use). The backend already exposes everything the UI
calls — agent spawn/kill over REST, PTY input/output over WebSocket, journaled messaging
via `nvk-msg` / `nvk-live`. So the highest-leverage setup is:

- **Chris talks to one agent (Kimi, this window).**
- **Kimi does the plumbing**: spawns, prompts, monitors, and retires claude/codex/kimi
  PTY agents through the backend API (`127.0.0.1:3031`), no UI required.

Proven 2026-07-19: spawned `Kimi Test · codex` and `Kimi Test · opus` via
`POST /api/agents`, delivered prompts via `nvk-msg`, got replies back through
`messages.jsonl`. Full loop works.

## Operating agreements

- This file is the plan of record. When priorities change, we change this file first.
- Workstreams are numbered M1..Mn so we can reference them in chat and in commits.
- Kimi verifies agent work by reading the message journal and repo diffs, not by
  scraping raw PTY output.
- The two `Kimi Test · *` agents stay alive as standing connectivity canaries.

## Missions

### M1 — Orchestration tooling (CLI parity with the UI)
The one gap found: nothing outside the UI calls `POST /api/agents`.
- [ ] `scripts/nvk-spawn.mjs` — CLI to create agents (`--provider --cwd --title`), so spawning isn't a raw curl
- [ ] `nvk-live.mjs roster` shows liveness cross-checked against real processes (registry says "running" ≠ process alive)
- [ ] A clean "agent last said / agent status" read path (journal-tail helper) so Kimi can report without WS scraping
- [ ] Kill/retire verb on the CLI (`POST .../kill`, `DELETE` archive)

### M2 — Plumbing hardening (things already broken)
- [ ] Watchdog `spawnSync node ENOENT` — watchdog can't find `node` when posting alerts; escalations silently lost. Fix PATH/env in `scripts/nvk-watchdog.mjs` launch
- [ ] Reply-routing confusion — test opus agent replied to the wrong recipient; check name resolution in `scripts/team/channel.mjs` / messaging delivery
- [ ] Registry hygiene — 92 registered, most archived/exited; confirm prune path works

### M3 — Dogfood the orchestrator loop
Use the M1/M2 tooling on real work to prove the model before building more UI:
- [ ] Define a standing fleet (names, providers, worktrees) worth keeping vs. the current 9 ad-hoc agents
- [ ] Run one real task end-to-end: Kimi delegates → agent executes in its worktree → Kimi reviews diff → merges or sends back
- [ ] Record what broke in this file

### M4 — UI stabilization (deferred, collect ammo)
Don't build UI yet; capture what to fix when we return:
- [ ] List the specific glitches that made the UI unusable (Chris to braindump; Kimi files them here)
- [ ] Note which UI features the CLI loop already covers (roster ✅, messaging ✅, spawn — after M1)

## Open questions

- Do the 9 long-running agents from 2026-07-17 still have purpose, or are they idle
  burns to retire? (Last real activity 01:33 today.)
- Worktree sprawl: 13 worktrees on disk. Which are live vs. abandoned?
- Should `nvk-spawn` also register the agent into a default room (`#team`) so new
  agents are addressable immediately?

## Log

- 2026-07-19 — Plan created. Spawn/msg/reply loop proven from CLI (see thesis).
