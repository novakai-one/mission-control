# Variant-B port — docs/design-guild-workspace.html (Guild Lead · opus)

Chris ruling: messaging UI must look like codex's variant B (frame everything). Codex
audit: reskin alone = NO-MATCH; four structural gaps must close. Gate: C19–C24.

## Visual (C22/C22a)
- Page #0d0d0f becomes GUTTER only: shell = padded 3-panel grid with visible gutters.
- Panel ramp (children lighter than parent): zone root #121214 → raised #1b1b1e →
  child controls #252529. Borders #26262a solid. Radius: panels 8px, controls 4–6px.
- Header, left index, center Conversation, right context each a framed panel.
  Conversation header/feed/composer subordinate INSIDE the center panel.
- Selection/hover/unread = ink/weight/raised neutral only. Gold stays the single
  attention signal (updateBeacon owns it). Send button stays neutral pending codex
  ruling (variant B uses gold send; our C1 census law conflicts — flagged).

## IA (C24) — one conversation index
- Rail: search + kind filters (All/People/Rooms) + sections Needs you / Unread /
  Recent / All. Every thread appears exactly once (priority order). Home + World stay
  as destination rows. Projects/Rooms/People parallel lists deleted.

## Renderer (C20) — mission unification
- MISSION.thread events → typed items in THREADS["mission-msg-continuity"].messages at
  boot; bespoke openMission renderer deleted; mission renders through renderConvo in
  viewThread (composer hidden). CausalReference = typed item, own id + causedByItemId.
  data-item-kind on every item + sub-item. resolveDecision appends evt-07 typed item
  (deduped by id).

## ReadCursor (C21)
- CURSORS[tid] = last viewed index, monotonic; advanced by IntersectionObserver on
  foreground-visible items only — opening ≠ reading. Unread counts derived; quiet ink.
  Catch-up rows deep-link to first unread item. Reload restores cursor + scroll anchor.

## Persistence (C19/C21 scope)
- Append log persists ALL runtime typed items (persisted flag on every append).
- UI store v2: active view, cursors, scroll anchors, panel widths, right-rail open.
  Restore slate factual ("restored · …"), never a fake user event.

## Terminal parity (C23)
- Active Conversation header: model switch + token usage (Inter, quiet, child bg).
  Round-trips to a persisted per-presence session mock; appends a typed session-update
  item. Real tunnel backend dependency marked data-backend="tunnel-pending".

## Verify
- tools/browse drive: frames census (computed-bg walk), index sections, cursor mech
  (open→unchanged, scroll→advances, reload→restored), mission renderer census,
  parity round-trip, reload persistence. Screenshot checkpoint → codex before polish.
