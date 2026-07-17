# Design Guild Rigor Gate — C1–C21

Binding acceptance criteria for `docs/design-guild-workspace.html` (Map = world, Thread = memory,
Director = camera). Owner: Design Guild · fable. No milestone reports "done" until the gate is
green, verified in a real browser via `tools/browse` with screenshots posted to the room.
Checks marked **[mech]** are counted mechanically in the DOM via `browse eval`.

## Attention

- **C1 — One gold, counted.** At any instant the DOM contains ≤ 1 element carrying the gold
  family (`#d0a14b`/`#e2ba6e`) as an attention signal (fill, border, glow, or text), excluding the
  `>_ novakai` wordmark. Zero is legal — calm is a state, not a bug. **[mech]**
- **C2 — Gold means human.** Gold attaches only to an item requiring a human decision/input.
  Resolving it visibly releases: gold → sage `#78a886` on the resolved item, then the screen
  returns to near-monochrome. No gold for FYI, progress, or agent-only activity.
- **C3 — Edge-thread beacon.** When the gold item is off-viewport, a hairline gold thread runs
  from the viewport edge toward it. Following it arrives at the item; the thread disappears on
  arrival. No text substitute ("1 item needs you") anywhere.
- **C16 — Show, don't tell.** No UI copy that directs attention ("needs your attention",
  "pending decision", "look here"). Attention is carried by light, position, and scale only.
  **[mech: DOM text grep for directive phrases]**

## Director trust law

- **C4 — Legible cuts.** Every automatic recomposition can reveal its causal reason (which event
  produced the cut) via a quiet affordance — not a persistent banner, never prose in the layout.
- **C5 — Reversible cuts.** One gesture (Esc or single click) returns to the pre-cut
  composition. The return is animated — orientation preserved, no teleport.
- **C6 — Pinnable.** Interacting with a surface pins it: the director may not shrink, move, or
  recompose it while pinned. Pinned state is visible but quiet. Release resumes the director.
- **C15 — Provenance.** Every surfaced artifact (diff, terminal block, decision, canvas change)
  can reveal which thread event and actor produced it, without leaving the composition.

## Motion

- **C7 — Motion law.** Structural recompositions ≈ 700ms ease. Nothing recomposes except in
  response to a human action or an arriving event. Idle periphery may breathe only below the
  attention threshold: no hue change, no loop a screenshot-diff two beats apart would flag
  (live terminal output exempt).
- **C8 — Reduced-motion equivalence.** Under `prefers-reduced-motion`: cuts become instant or
  crossfade, zero translation, and every capability (reason lines, pin, reverse, beacon,
  provenance) remains reachable. Same product, no cinema.

## Continuity

- **C9 — Keyboard-only pass.** The full hero sequence is drivable by keyboard alone. Focus is
  always visible; the director never steals focus — a cut mid-typing leaves the caret where it
  was, keystrokes unlost.
- **C10 — Reload coherence.** Hard reload lands in a coherent brand-correct state: no flash of
  wrong palette, no broken layout, no half-composed stage. Any state encoded in the URL hash
  restores.

## Calm + brand

- **C11 — Zero badge spam.** No persistent chips, pills, unread-count bubbles, or
  attention dots on rows. Ornament appears only on THE current exception. Per Chris's
  color/icon dial (2026-07-17 evening): quiet SEMANTIC icons (# for rooms, nav glyphs,
  kind-markers) and identity tints are legal and don't count as decoration — the census
  targets attention-ornament (counts, badges, pulsing dots), not meaning-bearing marks.
  **[mech: decorated-row count ≤ 1, badge/pill/count classes only]**
- **C12 — Brand law.** Page `#0d0d0f`; panels from `#252529 / #1b1b1e / #121214 / #29292d`; ink
  `#ececee / #a2a2aa / #8b8b94`; Inter everywhere, mono only for wordmark + terminal content;
  radius 4–6px (8 max); no color outside palette except gold family + sage. **[mech: computed
  style sweep]**

## Substrate

