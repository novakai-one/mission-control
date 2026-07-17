# Tunnel Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ad-hoc group chats (rooms) between Chris and live agents — posts fan out into member agents' PTYs and into a unified studio messenger.

**Architecture:** Rooms are a new append-only store + router branch inside the existing messaging tunnel (spec: `docs/superpowers/specs/2026-07-17-tunnel-rooms-design.md`). The frontend Tunnel chat view grows into a unified messenger. Two independent tracks; the frontend codes against the API contract in the spec and rebases onto the backend branch when it lands.

**Tech Stack:** TypeScript, Express, ws, node:fs JSONL stores, React frontend. Tests run per-file with `npx tsx <file>` (NO vitest runner).

## Global Constraints

- Never edit the shared main checkout; work only in your assigned worktree.
- `#team` channel semantics unchanged (pull-only, never PTY-injected).
- Rooms are `delivery: 'normal'` only; interrupt to a room is rejected before recording.
- `'chris'` is a reserved member name with no PTY (studio ws is his copy).
- Calm UI grammar: near-monochrome, at most ONE amber signal, 700ms motion, Pascal Case labels, Inter (mono only for terminal output). No badges/pills per row.
- Gates before claiming done: `npx tsc --noEmit`, `npm run lint`, `npm run build`, module tests via `npx tsx`, and (frontend) browser-drive via `tools/browse`.
- Merges to main go through Helm only; post evidence to #team.

---

## Track B — Backend (worktree `../Novakai-Command-rooms`, branch `feat/tunnel-rooms`)

### Task B1: Room types + RoomStore

**Files:**
- Modify: `src/backend/messaging/types.ts`
- Create: `src/backend/messaging/rooms/index.ts`
- Test: `src/backend/messaging/rooms/rooms.test.ts`

**Interfaces (Produces):**
```ts
// types.ts additions
export interface Room {
  roomId: string;          // room_<uuid>
  name: string;
  members: string[];       // agent names + 'chris'
  createdBy: string;
  createdAt: string;       // ISO
  archived: boolean;
}
export const CHRIS_MEMBER = 'chris';
export function isRoom(recipient: string): boolean {
  return recipient.startsWith('room_');
}
/** PTY line for a room post. */
export function formatRoomInbound(room: Room, envelope: MessageEnvelope): string {
  return `[nvk-room ${room.name} from ${envelope.from} id ${envelope.id}] ${envelope.body}`;
}

// rooms/index.ts
export class RoomStore {
  constructor(storePath?: string); // default .novakai-command/rooms.jsonl
  onAppend(listener: (room: Room) => void): void;
  create(input: { name: string; members: string[]; createdBy: string }): Room; // generates room_<uuid>, dedupes members, always includes createdBy
  get(roomId: string): Room | null;
  list(): Room[];                          // non-archived, first-seen order
  addMembers(roomId: string, add: string[]): Room | null; // appends amended copy, fold by roomId last-wins
}
```

**Steps:**
- [ ] Write `rooms.test.ts` first (temp-dir store path): create → get/list roundtrip; member dedupe + createdBy always a member; addMembers folds (last line wins, first-seen order kept); unknown roomId → null; corrupt line skipped (write a garbage line into the file by hand in the test). Follow the exact style of `src/backend/messaging/store/index.ts` fold/readLines and its test.
- [ ] Run `npx tsx src/backend/messaging/rooms/rooms.test.ts` — expect failures.
- [ ] Implement `types.ts` additions and `RoomStore` mirroring `MessageStore` (appendFileSync JSONL, fold by roomId, snapshot to onAppend listener).
- [ ] Run test — PASS. Then `npx tsc --noEmit`.
- [ ] Commit: `feat(messaging): Room type + append-only RoomStore`

### Task B2: Router room fan-out

**Files:**
- Modify: `src/backend/messaging/router/index.ts`
- Test: `src/backend/messaging/router/rooms-routing.test.ts`

**Interfaces:**
- Consumes: `RoomStore.get`, `formatRoomInbound`, `isRoom` (B1); existing `PtyDelivery`, roster.
- Produces:
```ts
// New router errors
export class RoomNotFoundError extends Error {}      // → HTTP 404
export class NotARoomMemberError extends Error {}    // → HTTP 403
// MessageRouter constructor gains: rooms: RoomStore (after delivery param)
// route(): if isRoom(envelope.to) → routeRoom(envelope)
```

