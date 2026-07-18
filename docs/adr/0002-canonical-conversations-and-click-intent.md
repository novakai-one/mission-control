---
status: accepted
---

# Use canonical conversations and progressive click intent

Every conversation has one canonical Thread, and every visible messaging affordance resolves to that Thread or to a specific Thread Item. People are durable identities while Presence is only their current availability, so Direct Threads and Room membership never disappear when an agent process stops. The default first click selects and reveals useful context in the current page; navigation occurs only when the control explicitly promises navigation or the user chooses a revealed follow-up action. Conversation-index rows may open their Thread in the current workspace, while entity rows such as squad members first reveal context and explicit actions such as **Message** or **Open profile**.

The visual treatment must make that distinction legible: a conversation-index row looks like a destination in an index, while a Person entity looks selectable and reveals actions after selection. The same Person must not appear as two visually identical controls with different outcomes.

Message reconciliation uses `clientMessageId` to replace the optimistic pending item with the stored result, and the server Message ID to deduplicate websocket and history projections. Read cursor and draft keys belong to the canonical Thread, not to Mission Control or Messages. Receipt states are explicit: `pending`, `queued` for an offline recipient, `delivered`, and `failed`. A retry reuses `clientMessageId`; it cannot create a second logical Message.

## Considered options

- **Canonical Thread plus progressive intent routing — accepted.** Each click has one predictable local result, with explicit navigation when travel is useful, and every projection preserves the same identity.
- **Synchronize separate Conversation, Mission Control, and Tunnel histories — rejected.** Parallel stores and surfaces drift, create blank conversations, and make delivery truth impossible to explain.
- **Build membership from currently running agents — rejected.** Presence is transient and cannot define who belongs to a Room.
- **Allow decorative or inert affordances — rejected.** If an element cannot perform or reveal a meaningful action, it must not look interactive.
- **Navigate on every entity click — rejected.** It destroys spatial context and turns ordinary inspection into involuntary page changes.

## Consequences

- Message creation, storage, delivery, receipts, replies, drafts, read cursors, and retries are verified against one Thread identity.
- Room creation uses the durable Person roster, including offline People with a quiet presence indicator.
- Offline is a Presence state, not a delivery failure. A stored message for an offline Person is queued until delivery can be attempted.
- Initial Thread selection waits for Room/history hydration before falling back; a saved valid Thread may not be overwritten by `#team` during page mounting.
- Optimistic, websocket, and history projections reconcile using the named deduplication keys above.
- Draft and read cursor persist per Thread across every page projection.
- First-click inspection stays in the current page whenever the page can show the relevant context honestly.
- Navigation adapters may project the same Thread in different pages, but navigation must be explicit and may not create copied histories.
- Failure must remain visible and recoverable; success is not inferred from a click alone.
