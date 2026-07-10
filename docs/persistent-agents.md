# Persistent Agents — Spec

Branch: `feat/persistent-agents`. Replaces the cold-start-per-prompt terminal with
persistent interactive Claude Code sessions (PTY per agent), a collapsible
conversations side panel, and a live calm/raw view per agent including live subagents.

## 1. Requirements

- R1 Terminal parity: embedded terminal behaves exactly like `claude` in Terminal.app
  (real TTY: spinners, permission prompts, slash commands, keybindings).
- R2 No cold start: one persistent process per agent; prompts are keystrokes, not spawns.
- R3 Up to ~5 agents in parallel, independent conversations.
- R4 Conversations side panel: lists agents, click to switch, FULLY collapsible
  (Claude-desktop-style rail + toggle). Switching tabs/views and returning loses nothing.
- R5 Live view per agent: real-time main-agent activity AND that agent's subagents, live.
- R6 Raw/Calm toggle: raw = byte-exact terminal (xterm.js); calm = threaded structured
  feed from the session transcript. Both live simultaneously; toggle switches visibility.
- R7 Existing build system, old Terminal tab, board, debug: UNTOUCHED (out of scope).
- R8 CI gates stay green: tsc, test list, standards ratchet (≤630), vite build.

## 2. System architecture

```
BROWSER                                BACKEND (Express + ws, src/backend)
┌─────────────────────────────┐       ┌─────────────────────────────────────┐
│ SidePanel   AgentsView      │       │ TerminalManager (src/backend/terminal)
│ ┌───────┐  ┌──────────────┐ │  ws   │  Map<agentId, {pty, buffer, info}>  │
│ │● ag 1 │  │ RAW: xterm 1 │◀┼──────▶│   pty1 ─ claude --session-id S1 ────┼─┐
│ │  ag 2 │  │ (visible)    │ │frames │   pty2 ─ claude --session-id S2     │ │
│ │  ag 3 │  │ xterm 2..N   │ │{agent │   ...                               │ │
│ │  + new│  │ (hidden,     │ │  Id,  │  AgentBuffer: 2MiB ring of raw bytes│ │
│ └───────┘  │  kept alive) │ │  ...} │  (replay on subscribe/reconnect)    │ │
│  collapse  ├──────────────┤ │       ├─────────────────────────────────────┤ │
│  rail      │ CALM: feed + │◀┼──────▶│ SessionWatcher (exists) +           │ │
│            │ subagents    │ │       │ SubagentWatcher (new): tails        │ │
│            └──────────────┘ │       │ <session>.jsonl + subagents/*.jsonl │ │
└─────────────────────────────┘       └──────────────────▲──────────────────┘ │
                                                         │ writes JSONL       │
                                      ~/.claude/projects/<proj>/ ◀────────────┘
```

Two independent live feeds per agent, same process:
```
pty raw bytes ──▶ AgentBuffer ──▶ ws {agent-data} ──▶ xterm.js        (RAW)
claude writes JSONL ──▶ Session/SubagentWatcher ──▶ ws {transcript-event,
                                subagent-event} ──▶ calm feed         (CALM)
```
Calm is NEVER derived by parsing ANSI from the pty stream.

## 3. Agent lifecycle

```
POST /api/agents ──▶ mint agentId + sessionId(uuid)
        │            cwd = body.cwd ?? activeRepo ?? process.cwd()
        ▼
 pty.spawn(claudeCli, ['--session-id', sessionId], {name:'xterm-256color',
        cols:120, rows:32, cwd, env:process.env})
        │      NO -p. NO --permission-mode (real permission prompts wanted).
        ▼
 RUNNING ──(user types via ws agent-input)──▶ stays alive across prompts
        │
        ├──(pty onExit | POST .../kill)──▶ EXITED (record + buffer KEPT, still
        │                                   listed, registry saved)
        └──(DELETE /api/agents/:id)──▶ ARCHIVED (hidden from list(), record
                                        kept in registry file; a RUNNING agent
                                        is killed first)
```
Registry file `.mission-control/agents.json` (JSON array of `AgentInfo &
{archived?: boolean}`) lives at `process.cwd()`, rewritten synchronously on every
create/rename/exit/archive (kill saves via its pty onExit, not synchronously).
On backend restart every entry is reloaded as
status `'exited'` (no pty, no buffer) so the panel survives a restart; archived
entries stay hidden from `list()` but remain in the file. Session transcript
JSONL is never touched by any of this.