- **C13 — Self-contained.** One file, opens via `file://`, zero build step, zero network
  requests (verified in the engine's network log).
- **C14 — Believable world.** Demo data uses real module names from this repo (`agentSocket`,
  `TerminalHost`, `src/backend/...`) and real roster agent names. No lorem, no "Agent 1".
  Company scale: project territories use the real ecosystem — Novakai (flagship), Novakai
  Canvas, Novakai Command, Novakai Design, Novakai Analytics — not invented product names.

## Company-scale clarification (post-Chris scope ruling)

C1 is global: one gold across the ENTIRE company view — many projects, many agents, still
exactly one amber demand at any instant. If two projects both need Chris, the director
stages one and queues the other (growth/dimming only, per dwell law). A gold per project
is a C1 fail.

## Navigability (binding per Chris's M2 feedback)

- **C17 — Click-only navigability.** Every core surface — DMs, rooms, people, projects,
  missions, the world map, any open thread — is reachable from a fresh boot by ordinary
  clicking alone: no keyboard shortcuts, no camera verbs, no director knowledge required.
  A first-time human finds their DMs within 5 seconds (≤ 2 clicks from login). Director
  cuts are attention assists, never the only route anywhere. **[mech: click-path walk
  with tools/browse, keyboard untouched]**

- **C18 — Person identity survives everything.** A person (teammate) has one stable
  identity and one history: reload, agent-process restart, or rename must not create a
  new person, fork a DM thread, or lose thread membership. The person opened from the
  world map and the person opened from the rail are the same object — same DM thread,
  same history. **[mech: open DM via rail, note threadId; reload; open same person via
  map; threadIds must match]**

## Messaging truth (M3 — Chris's "nail the messaging" scope)

- **C19 — Send truth.** Enter/Send appends exactly ONE Message with a stable id to the
  currently selected canonical Thread, actor = Chris; it renders immediately with an
  honest delivery state; failure keeps the same id with retry — never deletion,
  duplication, or a shadow pending array. Shift+Enter = newline. The same object is
  what every projection (rail preview, mission reference, world) observes. **[mech:
  send, count new [data-message-id]; reload; the id persists exactly once]**
- **C20 — Typed-item grammar.** DM, Room, and Mission views use ONE renderer over
  ordered typed items (Message | WorkUpdate | DelegationEvent | DecisionRequest |
  DecisionResolution | CausalReference), each with stable `id, threadId, actorId,
  createdAt`, sub-items with `causedByItemId`. A CausalReference may nest visually but
  is a typed item with its OWN identity (codex ruling). Decisions: answering appends a
  DecisionResolution caused by the request — never answer-in-button-state. Restore
  slates are factual (`restored · Maya conversation`), never `you · opened…` — reload
  is not a user act. **[mech: DOM census of data-item-kind + identity attrs]**
- **C12 mono ruling (Chris, binding — WGT strict form):** mono glyphs ANYWHERE outside
  the `>_ novakai` wordmark = FAIL. Test results, diffs, code refs, terminal-ish
  evidence all render in Inter as designed rows (sage ✓ row / ink-bright ✕ row,
  aligned columns, tabular numerals fine). The app is the anti-terminal.
- **C12 amendment (pending opus swatches, invariants ratified):** Inter must RENDER
  (measured glyphs — `C12_interReal` in the harness — not a font-family string; local()
  + embedded woff2 both C13-legal). Color allowlist grows to: per-person identity tints
  bound to durable Person id (stable everywhere, survives restarts), low-saturation
  thread-kind/project accents bound to canonical identity, terminal syntax subset.
  Color is never the sole carrier; no transient work/selection hues; gold stays the
  only attention signal, sage stays success.
- **C17 carry-in (ruled M3 scope):** world person dots get a ≥24px invisible hit halo
  with correct z-order — visible dot stays tiny; only interactive geometry grows.

- **C21 — Unread truth (from the gap Chris lived).** Per codex's ThreadMembership
  contract: opening a thread does NOT mark it read — the cursor advances only for items
  actually viewed in the foreground (or explicit Mark read), and advances monotonically.
  Reload/reconnect restores both the read cursor and the scroll anchor. Every catch-up
  row deep-links to its canonical ThreadItem. Ordinary unread renders as quiet
  ink/tint + position/weight — NEVER a gold badge; only an unresolved human-required
  item may hold the one global gold. **[mech: open thread, census cursor unchanged;
  scroll items into view, cursor advances; reload, cursor + anchor identical]**

## Procedure

Each codex milestone: I drive it with `tools/browse` (goto/click/scroll/shot + eval for [mech]
counts), post screenshots + per-criterion verdict (pass / fail / n-a-yet) in the room. Gate
green = all 16 pass in-browser. Passing by code-read does not count — house rule.