**routeRoom semantics (must match spec exactly):**
1. Envelope is already appended by `route()` (audit first — unchanged).
2. Reject `interrupt` (reuse `ChannelInterruptError`), unknown room (`RoomNotFoundError`), sender not in `room.members` (`NotARoomMemberError`) — all via existing `fail()` → status `failed`.
3. Fan out: for each member except sender and except `CHRIS_MEMBER`, find live roster address by name; if live, `await delivery.deliver(address, envelope)` using body line `formatRoomInbound(room, envelope)` — add an optional `line` override to `PtyDelivery.deliver` (or a `deliverLine(address, line, envelope)` method; pick whichever touches less) so DM formatting stays untouched.
4. Per-member failure or offline member never fails the post. Settle `delivered` after the loop. Receipt `mode: 'room'`.

**Steps:**
- [ ] Write `rooms-routing.test.ts` with a fake PtyDelivery (record calls) and fake roster, following `router.test.ts` style: fan-out hits every live member except sender and chris; offline member skipped without error; sender-not-member → NotARoomMemberError + status failed; interrupt → rejected; unknown room → RoomNotFoundError; delivered status settles even when one member's deliver throws.
- [ ] Run `npx tsx src/backend/messaging/router/rooms-routing.test.ts` — expect failure.
- [ ] Implement routeRoom + errors.
- [ ] Test PASS; run existing `npx tsx src/backend/messaging/router/router.test.ts` — still PASS (DM/channel behavior untouched).
- [ ] Commit: `feat(messaging): room fan-out routing, normal-only, best-effort per member`

### Task B3: SendApi + MessagingHub REST/ws wiring

**Files:**
- Modify: `src/backend/messaging/send/index.ts` (interrupt→room rejected pre-record, like channels)
- Modify: `src/backend/messaging/index.ts` (MessagingHub owns RoomStore; routes + broadcasts)
- Modify: `src/backend/messaging/store/index.ts` (history query `withRoom`)
- Test: `src/backend/messaging/tests/rooms-hub.test.ts`

**Produces (the frontend contract — do not deviate):**
- `POST /api/rooms` `{name, members: string[], from}` → 201 `{room}`; 400 invalid input
- `GET /api/rooms` → `{rooms: Room[]}`
- `POST /api/rooms/:roomId/members` `{add: string[], from}` → `{room}`; 404 unknown; 403 `from` not a member
- `POST /api/messages` with `to: "room_<id>"` → existing handler; map RoomNotFoundError→404, NotARoomMemberError→403
- `GET /api/messages?withRoom=room_<id>&since=&limit=` → `{messages}`
- ws broadcasts: existing `message-envelope`; new `rooms-changed` `{rooms: Room[]}` on every RoomStore append

**Steps:**
- [ ] Write hub test (construct MessagingHub with fake terminals + captured broadcast, drive an Express app via `node:http` + fetch, or call handlers directly if existing tests do): create room → 201 + rooms-changed broadcast; member add; room post lands in member PTY writes + message-envelope broadcast; history withRoom filters.
- [ ] Run — expect failure. Implement.
- [ ] Test PASS; `npx tsx src/backend/messaging/tests/*.test.ts` all green; `npx tsc --noEmit`.
- [ ] Commit: `feat(messaging): rooms REST surface + rooms-changed broadcast`

### Task B4: CLI + spawn briefing

**Files:**
- Modify: `scripts/nvk-live.mjs` (`room create --name X --member A --member B [--from NAME]`, `room list`; `send --to room_<id>` already flows through /api/messages)
- Modify: `src/backend/messaging/address/briefing.ts` (mention room verbs in the standing instructions)
- Test: update briefing test beside it if one exists; CLI smoke via `node scripts/nvk-live.mjs room list --backend http://127.0.0.1:<scratch>` against a scratch backend (`NOVAKAI_SERVER_PORT`)

**Steps:**
- [ ] Add verbs mirroring the existing send/roster command style in nvk-live.mjs.
- [ ] Update `composeSpawnBriefing` copy (keep it tight — one line about rooms).
- [ ] Smoke on a scratch backend; run briefing tests; commit: `feat(cli): tunnel room verbs + spawn briefing mention`