SIGINT semantics: Ctrl-C is a keystroke (`\x03` via agent-input) — interrupt turn,
NOT terminate. Only kill/archive terminates the pty.

## 4. UI layout & flows

```
┌──┬─Files│Agents│Transcript│Live Chat│Ruleset│Debug──────────────┐
│⧉ │                 AGENTS VIEW (viewMode 'agents')              │
│──│  agent 1 ▸ [Raw|Calm]                                        │
│●1│  ┌───────────────────────────┬─────────────────────────────┐ │
│ 2│  │ RAW (xterm.js)            │ CALM                        │ │
│ 3│  │ byte-exact claude TUI     │  💬 assistant text           │ │
│ +│  │                           │  ⚙ Bash: npm test           │ │
│──│  │ (only one of Raw/Calm     │  ── subagents (live) ──     │ │
│  │  │  visible at a time —      │  ▸ explore-api   ● running  │ │
│  │  │  toggle, both stay live)  │  ▸ fix-tests     ✓ done     │ │
│  │  └───────────────────────────┴─────────────────────────────┘ │
└──┴──────────────────────────────────────────────────────────────┘
 ▲ SidePanel: mounted in the shell row (components/index.tsx), OUTSIDE the
   per-viewMode switch — persists across tabs. Collapsed = icon-only rail
   (fully collapsed like Claude desktop; header toggle button). Clicking an
   agent sets activeAgentId AND viewMode='agents'.
```

Switching flows:
```
click agent 2 ──▶ activeAgentId='ag2' ──▶ xterm #2 visible (buffer intact),
                                          calm feed #2 visible
switch to Files tab, come back ──▶ nothing lost (xterms stay mounted, hidden)
page reload ──▶ agentSocket reconnects ──▶ re-subscribe all agents ──▶
                agent-replay (buffer snapshot) rewrites each xterm
ws drop ──▶ backoff reconnect 0.5s→8s ──▶ same re-subscribe + replay path
```

## 5. Frozen wire protocol (ws) — DO NOT DEVIATE

Client → server (JSON):
```
{type:'agent-subscribe', agentId}                 → server sends agent-replay, then live agent-data
{type:'agent-input',     agentId, data}           → TerminalManager.write (data = raw keystrokes)
{type:'agent-resize',    agentId, cols, rows}     → TerminalManager.resize
{type:'watch-session',   projectDir, sessionId}   → EXISTING, but now ADDITIVE per socket
                                                    (Map<socket, Map<sessionId, watchers>>) and
                                                    ALSO starts a SubagentWatcher for the session
{type:'unwatch-session', projectDir, sessionId}   → stop+remove this socket's watcher pair for
                                                    sessionId (new-dialect only; invalid → ignored)
```
Server → client (JSON):
```
{type:'agent-replay',      agentId, data}                    // full AgentBuffer snapshot
{type:'agent-data',        agentId, data}                    // live pty bytes
{type:'agent-exit',        agentId, exitCode}                // exitCode: number|null
{type:'agents-changed',    agents: AgentInfo[]}              // on create/exit/delete
{type:'transcript-event',  sessionId, event}                 // EXISTING, unchanged
{type:'watch-started',     sessionId}                        // EXISTING, unchanged shape
{type:'subagents-changed', sessionId, subagents: SubagentSummary[]}
{type:'subagent-event',    sessionId, subagentId, event}     // event = parsed transcript event
```
Types:
```
AgentInfo       = {agentId, title, sessionId, projectDir, cwd, status:'running'|'exited', createdAt}
SubagentSummary = {subagentId, agentType, description, toolUseId, spawnDepth}
```
REST:
```
POST   /api/agents             {title?, cwd?} → 201 AgentInfo
GET    /api/agents             → {agents: AgentInfo[]}
PATCH  /api/agents/:agentId    {title} → 204 (rename; 404 unknown, 400 missing/non-string title)
POST   /api/agents/:agentId/kill → 204 (kill; 204 also if already exited; 404 unknown)
DELETE /api/agents/:agentId    → 204 (archive: hide from list, keep registry+transcript; 404 unknown)
```

