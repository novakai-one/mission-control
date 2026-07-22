# Agent Messaging — Design

Agents running inside Novakai Command (Claude and Codex sessions) can send each
other direct messages and post to a shared team channel. The sender decides
urgency: a `normal` message queues into the recipient's current turn; an
`interrupt` breaks the turn first. Every message is a permanent, auditable
object.

Canvas: the visual model lives in the **Agent Messaging** scope of the Novakai
Canvas (`novakai-canvas/public/data/project-architecture.json`, revision 221+),
wired to the existing Novakai IDE scope via `Agent session — is a → Agent PTYs`.
Approach approved by Chris 2026-07-16 (Approach A: backend message bus with PTY
delivery; MCP transport deliberately deferred as a possible later second
transport).

## 1. Requirements

- R1 Any live agent can message any other live agent by name, from its shell,
  with one command — identical mechanics for Claude and Codex.
- R2 Sender chooses delivery: `normal` (queue into the recipient's session) or
  `interrupt` (Esc to break the current turn, then deliver).
- R3 Messages are objects: extensible envelope where permissions and future
  metadata will live. Append-only store is the audit record of every send.
- R4 Team channel `#team`: fan-out recipient every agent can read.
- R5 Each agent knows its own name and the messaging protocol via standing
  instructions injected at spawn (no per-provider config files).
- R6 Messages view in the UI: live feed of DMs + channel over the existing
  WebSocket.
- R7 Existing infrastructure only: Express backend, `ws`, TerminalManager. No
  new daemons, no MCP dependency.

## 2. System architecture

```
  Agent PTYs (Claude + Codex via TerminalManager)
      │  nvk msg send --to codex-1 [--interrupt] "..."   (or curl)
      ▼
  Send API ── POST /api/messages ──▶ wraps ▶ MessageEnvelope
      │ submits
      ▼
  Message router ── records ──▶ Message store (append-only JSONL)
      │ delivers DM                 ▲ history()
      │ fans out ▶ #team channel    │
      ▼                             │
  PTY delivery ── types into PTY ──▶ recipient agent
      normal:    queue-typed (both CLIs queue mid-turn input natively)
      interrupt: Esc first, then type + submit
                                    Messages view (UI) ── queries store,
                                    watches channel over existing ws
  Spawn briefing ── instructs at spawn ──▶ every agent
```

## 3. Contracts

Envelope (the extensible object; permissions/metadata land here later):

```ts
interface MessageEnvelope {
  id: string;            // msg_<uuid>
  from: string;          // sender agent name (presentation)
  to: string;            // agent name or '#team' (presentation)
  delivery: 'normal' | 'interrupt';
  body: string;
  threadId?: string;     // optional conversation grouping
  createdAt: string;     // ISO
  // 'accepted' = bytes written; interrupts claim 'delivered' only with proof (§8)
  status: 'queued' | 'accepted' | 'delivered' | 'partial' | 'failed';
  outcome?: DeliveryOutcome;      // §8 evidence (acceptedAt/confirmedAt/…)
  senderAgentId?: string;         // durable ids, server-derived (§1.5 of the
  recipientAgentId?: string;      // object-model plan) — renames never sever
  missionId?: string;             // message→Agent history
}

interface SendMessage   { to: string; delivery: 'normal' | 'interrupt'; body: string; }
interface DeliveryReceipt { messageId: string; deliveredAt: string; mode: string; }
interface AgentAddress  { agentId: string; name: string; provider: 'claude' | 'codex' | 'kimi'; }
interface MessageQuery  { withAgent?: string; threadId?: string; since?: string; limit?: number; }
interface ChannelQuery  { since?: string; limit?: number; }
```

Interfaces (as drawn on the canvas):

- Send API — `send(SendMessage) → MessageEnvelope`
- Message router — `route(MessageEnvelope) → DeliveryReceipt`
- Message store — `append(MessageEnvelope) → void`, `history(MessageQuery) → MessageEnvelope[]`
- PTY delivery — `deliver(AgentAddress, MessageEnvelope) → DeliveryReceipt`
- #team channel — `read(ChannelQuery) → MessageEnvelope[]`

## 4. Delivery semantics

- `normal`: type the body into the recipient's PTY and submit. Both Claude Code
  and Codex CLI natively queue input that arrives mid-turn, so this is safe at
  any time.
- `interrupt`: send Esc, brief settle delay, then type + submit. Reserved for
  urgency ("stop, rebase onto main first"). Per-provider quirks (Esc semantics,
  prompt states) live entirely inside PTY delivery — the router doesn't know
  them.
- **Agent channel posts are pull-only; Chris's team chat is live.** Agent-authored
  `#team` status posts remain in the shared audit feed for readers to pull.
  A browser-authored post from the registered Chris owner identity is typed
  into every live agent PTY immediately, so the Mission Control group chat is
  genuinely interactive. `interrupt` is still rejected for every channel post.
- **Chris has a server-owned inbox identity.** Agent DMs addressed to `chris`
  settle into the audit store and broadcast to the UI without PTY delivery;
  browser sends resolve to Chris on the server and never trust a client `from`.
- Message inbound format when typed into a PTY:
  `[nvk-msg from <name> id <msgId>] <body>` — so recipients can distinguish
  agent mail from Chris typing.

## 5. Addressing

- Names are short, unique, human-typeable: `claude-1`, `codex-2` (provider +
  ordinal at spawn); Chris can rename in the UI, uniqueness enforced by the
  backend. `AgentAddress` maps name → agentId → PTY.
- Recipient not found / not running → `status: 'failed'`, error back to sender
  with the live agent list (actionable, same rule as missing-session errors).

## 6. Open questions (decide before or during build)

- **Read/ack**: `status` only tracks delivery. Does the sender ever need
  "recipient acted on it"? Current answer: no — replies are just messages back.
  Revisit if coordination patterns demand it.
- **Persistence location**: `.novakai-command/messages.jsonl` per project vs
  global. Leaning per-project (matches store-per-workspace pattern).
- **Rate limiting**: two agents ping-ponging could interrupt-storm each other.
  Minimum: cap interrupts per sender per minute.

## 7. Build phases (each a vertical slice, browser-verified before "done")

1. **Store + Send API** — envelope schema, append-only store, `POST /api/messages`,
   `GET /api/messages` (history), unit tests on schema + store.
2. **Router + PTY delivery (normal)** — name resolution, delivery via
   TerminalManager PTY write, receipt + status update. Verify: two live agents,
   one messages the other, reply comes back.
3. **Interrupt delivery** — Esc-then-type path, per-provider handling, rate cap.
4. **#team channel** — fan-out records, `nvk msg read #team`, briefing etiquette.
5. **Spawn briefing** — standing instructions injected at spawn (name, roster,
   protocol, etiquette).
6. **Messages view** — UI feed (DMs + channel) over existing ws; live update.
7. **nvk CLI** — thin wrapper over the REST API (`nvk msg send/read`); until it
   exists, agents use `curl` (documented in the briefing).

## 8. Delivery state machine and crash matrix (mission_mission-object-model)

States: `queued` (journaled, nothing written) → `accepted` (bytes written to
the PTY) → `delivered` (effect proven). Rooms keep `partial`; any error path
settles `failed`. For **interrupts**, `delivered` is claimed ONLY when the
recipient's own transcript shows the inbound marker (`[nvk-msg from <name>
id <msgId>]`) as a new user turn; the amendment carries the evidence
(`outcome`: acceptedAt/confirmedAt, agentId, sessionId, provider, transcript
event). No proof within the window → the envelope honestly stays `accepted`
with a note. **Normal** sends keep write-claimed `delivered` (documented
receipt semantics — the D1 MUST covers interrupts).

The timed type→settle→submit→flush sequence is ONE job owned by the
PTY-hosting process (`submit` in the host protocol), keyed by message id and
duplicate-safe — a backend restart cannot orphan its timers and a re-sent
job never double-types. Deliveries are serialized per agent.

Crash matrix (backend dies at X → recovery):

| Crash point | Journal says | Recovery on restart |
|---|---|---|
| before journal append | (nothing) | sender saw an error; nothing to recover |
| after append, before write | `queued` | reconciliation re-routes ONCE; host dedupe makes it a no-op if the job did reach the host |
| after write, before amend | `queued` (bytes written) | same retry — host dedupe by message id prevents double-typing |
| after amend, before effect | `accepted` | transcript verification; NEVER re-typed; delivered only on proof |
| after effect, before final amend | `accepted` | same verification finds the turn and amends `delivered` |

Reconciliation is bounded to a recency window (default 30 min) so ancient
journal history is never replayed. With the in-process runtime (no detached
host) the submit timers die with the process — the matrix above still holds,
minus the cross-restart job survival; that lane is dev-only.
