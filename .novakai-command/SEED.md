# Seed data — this worktree's messaging fixtures (round 3, M8e)

The two JSONL files next to this note are **review fixtures, not real
traffic**. They exist only in this worktree (`kimi/messaging-ui`) so the
messaging UI can be reviewed against populated lanes without touching the
owner's live backend. Owner doctrine: honest ugly data beats pretty fake
data — so here is exactly what is fake and why.

## What is seeded

- `messages.jsonl` — ~1900 envelopes. The earliest (from 2026-07-18) were
  hand/CLI-seeded for the messaging-UI rebuild reviews; `maya`, `atlas`,
  `orbit`, `nova`, and `sage` are fictional parties that exist ONLY in this
  file — they are not registered agents and no process will ever answer
  them. Later envelopes are real test traffic from rounds 1–3 of the
  rebuild (builder sessions in this worktree).
- `rooms.jsonl` — the rooms `messaging-studio`, `architecture-council`, and
  `release-readiness` were created as seed vehicles for the fictional
  parties above. Other rooms are real artifacts of round-testing.

## What this means when reviewing

- Presence dots next to seed names are always gray (offline) — correct, not
  a bug.
- A DM send to a seed name fails honestly at the router (404 roster hint);
  that is the truth of the fixture, not a UI defect.
- The storyboard design reference (`docs/plans/messaging-ui-round3-design/`)
  uses the SAME fictional names by coincidence of taste — neither is real
  data (plan item 17).

## How to reset

Stop the worktree backend, delete both files, restart — the store re-folds
from nothing and the tab opens on an honest empty state. Re-seed by sending
real messages through the UI or `scripts/nvk-msg.mjs`.
