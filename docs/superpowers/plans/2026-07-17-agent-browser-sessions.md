# Agent Browser Sessions — Implementation Plan

> **For agentic workers:** Implement task-by-task with TDD. Steps use `- [ ]` checkboxes.

**Goal:** Give each agent its own isolated, off-screen Chrome so parallel agents never fight over a shared tab and never steal the user's foreground.

**Architecture:** A backend module `src/backend/browser/` mirroring the existing `terminal/` module. Pure domain (lease, allocation policy) + an application `SessionBroker` (get-or-create per session id, persisted to a JSON registry, depends on an injected `BrowserProvider` port) + impure adapters (`ChromePool` spawns headless Chrome on an ephemeral debug port with its own user-data-dir; `CdpControl` drives one target over CDP, never `bringToFront`). A thin `cli.ts` binds a session id and forwards a verb. No daemon: Chrome processes persist between CLI runs and the registry file reconnects them (same model as `~/.claude/browse`).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), `playwright-core` (connectOverCDP), Node `child_process`/`fs`, tests via `node:assert` run with `npx tsx`.

## Global Constraints

- ESM only; import specifiers end in `.js`. Match `src/backend/terminal/` style.
- Tests run with `npx tsx <file>`; use `node:assert/strict`; **never spawn real Chrome in a unit test** — inject a fake `BrowserProvider` (mirrors terminal tests' "NEVER call create()").
- Never call `Page.bringToFront` / `Target.activateTarget`. Launch headless (`--headless=new`) so no window can steal foreground.
- Each instance: unique ephemeral debug port (OS-assigned free port, never 9222) + unique temp `--user-data-dir`.
- Lint gate: `node tools/gates/standards.mjs` must pass.

## File Structure

- `src/backend/browser/types.ts` — shared types (pure data shapes).
- `src/backend/browser/lease.ts` — pure lease functions.
- `src/backend/browser/policy.ts` — pure allocation decision.
- `src/backend/browser/broker.ts` — `SessionBroker` + `BrowserProvider` port (application; persists registry).
- `src/backend/browser/provider/chrome-pool.ts` — real `BrowserProvider` (spawns headless Chrome).
- `src/backend/browser/provider/cdp-control.ts` — `CdpControl` (drives a target over CDP).
- `src/backend/browser/provider/ports.ts` — free-port + chrome-path helpers, `BrowserControl` interface.
- `src/backend/browser/cli.ts` — thin CLI client.
- `src/backend/browser/tests/{lease,policy,broker}.test.ts` — unit tests (fakes only).
- `scripts/browser-e2e.mjs` — real end-to-end proof (spawns 2 headless Chromes, isolation check).

---

### Task 1: Pure domain — types, lease, policy

**Files:** Create `types.ts`, `lease.ts`, `policy.ts`, `tests/lease.test.ts`, `tests/policy.test.ts`.

**Produces:**
- `isLeaseExpired(session: {leaseExpiresAt: string}, now: Date): boolean`
- `leaseExpiresAt(now: Date, ttlMs: number): string`
- `decideAllocation(existing: Session | undefined, instanceAlive: boolean, now: Date): Allocation`
- Types: `Session`, `SessionHandle`, `BrowserInstance`, `LaunchSpec`, `BrowserCommand`, `ActionResult`, `Allocation`, `SessionStatus`.

- [ ] Write `tests/lease.test.ts`: expired when `leaseExpiresAt <= now`; not expired otherwise; `leaseExpiresAt(now, 1000)` is now+1s ISO.
- [ ] Write `tests/policy.test.ts`: `undefined` → `{kind:'launch'}`; active + alive + unexpired → `{kind:'reuse'}`; expired → launch; dead instance → launch; released → launch.
- [ ] Run both, expect FAIL (modules missing).
- [ ] Implement `types.ts`, `lease.ts`, `policy.ts`.
- [ ] Run both, expect PASS. Commit.

### Task 2: SessionBroker (application, registry-persisted, fake provider)

**Files:** Create `broker.ts`, `tests/broker.test.ts`.

**Consumes:** Task 1 exports.
**Produces:**
- `interface BrowserProvider { launch(spec: LaunchSpec): Promise<BrowserInstance>; dispose(instance: BrowserInstance): Promise<void> }`
- `class SessionBroker { constructor(deps: { provider: BrowserProvider; registryPath: string; now?: ()=>Date; ttlMs?: number; isAlive?: (pid:number)=>boolean }); acquire(sessionId, agentId): Promise<SessionHandle>; release(sessionId): Promise<void>; list(): SessionHandle[]; sweep(): Promise<void>; record(sessionId, url): void }`

- [ ] Write `tests/broker.test.ts` with a `FakeProvider` (counts launches, records disposes, returns synthetic `BrowserInstance{pid,port,userDataDir,cdpEndpoint}`) and a temp registry file + injected `now`/`isAlive`:
  - first `acquire('s1','a')` launches once; second `acquire('s1','a')` **reuses** (launch count stays 1).
  - two different ids → two launches with distinct instances (isolation).
  - `acquire` persists to registry file; a fresh broker over same file reuses without launching (reconnect across CLI runs).
  - expired lease → `acquire` disposes old + launches new.
  - `isAlive` false → dispose old + relaunch.
  - `release('s1')` disposes instance and drops it from `list()`.
- [ ] Run, expect FAIL.
- [ ] Implement `broker.ts` (load/save registry JSON like `TerminalManager`; `acquire` = sweep → `decideAllocation` → reuse-renew or launch-persist).
- [ ] Run, expect PASS. Commit.

### Task 3: Real adapters — ChromePool + CdpControl

**Files:** Create `provider/ports.ts`, `provider/chrome-pool.ts`, `provider/cdp-control.ts`.

**Consumes:** `BrowserProvider`, types.
**Produces:**
- `freePort(): Promise<number>`, `resolveChromePath(): string`
- `interface BrowserControl { act(cdpEndpoint: string, cmd: BrowserCommand): Promise<ActionResult> }`
- `class ChromePool implements BrowserProvider`
- `class CdpControl implements BrowserControl`

- [ ] Implement `ports.ts` (free port via `net.createServer(0)`; chrome path from `CHROME_PATH` env or `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).
- [ ] Implement `chrome-pool.ts`: spawn `--headless=new --remote-debugging-port=<port> --user-data-dir=<tmp> --no-first-run --no-default-browser-check --disable-background-timer-throttling about:blank`, detached+unref; poll `http://127.0.0.1:<port>/json/version` until ready; return instance. `dispose`: `process.kill` + rm temp dir.
- [ ] Implement `cdp-control.ts`: `connectOverCDP(endpoint,{noDefaults:true})`, act on last page (goto/click/type/press/text/shot), `browser.close()` in finally (detaches, Chrome stays). No `bringToFront`.
- [ ] Commit (covered by the Task 5 e2e; no unit test spawns Chrome).

### Task 4: CLI

**Files:** Create `cli.ts`.

**Consumes:** `SessionBroker`, `ChromePool`, `CdpControl`.
- [ ] Parse `--session <id>` (or `NVK_SESSION`), agent from `NVK_AGENT` (default `local`), then `<verb> [args]`. Build `BrowserCommand`. `acquire` → `act(handle.cdpEndpoint, cmd)` → on goto call `broker.record`. Print `ActionResult` (url/title/text/shotPath) to stderr; write nothing else to stdout except requested text. `release` verb → `broker.release`.
- [ ] Manual smoke: `NVK_SESSION=smoke npx tsx src/backend/browser/cli.ts goto about:blank` prints the url. Commit.

### Task 5: Real end-to-end isolation proof

**Files:** Create `scripts/browser-e2e.mjs`.
- [ ] Write two temp HTML files with distinct big text (`SESSION-ALPHA`, `SESSION-BRAVO`). Concurrently run two sessions (`alpha`, `bravo`), each `goto file://…` then `shot` to a temp PNG. Assert: two distinct instances (different ports/pids in registry), each screenshot exists and is non-trivial size. Print the two PNG paths.
- [ ] Run it; **read both PNGs** to confirm each shows the correct text (real render, no cross-talk). Confirm the user's 9222 Chrome active tab is unchanged (no foreground steal). Commit.

### Task 6: Lint, full test sweep, PR
- [ ] `node tools/gates/standards.mjs` passes (fix any findings).
- [ ] Run all three unit tests green.
- [ ] Open PR to `novakai-command` with summary + the isolation-proof screenshots described.
