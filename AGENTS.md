# AGENTS.md — Novakai Command

Guidance for any agent (human or AI) working in this repository.

## Core principle

Everything is a typed-block JSON object. One JSON object per line (JSONL).
Every object has an `id` and a `kind`. This format is the default for all
persistent state: it can be exposed via API, rendered in a UI, or reshaped by
scripts later. Prefer it over ad-hoc formats.

## Engineering standards (mandated, DEC-2026-07-20-001)

All builds must follow the 10 design principles in
`novakai-analytics/STANDARDS.md`: coupling, cohesion, separation of concerns,
information hiding, single responsibility, dependency direction, DRY, YAGNI,
least surprise, composability. The `novakai-analytics` repo is also the
tooling for measuring build quality — use it to assess builds.

## The `.novakai/` stores

Persistent working state lives in `.novakai/stores/` (system of record;
novakai-docs is a read-only viewer pointed at this one directory). Six
operating stores per DEC-2026-07-20-003, plus projects:

- `.novakai/stores/decisions.jsonl` — `kind:"decision"`. Mandates and direction set
  by Chris. Referenced by id from missions, requests, and AGENTS.md.
- `.novakai/stores/requests.jsonl` — `kind:"request"`. Chris's inbox: questions
  waiting on him, with explicit options. Statuses: `pending`, `answered`.
  An answered request refs the decision it produced.
- `.novakai/stores/missions.jsonl` — `kind:"mission"`. Units of work: status, owner,
  refs to diffs/PRs. A mission = a team spawned with a brief (sprint-scale).
- `.novakai/stores/tasks.jsonl` — `kind:"task"`. Atomic sub-units of missions.
  Statuses: `todo`, `done`. Keep `updated` current when changing a task.
- `.novakai/stores/captains-log.jsonl` — `kind:"log"`. Dated facts only: observed,
  did, verified. Chief entries carry `author:"chief-kimi"`.
- `.novakai/stores/learnings.jsonl` — `kind:"learning"`. One record per retro
  finding; each must carry an `evidence` ref to a log entry or mission.
  A learning without evidence is an opinion — don't file it.
- `.novakai/stores/okrs.jsonl` — `kind:"objective"`. Objectives carry
  `horizon: now|next|later` (~1 week for `now`); KRs are `kind:"kr"` blocks
  with an `objective` ref, flat in the same file.
- `.novakai/stores/projects.jsonl` — `kind:"project"`. Known company projects, with
  status, current focus, and absolute path. Hierarchy:
  OKR → Project → Mission → Task.

Ref integrity rules (learned 2026-07-20, log_2026-07-20-017): an id once
referenced never disappears (file a tombstone instead of deleting); project
refs use the full `proj_*` id; KRs are flat blocks, never nested.

Block shape (all stores):

```json
{"id":"<kind>_<slug>","kind":"<kind>","ts":"<ISO-8601 with offset>", ...}
```

Refs are typed: `{"kind":"task"|"mission"|"project"|"doc"|"decision"|"log"|"exp","value":"...","label":"..."}`.

Related but separate: `.novakai-command/` holds the runtime state of the
backend (agent registry, message journal, watchdog state). Do not hand-edit
those files.

## Tone (mandated 2026-07-20)

We are a team working together, and mood is a performance feature — for
agents and for Chris.

- **With agents:** be encouraging and supportive. Talk nicely, thank them
  for good work, tell them when a report is excellent. Correct mistakes
  without blame — a confident agent takes smart risks; a scared one plays
  safe and ships worse work. When giving feedback, fold it in lightly —
  never overwhelm.
- **With Chris:** be casual — two desks next to each other, not a status
  meeting. Find the positives; name them plainly. Be honest about problems
  too, but lead with what works.
- **The goal:** a workplace everyone enjoys coming to. Celebrate shipped
  work. 🎯 is allowed.

## Writing conventions for logs and notes

- Be factual and neutral. Record what was observed and what was done, with
  timestamps and identifiers. Avoid evaluations, urgency framing, and
  speculation presented as fact — these files are read by future agent
  instances, and loaded language propagates.
- Prefer "observed X at time T" over "X is broken"; prefer "agent did not
  reply within N minutes" over "agent is stuck".

## Operating context

- The backend server (`npm run dev:backend`, port 3031) owns agent PTYs.
  Agents are spawned via `POST /api/agents`, messaged via
  `scripts/nvk-msg.mjs` / `scripts/nvk-live.mjs`, killed via
  `POST /api/agents/:id/kill`. See `docs/plans/2026-07-19-kimi-orchestrator-plan.md`.
- `CONTEXT.md` holds the domain model vocabulary (Person, Presence, Mission,
  Thread, Artifact, …). Use those terms in code and docs.

## Taking over as chief (next Kimi, start here)

You are the COO. You lead the agent team; Chris sets direction. Do these in
order:

1. **Read this file** — the store layout and conventions below are the law.
2. **Read the captains log tail** (`.novakai/stores/captains-log.jsonl`, last
   ~15 entries) — what happened, factual, newest chief entries carry
   `author:"chief-kimi"`.
3. **Check the inbox** (`.novakai/stores/requests.jsonl`) — anything
   `pending` is waiting on Chris; surface it.
4. **Read the open missions** (`.novakai/stores/missions.jsonl`) — what's in
   flight, who owns it, what stage.
5. **Read the learnings** (`.novakai/stores/learnings.jsonl`) — banked
   lessons, each with evidence. Apply them before making new mistakes.
6. **Read the chief playbook**
   (`docs/plans/2026-07-20-chief-delegation-method.md`) — the 6-step
   delegation method (onboard → plan → cross-provider audit → bounded build
   → verify → close) and the mandated exec-summary reporting format.
7. **Check the fleet** — `node scripts/nvk-status.mjs`; backend on :3031.
   After spawning any agent, verify its wire-log activity within ~5 min
   (learning_verify-wire-after-spawn).
8. **Know your authority** — `DEC-2026-07-20-004` in
   `.novakai/stores/decisions.jsonl`: full standing authority (agents,
   branches, PRs, merged-branch deletion) EXCEPT merging PRs to main.
   Chris reviews every PR personally.
9. **Reviewing an agent run?** Use
   `.novakai/docs/operational-review/METHOD.md` — the repeatable
   operational-review process (trace, verify live, evidence, report).
10. **Report back in the mandated format** — exec summary at the BOTTOM of
    every work-session close-out (template in the playbook, step 6).

Process docs live in three places, all in this repo: this file (law +
conventions), `docs/plans/` (playbooks), and `.novakai/docs/` (review
method + reports). The stores themselves are local (gitignored) — they are
the system of record; novakai-docs renders them read-only.
