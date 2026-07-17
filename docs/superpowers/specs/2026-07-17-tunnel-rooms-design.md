# Tunnel Rooms — Slack-style group chats between Chris and live agents

**Date:** 2026-07-17 · **Approved by:** Chris (Approach A) · **Orchestrator:** Group Chat (fable)

## Goal

Chris can start an ad-hoc group chat with any subset of live agents (e.g. himself +
one fable + one codex = 3-way). Every member sees every message: agents receive
posts injected into their PTY turn; Chris reads and writes from a unified
messenger in the studio. Agents can create rooms too.

## What exists today (contract we extend, never break)

- DMs: `POST /api/messages` → `MessageRouter.routeDirect` → PTY injection
  (`normal` queues into turn, `interrupt` breaks it). Append-only
  `messages.jsonl` audit store; every envelope broadcast over ws as
  `message-envelope`.
- `#team`: record-only channel — pull, never PTY-injected. **Unchanged.**
- Presence: `GET /api/agents` live roster (`status: 'running'`).
- Spawn briefing typed into each new agent PTY (`composeSpawnBriefing`).

## Model

```ts
interface Room {
  roomId: string;          // room_<uuid>
  name: string;            // Pascal Case display name
  members: string[];       // agent names + 'chris'
  createdBy: string;       // agent name or 'chris'
  createdAt: string;       // ISO
  archived: boolean;
}
```

- `'chris'` is a reserved member name: no PTY; his copy is the studio ws push.
- Room posts reuse `MessageEnvelope` with `to: room_<id>`.
- **Delivery is `normal` only.** `interrupt` to a room is rejected
  (`ChannelInterruptError` family) — nobody means "break everyone's turn."

## Routing semantics

1. Envelope appended to the store first (audit before delivery, as today).
2. Fan out to every **live** member agent except the sender: PTY injection via
   existing `PtyDelivery`, formatted `[nvk-room <name> from <sender> id <id>] <body>`.
3. Studio clients get the existing `message-envelope` ws broadcast.
4. Best-effort per member: an offline member or one failed injection does not
   fail the post — the message is in history (pull on next read, same as #team).
   Envelope status: `delivered` once fan-out completes; `failed` only if the
   room doesn't exist or sender isn't a member.
5. Membership changes are events in `rooms.jsonl` (append-only, replayed to
   build current state — same pattern as `messages.jsonl`).

## API contract (frontend builds against exactly this)

- `POST /api/rooms` `{name, members, from}` → `201 {room}`
- `GET /api/rooms` → `{rooms: Room[]}` (non-archived)
- `POST /api/rooms/:roomId/members` `{add: string[], from}` → `{room}`
- `POST /api/messages` `{from, to: "room_<id>", delivery: "normal", body}` — existing endpoint, room-aware
- `GET /api/messages?withRoom=room_<id>&since=&limit=` → `{messages}`
- ws: existing `message-envelope`; new `rooms-changed {rooms}`

## CLI (agents' hands)

`scripts/nvk-live.mjs` grows: `room create --name X --member A --member B`,
`room list`, and `send --to room_<id>` just works. `composeSpawnBriefing`
mentions rooms so every new agent knows the verbs.

## Studio UI — unified messenger (Tunnel lens grows into it)

- **Left rail:** presence roster (live agents, quiet dot for online) + chats
  list — rooms, DMs, #team as one list. Select agents → "Start Chat".
- **Center:** selected conversation transcript (markdown prose renderer reused)
  + composer. Chris posts as `'chris'`.
- **Calm grammar (non-negotiable):** near-monochrome; no badges/pills per row.
  At most ONE amber signal across the messenger — the single conversation that
  needs Chris now (a question addressed to him); resolving it releases the
  accent. 700ms structural motion. Pascal Case labels. Inter; mono only for
  real terminal output.

## Ownership split (two builders, no shared files)

- **Backend** — branch `feat/tunnel-rooms`, worktree `../Novakai-Command-rooms`:
  `src/backend/messaging/**` (rooms store + router fan-out + hub routes +
  briefing), `scripts/nvk-live.mjs`. Tests beside each module, run with
  `npx tsx <file>`.
- **Frontend** — branch `feat/tunnel-rooms-ui`, worktree
  `../Novakai-Command-rooms-ui`: `src/frontend/components/studio/chat/**`,
  `src/frontend/lib/tunnelModel/**`. Builds against the API contract above;
  rebases onto `feat/tunnel-rooms` once the backend API lands.

## Non-goals

Interrupt delivery in rooms; changing #team semantics; cross-backend rooms;
read receipts / typing indicators; MCP transport (still deferred).

## Acceptance

Gates: `npx tsc --noEmit`, `npm run lint`, `npm run build`, module tests via
`npx tsx`. Then the real bar: browser-drive with `tools/browse` — create a
room with two live agents from the studio, exchange messages all three ways,
watch both agent PTYs receive the posts, and the amber release on answering.
Merge to main via Helm only, evidence posted to #team.
