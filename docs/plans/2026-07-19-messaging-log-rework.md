# Messaging Log Rework — One-Night Battle Plan

- **Date:** 2026-07-19
- **Branch:** `kimi/messaging-rework`
- **Author:** kimi (work buddy)
- **Worktree:** `/Users/christopherdasca/Programming/Novakai-Command-kimi-messaging` — NEVER touch the main checkout at `/Users/christopherdasca/Programming/Novakai-Command` (its live instance owns ports 3031/3030; we run on 3131/3130).

## 1. Goals

- **G1 — One envelope log as the source of truth.** Studio composer chat is recorded as envelopes (record-first); PTY typing becomes a delivery detail. Store gains an in-memory index so queries stop re-reading the whole file, with single-writer discipline.
- **G2 — First-class actors.** `chris` (the human) is a real actor: DMs to him return 201, persist in the log, and push to the UI over ws. Agent names are validated against reserved names (`chris`, `#team`, `#*`, `room_*`).
- **G3 — Delivery adapter seam.** Delivery goes behind a small `MessageDeliveryAdapter` interface: `PtyDeliveryAdapter` (today's typing) + `HumanDeliveryAdapter` (log + ws). Room delivery failures are reflected in envelope status — no more silent `catch {}`.
- **G4 — Kimi PTY provider.** `kimi` (CLI at `/Users/christopherdasca/.kimi-code/bin/kimi`, v0.27.0) becomes a third spawnable provider mirroring the claude/codex pattern, including session-id handling and the nvk-msg spawn briefing.

## 2. Non-Goals (explicit)

- No store-engine rebuild: JSONL append-only stays; no compaction, no file locking, no second store file.
- No ws-dialect unification, no AgentCoordinator/Executor merge, no UI redesign.
- No typed-block schema work — the owner's north star (everything as typed blocks in one log) is acknowledged by keeping the envelope the single record; we do NOT design the block system tonight.
- No multi-human support, auth, presence, or read receipts.
- codex provider untouched behaviorally — its binary is not installed on this machine.

## 3. Design Overview (~10 lines)

The pipeline becomes: **append envelope → route → deliver via adapter → amend status**. `messages.jsonl` is the record; PTY typing, ws push, and future API-native agents are delivery adapters behind one interface. A pure `resolveActor()` resolver (human constant + live roster + rooms + channels — persists nothing new) maps a recipient name to its adapter. chris' inbox = `GET /api/messages?withAgent=chris` plus the existing `message-envelope` ws broadcast. The store keeps fold-by-id last-wins semantics but maintains the folded Map incrementally from appends; a per-query size/mtime probe on the file keeps `nvk-msg.mjs` file-fallback appends (server-down path) visible. Writes stay synchronous (`appendFileSync`) inside one process — the event loop is the single writer; `updateStatus` reads only the in-memory index, making fold+append atomic.

## 4. Task Breakdown (execute in order)

### Task 1 — Store: in-memory index + external-append probe
**Files:** `src/backend/messaging/store/index.ts`; new `src/backend/messaging/tests/store.test.ts`
**Do:**
- Fold once (lazy, on first use); every `append()` updates the in-memory `byId` Map after the file write succeeds.
- `history()` / `readChannel()` serve from memory after a cheap `statSync` probe: if file size/mtime changed since last fold, re-fold first (covers hand edits + nvk-msg fallback).
- `updateStatus()` folds from memory only — no full re-read.
**Acceptance:** `npx tsx src/backend/messaging/tests/store.test.ts` passes (append visibility, external-append visibility, last-wins); existing `api.test.ts` + `address.test.ts` stay green.
**Do NOT:** add compaction, async fs, locks, or a write queue abstraction — sync writes in one process are already serialized.

### Task 2 — Actor registry + reserved-name guard
**Files:** new `src/backend/messaging/actors/index.ts`; touch `src/backend/messaging/address/index.ts` (`isNameTaken`), `src/backend/server/agents.ts` (spawn + rename); new `src/backend/messaging/tests/actors.test.ts`
**Do:**
- `resolveActor(name, roster, rooms)` → `{ kind: 'human' | 'agent' | 'room' | 'channel', ... } | null`. Human = the `CHRIS_MEMBER` constant. No new persistence file.
- Reserved set: `'chris'`, `'#team'`, anything matching `/^#/` or `/^room_/` — rejected inside `isNameTaken`, so both `POST /api/agents` and `PATCH /api/agents/:id` return 409.
**Acceptance:** actors.test.ts — `resolveActor('chris')` → human; spawn titled `chris` / `#team` / `room_x` → 409.
**Do NOT:** build actor profiles, settings, presence, or per-actor inboxes beyond the log itself.

### Task 3 — Delivery adapter seam + room failure status
**Files:** `src/backend/messaging/delivery/index.ts` (interface + two adapters), `src/backend/messaging/router/index.ts` (adapter selection, room accounting), `src/backend/messaging/index.ts` (wiring); new `src/backend/messaging/tests/delivery.test.ts`
**Do:**
- `interface MessageDeliveryAdapter { deliver(target, envelope, line?): Promise<DeliveryReceipt> }`.
- `PtyDeliveryAdapter` = today's `PtyDelivery` (wrap it; keep the class exported for existing tests).
- `HumanDeliveryAdapter`: returns a receipt with `mode: 'ui'` — persistence and ws push already happen via `store.onAppend → broadcast('message-envelope')`. It exists so the router is uniform and future API-native agents slot in here.
- Router `routeDirect`: `resolveActor` first — human → HumanDeliveryAdapter, agent → PtyDeliveryAdapter, unknown → `RecipientNotFoundError` (unchanged).
- Router `routeRoom`: collect per-member failures; ANY failure → `settle('failed')` and throw an error naming the failed members; `'delivered'` only when every live member received the write. Sender and `chris` still skipped for PTY (chris reads room posts via log/ws).
**Acceptance:** delivery.test.ts — fake writer throws for one member → envelope status `failed`; DM to `chris` → 201, status `delivered`, broadcast fired.
**Do NOT:** add retries, per-member status sub-records, or a dead-letter queue.

### Task 4 — Composer records first
**Files:** `src/frontend/components/studio/chat/composer.tsx`
**Do:**
- `send()` → `POST /api/messages { from: 'chris', to: runtimeAgent.title, delivery: 'normal', body }` instead of raw `sendInput(agentId, text)` + Enter. The server's PtyDeliveryAdapter types it into the PTY — same net effect, now recorded. (Adapter `type()` already splits text/`\r` with the same 150ms cadence.)
- Keep the optimistic row (`onSent`) and surface 4xx/5xx in the composer error line.
**Acceptance:** manual — composer send appears in `GET /api/messages?withAgent=<name>` and in `messages.jsonl`; the agent's PTY visibly receives the line.
**Do NOT:** remove the `agent-input` ws path (raw terminal typing elsewhere uses it); do NOT rebuild the chat panel or tunnel view.

### Task 5 — Kimi provider
**Files:** `src/shared/project/schema.ts` (`ProviderId`, `providerId()`), `src/backend/terminal/provider/index.ts` (provider table), new `src/backend/terminal/provider/kimiDiscovery.ts` (mirror `codexDiscovery.ts`), `src/backend/config/index.ts` (`kimiCliPath`), `src/backend/server/agents.ts` (provider validation), `src/backend/messaging/types.ts` (`AgentAddress.provider`), `src/frontend/components/studio/chat/composer.tsx` (PROVIDERS/LAUNCH_LABELS)
**Do:**
- Widen `ProviderId` to `'claude' | 'codex' | 'kimi'` everywhere the union is hand-written (schema, AgentAddress, AgentsHub's `provider === 'codex' ? ... : 'claude'` → validate against the full set).
- Refactor `providerArguments`/`providerEnvironment`/`spawn` into a per-provider table `{ args(sessionId), scrub(env), resolveSession }` — claude/codex branches stay byte-identical.
- Kimi spawn: binary from config `kimiCliPath`, default `/Users/christopherdasca/.kimi-code/bin/kimi`; launch interactive TUI (no args) in the PTY; `resolveCli` already handles absolute paths.
- Session id: codex-style discovery — snapshot `~/.kimi-code/session_index.jsonl` before spawn, wait for a new line whose `workDir` equals the spawn cwd, take its `sessionId`. (Observed line shape: `{"sessionId":"session_<uuid>","sessionDir":...,"workDir":...}`, append-only.) Implementation-time experiment: if `kimi --session session_<uuid>` proves to create-if-missing, switch to claude-style synchronous resolution instead.
- Briefing: `composeSpawnBriefing` is provider-agnostic and `handleAgentSpawned` fires for every launch — just verify kimi's TUI accepts the typed text + `\r`. Esc for interrupt is assumed claude-like; if not, the existing `interruptSequence(provider)` hook is the one-line seam.
**Acceptance:** `POST /api/agents {"provider":"kimi"}` → 201; kimi TUI boots; sessionId resolves; briefing lands; `GET /api/agents` shows provider `kimi`.
**Do NOT:** wire `kimi -p` headless mode, `--output-format`, ACP, or `kimi server` — PTY parity only.

### Task 6 — Tests for the new seams
**Files:** the three new test files above + extend `api.test.ts` (chris DM 201, reserved-name 409s).
**Do:** plain `tsx` + `node:assert`, matching existing style. Run the whole suite plus `npm run lint`.
**Do NOT:** introduce vitest/jest or restructure existing tests.

### Task 7 — Live end-to-end (section 5)
**Acceptance:** every check below passes.

## 5. Test & Verification Plan

Unit/integration (from the worktree root):

```
npx tsx src/backend/messaging/tests/address.test.ts
npx tsx src/backend/messaging/tests/api.test.ts
npx tsx src/backend/messaging/tests/store.test.ts
npx tsx src/backend/messaging/tests/actors.test.ts
npx tsx src/backend/messaging/tests/delivery.test.ts
npm run lint
```

Live end-to-end (worktree only; main instance keeps 3031/3030):

```
export NOVAKAI_SERVER_PORT=3131 NOVAKAI_APP_PORT=3130
npm run dev:backend &          # backend on :3131
npx vite --port 3130 --host &  # frontend on :3130
B=http://127.0.0.1:3131
H='content-type: application/json'
W=/Users/christopherdasca/Programming/Novakai-Command-kimi-messaging

# spawn one claude + one kimi
curl -s -X POST $B/api/agents -H "$H" -d "{\"title\":\"claude-1\",\"provider\":\"claude\",\"cwd\":\"$W\"}"
curl -s -X POST $B/api/agents -H "$H" -d "{\"title\":\"kimi-1\",\"provider\":\"kimi\",\"cwd\":\"$W\"}"
# reserved-name guard
curl -s -X POST $B/api/agents -H "$H" -d '{"title":"chris","provider":"kimi"}'   # expect 409

# room with both agents + chris
ROOM=$(curl -s -X POST $B/api/rooms -H "$H" \
  -d '{"name":"night-ops","members":["chris","claude-1","kimi-1"],"from":"chris"}' | jq -r .room.roomId)

# room post (PTY-delivered to kimi-1; chris reads via log/ws)
curl -s -X POST $B/api/messages -H "$H" \
  -d "{\"from\":\"claude-1\",\"to\":\"$ROOM\",\"delivery\":\"normal\",\"body\":\"room hello\"}"
# DM kimi-1 → claude-1
curl -s -X POST $B/api/messages -H "$H" \
  -d '{"from":"kimi-1","to":"claude-1","delivery":"normal","body":"dm hi"}'
# DM claude-1 → chris (404 before tonight; 201 now)
curl -s -X POST $B/api/messages -H "$H" \
  -d '{"from":"claude-1","to":"chris","delivery":"normal","body":"boss ping"}'
# composer path (exactly what the UI now does)
curl -s -X POST $B/api/messages -H "$H" \
  -d '{"from":"chris","to":"kimi-1","delivery":"normal","body":"composer check"}'

# verify the log is the single record
curl -s "$B/api/messages?limit=50" | jq '.messages | length'      # ≥ 4 sends above
curl -s "$B/api/messages?withAgent=chris" | jq '.messages[].body' # chris' inbox
grep -c '' "$W/.novakai-command/messages.jsonl"                   # sends + amendments
```

**Pass criteria:** all sends return 201 with `delivered`; every envelope and status amendment is in `messages.jsonl`; kimi-1's PTY visibly shows the `[nvk-msg …]` / `[nvk-room …]` lines; the chris DM no longer 404s. **Bonus:** let either agent reply via `scripts/nvk-msg.mjs` and confirm the reply lands in the log.

## 6. Risks & Known Debts

**Risks**
- codex is NOT installed on this machine (claude at `~/.local/bin/claude`, kimi at `~/.kimi-code/bin/kimi`). The provider-table refactor must keep codex branches byte-identical — verified by review only, no live codex test tonight.
- Kimi TUI input semantics (Esc interrupt, typed-line submission) are assumed claude-like; if Esc differs it goes into `interruptSequence(provider)` — caught by the live run, one-line fix.
- Kimi session discovery depends on `~/.kimi-code/session_index.jsonl` shape. If the index lags or the shape changes, discovery must time out and fail the spawn loudly (same contract as `CodexSessionLocator`).
- Stale-cache risk if `messages.jsonl` is hand-edited between probes — covered by the size/mtime probe; a backend restart always re-folds.
- Composer→REST adds one local hop before the PTY write; the optimistic row keeps the UI feel unchanged.

**Known debts (explicitly not tonight)**
- Three ws dialects; frontend hand-mirrored backend types.
- `src/backend/agent/` AgentCoordinator/Executor remains a separate world from the messaging tunnel.
- No compaction/retention for `messages.jsonl`; fold cost moved to boot, not removed.
- Room delivery is all-or-nothing across live members; no per-member receipts.
- `#team` pull-only channel semantics unchanged; no Messages UI view yet (ws frames already broadcast).
