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

## Verification

```sh
node scripts/team/channel.test.mjs
node scripts/team/oversight.test.mjs
npm run lint
npx tsc --noEmit
```