## 6. Frozen module contracts

`src/backend/terminal/manager.ts` (+ `buffer.ts`; tests in `terminal/tests/`):
```
class TerminalManager {
  constructor(registryPath?: string)                       // default .mission-control/agents.json
  create(opts: {title?: string; cwd: string}): AgentInfo   // mints ids, spawns pty
  write(agentId: string, data: string): boolean             // false if pty absent (restored agent)
  resize(agentId: string, cols: number, rows: number): boolean // false if pty absent
  rename(agentId: string, title: string): boolean            // persists to registry
  kill(agentId: string): boolean                             // terminate pty, KEEP record+buffer
  archive(agentId: string): boolean                          // kill if running, hide from list()
  snapshot(agentId: string): string                        // AgentBuffer contents, '' if no buffer
  list(): AgentInfo[]                                       // excludes archived
  onData(cb: (agentId: string, data: string) => void): void   // single subscriber (server)
  onExit(cb: (agentId: string, exitCode: number | null) => void): void
}
class AgentBuffer { push(data: string): void; snapshot(): string }  // 2MiB cap, drop oldest chunks
```
- `AgentRecord.ptyProcess` and `.buffer` are OPTIONAL (absent on registry-restored,
  never-relaunched agents); `AgentInfo.status` stays `'running'|'exited'` on the wire —
  `archived` is a record-only flag, never sent to clients.
- Registry: JSON array of `AgentInfo & {archived?: boolean}`, rewritten synchronously
  (`writeFileSync`/`mkdirSync`) on create/rename/kill/exit/archive. A corrupt/missing
  file starts empty rather than crashing.
- claude CLI path: `ConfigManager.load().claudeCliPath || 'claude'` (same as executor).
- ENV SCRUB (verified live): spawn env = `process.env` minus every key matching
  `/^CLAUDE|^ANTHROPIC/`. Inherited nested-session vars (e.g. CLAUDE_CODE_CHILD_SESSION)
  silently DISABLE transcript persistence — without the scrub, calm view gets no data
  when the backend itself was launched from inside a Claude Code session.
- `projectDir` in AgentInfo = `encodeCwd(cwd)` from `transcript/parser.ts`.
- node-pty prebuild gotcha: `spawn-helper` may lack exec bit → package.json postinstall
  `chmod +x node_modules/node-pty/prebuilds/*/spawn-helper` (glob-safe, `|| true`).

`src/backend/transcript/subagents/index.ts`:
```
class SubagentWatcher {
  constructor(projectDir: string, sessionId: string, emit: (msg: object) => void)
  start(): void   // poll session's subagents/ dir (500ms): new agent-*.jsonl → tail it
  stop(): void    // stop all tails + dir poll
}
```
- Reuses SessionWatcher-style tailing (partial-line safe, eventKey dedupe) per subagent file.
- Emits `subagents-changed` when the meta set changes, `subagent-event` per parsed line.
- Subagent running/done status is NOT computed here — frontend joins parent
  `tool_result` by `toolUseId` (existing subagent/index.tsx idiom).

