# Novakai Team Operations

Two operational scripts keep multi-agent work observable across running
Novakai Command backends.

## Live direct messages

Discover every agent across one or more backends:

```sh
node scripts/nvk-live.mjs roster \
  --backend http://127.0.0.1:3031 \
  --backend http://127.0.0.1:3131
```

Deliver directly into a running agent's PTY:

```sh
node scripts/nvk-live.mjs send \
  --backend http://127.0.0.1:3031 \
  --to "#1 Product Plan" \
  --from codex-analytics \
  "Status and handoff"
```

`--interrupt` sends Escape before delivery. Reserve it for genuine blockers.
Delivery receipts mean PTY injection succeeded, not that work completed.

## Automatic oversight

Print one correlated agent/subagent snapshot:

```sh
node scripts/nvk-oversee.mjs once \
  --backend http://127.0.0.1:3031 \
  --stale 180
```

Continuously notify the lead only when states change:

```sh
node scripts/nvk-oversee.mjs watch \
  --backend http://127.0.0.1:3031 \
  --backend http://127.0.0.1:3131 \
  --monitor "#1 Product Plan" \
  --monitor "Fable support ftw" \
  --interval 15 \
  --stale 180 \
  --heartbeat 600 \
  --notify "#1 Product Plan"
```

Oversight joins the live roster, parent transcripts, and subagent metadata.
Repeat `--monitor` for each lead, preventing unrelated-team noise.
Notifications fire on state changes, plus one ten-minute heartbeat.
Async launch acknowledgements remain running until completion evidence arrives.
Missing transcript support renders unavailable; it never fabricates clean state.

## Zero-downtime development

Agent terminals belong to the detached `TerminalHost`, not the backend.
Backend restarts reconnect through the versioned owner-only Unix socket.
The host replays each agent buffer using monotonic output cursors.

`npm run dev` watches backend sources and restarts changed code automatically.
Backend and frontend processes restart independently. The desktop shell retries
failed loads. Its stable process owns the host lease; quitting the desktop ends
that lease and reaps the detached host.

The dev lane (`npm run dev`, vite :3130 + backend :3131) is the standing
second stack; ad-hoc scratch backends should pick 3231+ so they never collide
with it. Backends using `NOVAKAI_SERVER_PORT` receive isolated in-process
terminals and a port-specific registry. They never attach production PTYs.
Restart acceptance rigs may add `NOVAKAI_TERMINAL_RUNTIME=host`; this starts a
port-specific detached host and still cannot attach production PTYs.

## Merge protocol

1. Create a named worktree and branch from current `main`.
2. Never edit the shared `main` checkout directly.
3. Coordinate file ownership through the team tunnel.
4. Rebase or merge current `main` inside your worktree.
5. Run focused tests with `npx tsx <test-file>`.
6. Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
7. Browser-verify the changed workflow using `tools/browse`.
8. Post branch, commits, evidence, and blockers to `#team`.
9. Announce before integrating into `main`.
10. Merge only after Helm confirms ownership and evidence.

Pulling or merging `main` may restart watched backend code. The terminal host
continues unchanged from its immutable launch snapshot, then the new backend
reconnects and restores roster, terminal identity, and buffered output.

## Protocol upgrades

The socket filename includes the terminal-host protocol version. An upgraded
backend never connects to an incompatible host. Existing hosts continue serving
their loaded snapshot until their desktop lease ends; new versions start beside
them without mutating the running contract.

## Recovery checks

- Confirm the desktop process remains alive.
- Inspect `.novakai-command/terminal-host/host.log`.
- Confirm the socket mode is `0600`.
- Check `/api/agents` preserves `agentId` and `terminalPid`.
- Verify buffered output replays once after reconnection.
- Verify queued input appears exactly once.

## Verification

```sh
node scripts/team/channel.test.mjs
node scripts/team/oversight.test.mjs
npm run lint
npx tsc --noEmit
```
