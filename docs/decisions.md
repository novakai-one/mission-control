# Architectural decisions

This file records settled choices and their reasoning. Future work should build
on these decisions unless new evidence justifies changing them.

## Canonical language

- **Project:** umbrella for related work, resources, and threads.
- **Thread:** durable, user-visible objective and conversation.
- **Provider session:** Claude or Codex conversation identity.
- **Agent runtime:** temporary PTY process serving a provider session.
- **Turn:** one user-to-provider interaction inside a session.

A thread may reference multiple provider sessions. Restarting or resuming a PTY
does not create a new user-visible thread.

## D1 — Projects remain a shallow umbrella

**Decision:** Projects coordinate cohesive modules; they are not one aggregate.

Planning, threads, resources, activity, and runtimes own their behavior. The
project layer stores identifiers and composes projections across those modules.

**Why:** This limits coupling and prevents project changes touching everything.

## D2 — Threads own provider-session references

**Decision:** Threads reference provider sessions by provider, session ID, and
optional working directory. Relationships are one-way from thread to session.

**Why:** Users experience one durable conversation while providers retain their
own identities, transcripts, tools, and resume behavior.

## D3 — Provider storage remains authoritative

**Decision:** Novakai never rewrites Claude or Codex transcripts. Project files
store pointers only, under `~/.novakai-command/projects/`.

**Why:** Copying transcripts creates synchronization and ownership problems.

**Consequence:** Missing sessions produce actionable errors and manual attachment
remains a supported fallback.

## D4 — Provider adapters normalize read models

**Decision:** Claude and Codex adapters convert native transcripts into canonical
events. Thread timelines are projections, not another source of truth.

**Why:** Provider formats may evolve independently without leaking into UI code.

## D5 — Shared schemas cross process boundaries

**Decision:** Frontend and backend consume the same project and provider schemas.

**Why:** One contract prevents duplicated interfaces from drifting silently.

## D6 — Typed services replace command-bus machinery

**Decision:** Routes and React remain thin. Cohesive typed services own project,
runtime, persistence, and projection behavior. No CQRS framework is introduced.

**Why:** The current domain benefits from explicit seams, not infrastructure.

## D7 — PTY lifetime differs from conversation lifetime

**Decision:** `TerminalManager` owns transient PTYs and raw buffers. Provider
sessions own resumable conversation history. Registry entries restore as exited
after backend restart; provider transcripts remain available.

**Why:** A process cannot survive every application lifecycle, but conversation
continuity must.

## D8 — Runtime launch is provider-aware behind one seam

**Decision:** `ProjectRuntime` requests launches through `AgentsHub`, which
delegates PTY details to `TerminalManager` and provider launchers.

Claude receives a predetermined session ID. Codex cannot; its PTY returns
immediately, then Novakai discovers the first new exact-working-directory rollout
after the first prompt. Only one unresolved Codex launch may exist per directory.

**Why:** Provider quirks stay out of routes, React, and project persistence.

**Operational requirements:** Codex receives `TERM=xterm-256color`, disables its
startup update check, and retains a five-minute discovery window.

## D9 — Live timelines are replaceable projections

**Decision:** The first implementation polls projected events every second.

**Why:** Polling is simple, deterministic, and keeps transcript ownership clear.

**Consequence:** Filesystem watching may replace polling behind the same interface.

## D10 — Terminals stay mounted during navigation

**Decision:** Switching threads or tabs hides terminals without unmounting them.
Raw PTY buffers and canonical transcript views remain separate live feeds.

**Why:** Terminal state, prompts, and background work must survive navigation.

## D11 — Persistence locations remain deliberately separate

**Decision:** Project metadata lives in the user data directory. Agent registry
state lives in `.novakai-command/agents.json` for the running checkout. Provider
transcripts remain in provider-owned directories.

**Why:** Each owner retains the smallest persistence responsibility.

## D12 — Existing workspace surfaces remain compatible

**Decision:** Projects extend Novakai without removing Files, Agents, Transcript,
Ruleset, Debug, or Settings.

**Why:** Runtime integration must not regress established workflows.

## D13 — Transcript parsing enforces string contracts; timeline rows fail alone

**Decision:** The transcript parser owns the guarantee that every
`TranscriptEvent` string field holds a string, for any provider input.
Structured payloads become first-class typed events — Claude `task_reminder`
attachments parse into `task_snapshot` events, surfaced as canonical `task`
events carrying `TaskItem[]` (shared schema, D5) with a dedicated timeline
renderer. Unknown attachment payloads degrade to JSON text; empty task
reminders are dropped as noise. In the workspace timeline, every event renders
inside an error boundary, and unknown canonical kinds fall back to the default
renderer.

**Why:** Claude Code began writing `task_reminder` attachments whose content is
an array of task objects. The object leaked through `att.content || ''` into a
React child and unmounted the entire tree — the desktop app showed only a black
window (2026-07-16). Provider formats evolve without notice (D4), so the
guarantee must live at the adapter boundary, and one malformed event must cost
one timeline row, never the app.

**Consequence:** New provider payload shapes appear as JSON text or a fallback
row until deliberately modeled — visible degradation, never a crash. Renderers
never add their own string-coercion guards; the boundary enforces the contract
and the error boundary catches violations visibly.

## Change discipline

- Prefer vertical slices through deep module interfaces.
- Keep coupling low and responsibilities cohesive.
- Add provider behavior behind adapters.
- Keep transcript writes provider-owned.
- Preserve manual recovery paths.
- Commit focused, signed changes.
- Browser-verify every UI behavior before completion.
- Record changed architectural decisions here.