`src/frontend/lib/agentSocket/index.ts` (tests beside it, same dir, 2-file max):
```
connect(): void                                   // singleton ws, reconnect backoff 0.5s→8s
subscribeAgent(agentId, handlers: {onReplay(data), onData(data), onExit(code)}): void
unsubscribeAgent(agentId): void                   // local only
sendInput(agentId, data): void
sendResize(agentId, cols, rows): void
watchSession(projectDir, sessionId): void
unwatchSession(projectDir, sessionId): void  // stop watching (exited+hidden panes)
onAgentsChanged(cb): void
onTranscriptEvent(cb: (sessionId, event) => void): void
onSubagentsChanged(cb): void
onSubagentEvent(cb): void
```
- On reconnect: re-send agent-subscribe for every subscribed agent and watch-session
  for every watched session. onReplay implies the consumer resets (xterm.clear) first.
- Terminal bytes go straight to handler callbacks — NEVER through React state.

Frontend components (each new dir: ≤2 code files + its own `.css`):
```
components/sidepanel/{index.tsx,index.css}   SidePanel({agents, activeAgentId, collapsed,
                                             onToggle, onSelect, onCreate})  — presentational
components/agents/{index.tsx,terminal.tsx,index.css}
   AgentsView({agents, activeAgentId})       — owns raw/calm toggle state per agent;
   terminal.tsx: AgentTerminal({agent, visible}) — one xterm per agent, mounted once,
   hidden via CSS (not unmount); fit addon; one size policy: the visible pane fits
   to the panel and sendResizes its pty; hidden panes refit on reveal (rAF + fit)
components/agents/calm/{index.tsx,index.css}
   CalmView({agent, visible}) — transcript feed (reuse lib/upsertEvents + board icon
   idioms) + live subagent list (adapt subagent/index.tsx rendering)
```
Shell wiring (components/index.tsx + dashboard tab bar): add `'agents'` viewMode +
Agents tab; mount SidePanel outside the viewMode switch; agents/activeAgentId state
lives in the shell; sidepanel collapse state persisted to localStorage.

## 7. Coding standards (gate = `npm run lint`, ratchet total ≤ 630 — NEW CODE ADDS ZERO)

```
max 300 lines/file          │ identifiers ≥ 4 chars (except id, el)
≤ 2 statements/line         │ cognitive complexity ≤ 10
NO inline style= in JSX — module .css classes only
.ts functions ≤ 20 lines (does not apply to .tsx)
≤ 2 code files per directory (else subdirectory)   │ every .tsx dir has its own .css
tests: plain tsx + node:assert, registered in .github/workflows/ci.yml
```
Verification per task: `npx tsc --noEmit` clean; `npm run lint` total ≤ 630;
new tests pass via `npx tsx <file>`.

## 8. Task checklist

- [ ] T0 branch + .gitignore + deps (node-pty, @xterm/xterm, @xterm/addon-fit) + spec
- [ ] T1 TerminalManager + AgentBuffer + buffer test          (backend/terminal)
- [ ] T2 ws agent frames + replay + /api/agents + multi-watcher fix   (server)
- [ ] T3 SubagentWatcher: live subagents/*.jsonl tailing      (transcript/subagents)
- [ ] T4 agentSocket lib + reconnect/resubscribe + test       (frontend/lib/agentSocket)
- [ ] T5 SidePanel component (collapsible rail)               (components/sidepanel)
- [ ] T6 AgentsView + AgentTerminal (xterm) + shell wiring    (components/agents)
- [ ] T7 CalmView: live activity + live subagents             (components/agents/calm)
- [ ] V1 e2e verify: 2 agents, warm prompts, reload replay, live subagents, collapse
- [ ] V2 Opus audit of full diff vs this spec + fixes
- [ ] V3 gates green → commit → push → PR to main

Out of scope (explicitly): build system refactor, old Terminal/Live Chat tab, git
auto-commit changes, tmux, removing tracked node_modules (pre-existing debt, noted in PR).
