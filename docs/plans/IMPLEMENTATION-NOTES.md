# Messaging Log Rework — Implementation Notes

- **Date:** 2026-07-19 (one-night build)
- **Branch:** `kimi/messaging-rework`, worktree `Novakai-Command-kimi-messaging`
- **Plan executed:** `2026-07-19-messaging-log-rework.md`, tasks 1–6 (task 7 live e2e is a later phase)

## What was built, per task

1. **Store index + probe** (`store/index.ts`, `tests/store/index.test.ts`). Lazy one-time fold; `append()` maintains the in-memory `byId` map (snapshot copies — the router mutates envelopes after append) and refreshes a size/mtime fingerprint. `history()`/`readChannel()` serve from memory, re-folding only when the probe differs (covers hand edits + `nvk-msg.mjs` file-fallback appends). `updateStatus()` reads the index only.
2. **Actor registry + reserved-name guard** (`actors/index.ts`, `address/index.ts`). Pure `resolveActor(name, roster, rooms)` → human/agent/room/channel/null; persists nothing. `isReservedName()` = `chris`, `#*`, `room_*`; enforced inside `isNameTaken`, so spawn and rename both 409.
3. **Delivery adapter seam** (`delivery/index.ts`, `router/index.ts`). `MessageDeliveryAdapter` with `PtyDeliveryAdapter` (wraps `PtyDelivery`, still exported) and `HumanDeliveryAdapter` (receipt `mode: 'ui'`). `routeDirect` resolves the actor first: chris DMs → 201/delivered, no PTY write; unknown → `RecipientNotFoundError` as before. `routeRoom` collects per-member failures; any failure settles `failed` and throws `RoomDeliveryFailedError` (extends `DeliveryFailedError` → HTTP 502) naming the members.
4. **Composer records first** (`studio/chat/composer.tsx`). `send()` POSTs `/api/messages {from:'chris', to:<agent title>, delivery:'normal'}`; optimistic row kept, 4xx/5xx surface in the composer error line. `agent-input` ws path untouched.
5. **Kimi provider**. `ProviderId` widened to `'claude'|'codex'|'kimi'` (+ exported `PROVIDER_IDS`) across schema, `AgentAddress`, and hand-mirrored frontend unions. `provider/index.ts` is now a per-provider table `{args, scrub, cliPath, launch}`; claude/codex branches byte-identical. Kimi: interactive TUI, no args, binary from `kimiCliPath` (default `~/.kimi-code/bin/kimi`), `KIMI_*` scrubbed, session id discovered codex-style by `KimiSessionLocator` polling `~/.kimi-code/session_index.jsonl` for a new line whose `workDir` equals the spawn cwd (loud timeout, `cancelSessionWait` on early exit). `AgentsHub.createAgent` validates provider (absent→claude, unknown→400). `ThreadProjector` sources became `Partial` — a kimi session reference degrades to a projection issue, not a crash.
6. **Tests**. New `tests/store|actors|delivery/index.test.ts` + `provider/tests/kimi/index.test.ts`; `api.test.ts` extended (chris DM 201, reserved-name 409s on spawn + rename via `AgentsHub` over a fake `TerminalRuntime`, kimi 201 / bogus 400).

## Verification (all green at commit time)

- All 13 touched-area test files pass via `npx tsx <file>` (messaging ×7, terminal/provider ×5, projector ×1).
- `npx tsc --noEmit` clean. `npm run lint` at baseline 201 (zero new warnings).
- Boot smoke on 3131/3130 (no agents spawned): reserved name → 409, bogus provider → 400, chris DM → 201 `delivered` and visible in `GET /api/messages?withAgent=chris`.

## Deviations from the plan (all forced by the lint gate)

- **File placement.** The standards gate caps code files per directory at 2, so: kimi discovery lives at `src/backend/terminal/provider/kimi/index.ts` (not `provider/kimiDiscovery.ts`), and new tests live in `tests/store/`, `tests/actors/`, `tests/delivery/`, `provider/tests/kimi/` subdirectories (not flat `tests/*.test.ts`).
- **Provider validation is strict.** Unknown `provider` strings now 400 instead of silently becoming `claude` (absent still defaults to `claude`). No client in-repo sends anything else.
- **Room failure status code.** Unspecified in the plan; `RoomDeliveryFailedError` extends `DeliveryFailedError` so partial room failure answers **502** with the envelope settled `failed`.

## Watch-outs for the live e2e phase (task 7)

- **Concurrent same-cwd kimi spawns race session discovery.** The codex pending-cwd guard was left codex-only (byte-identical mandate). Two kimi agents spawned into the *same* cwd before the first one's index line lands can both resolve to the same `sessionId`. Spawn kimi agents sequentially or in distinct cwds; generalize `pendingCodexCwds` later if this bites.
- **Kimi TUI input semantics are assumed claude-like** (typed text + `\r` submits, Esc interrupts via the existing `interruptSequence` hook). If kimi's Esc differs, that's the one-line seam. Briefing delivery is provider-agnostic and already fires for kimi.
- **`kimi --session <id>` resume was not needed** — discovery worked from the observed append-only index shape (`{sessionId, sessionDir, workDir}`). If the index lags, the locator times out loudly after 300s (same contract as codex).
- **Kimi sessions are not projectable** — attaching one to a thread yields a "no session source" issue in the projection, by design tonight.
- **Composer→REST adds one local hop** before the PTY write; a dead backend now surfaces as a composer error instead of silent typing. Room posts to a room whose only live member's PTY died now return 502 (previously silent 201) — clients/scripts that fire-and-forget room posts should expect it.
- The worktree's `node_modules` is a symlink to the main checkout's (gitignored via `/node_modules`); `npx tsx` works fine through it.