### Task B5: Gates + evidence

- [ ] `npx tsc --noEmit && npm run lint && npm run build`; every messaging test file via `npx tsx`.
- [ ] Post to #team: branch, commits, test evidence, the API contract is live. Notify orchestrator (Group Chat) via DM.

---

## Track F — Frontend (worktree `../Novakai-Command-rooms-ui`, branch `feat/tunnel-rooms-ui`)

### Task F1: tunnelModel — conversations model

**Files:**
- Modify: `src/frontend/lib/tunnelModel/index.ts`
- Test: `src/frontend/lib/tunnelModel/tunnelModel.test.ts` (extend)

**Interfaces:**
- Consumes: `Room` shape + endpoints from the spec contract (Track B3) — code against the contract, not the backend branch.
- Produces (for F2):
```ts
export type ConversationId = string; // 'room_<id>' | '#team' | 'dm:<agentName>'
export interface Conversation {
  id: ConversationId;
  kind: 'room' | 'channel' | 'dm';
  title: string;               // room name / '#team' / agent name
  members?: string[];
  lastMessageAt?: string;
}
// model consumes ws frames: message-envelope, rooms-changed, agents-changed
// selectors: conversations(): Conversation[] (sorted by lastMessageAt desc),
// messagesFor(id): MessageEnvelope[], liveRoster(): {name, provider}[]
```

**Steps:**
- [ ] Extend the existing tunnelModel tests first (same file style): rooms-changed folds rooms in; envelopes with to:room_x group under that conversation; DM grouping by counterpart; sort order. Run `npx tsx src/frontend/lib/tunnelModel/tunnelModel.test.ts` — fail → implement → pass.
- [ ] Commit: `feat(tunnel): conversation model — rooms, DMs, #team unified`

### Task F2: Messenger UI

**Files:**
- Modify: `src/frontend/components/studio/chat/tunnel/index.tsx` (+ its `index.css`, split subcomponents into `tunnel/` if the file grows past ~250 lines)

**Behavior:**
- Left rail: live roster (quiet presence dot), chats list from `conversations()`. Multi-select roster agents → "Start Chat" → prompt for name (default: joined member names) → `POST /api/rooms` `{name, members: [...selected, 'chris'], from: 'chris'}`.
- Center: selected conversation transcript (reuse the shared markdown renderer used by chat/timeline) + composer → `POST /api/messages` `{from: 'chris', to: <conversationId — for DMs the agent name>, delivery: 'normal', body}`.
- History load: `GET /api/messages?withRoom=` / `?withAgent=`; live via ws frames already in the model.
- Calm grammar per Global Constraints. The ONE amber: the single most recent conversation whose latest message mentions/asks Chris (reuse `src/frontend/lib/attention`); selecting it releases the accent.

**Steps:**
- [ ] Build against a scratch backend (`NOVAKAI_SERVER_PORT=3131 npm run dev` pattern) once Track B lands; until then, drive the model with recorded frames in tests.
- [ ] When #team announces Track B is on `feat/tunnel-rooms`: `git fetch && git rebase feat/tunnel-rooms` (or merge it in) and integrate live.
- [ ] Commit per coherent slice: `feat(studio): unified messenger — roster, rooms, composer`

### Task F3: Gates + browser verification

- [ ] `npx tsc --noEmit && npm run lint && npm run build`; `npx tsx src/frontend/lib/tunnelModel/tunnelModel.test.ts`.
- [ ] Browser-drive with `tools/browse` on your scratch backend: open messenger → start a room with two live agents → post as Chris → screenshot both agent PTYs showing `[nvk-room ...]` → have an agent reply via CLI → screenshot it appearing in the messenger → verify single-amber behavior and its release. Read every screenshot.
- [ ] Post evidence (screenshots paths, commands) to #team; DM orchestrator (Group Chat).

---

## Integration (orchestrator)

- [ ] Review both branches; run all gates on the merged result (`feat/tunnel-rooms` + `feat/tunnel-rooms-ui`).
- [ ] Full 3-way browser drive on the integrated build (Chris seat via studio, two live agents via PTY).
- [ ] Announce to #team; Helm confirms; merge to main via Helm protocol.
