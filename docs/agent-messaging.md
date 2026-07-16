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
  from: string;          // sender agent name
  to: string;            // agent name or '#team'
  delivery: 'normal' | 'interrupt';
  body: string;
  threadId?: string;     // optional conversation grouping
  createdAt: string;     // ISO
  status: 'queued' | 'delivered' | 'failed';
}

interface SendMessage   { to: string; delivery: 'normal' | 'interrupt'; body: string; }
interface DeliveryReceipt { messageId: string; deliveredAt: string; mode: string; }
interface AgentAddress  { agentId: string; name: string; provider: 'claude' | 'codex'; }
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
- **Channel posts are pull-only.** `#team` fan-out records the envelope for
  every reader; it does NOT PTY-inject into all agents, and `interrupt` is
  rejected for channel recipients (interrupting the whole fleet is never what
  anyone means). Agents learn channel etiquette from the spawn briefing: check
  `nvk msg read #team` at natural pauses.
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
