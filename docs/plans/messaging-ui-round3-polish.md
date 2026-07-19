# Messaging UI — Round 3: Motion, Chrome & Doctrine Pass

> Written 2026-07-19 by the fresh-eyes review instance (kimi-cli), from Chris's
> verbal fix list + the independent design review
> (`~/.kimi-work/build-experiments/EXP-2026-07-19-messaging-ui-design-review.md`,
> shots in `~/Documents/kimi/workspace/messaging-ui-review/design-review/`).
> Executable by an orchestrator who has never seen either conversation.
>
> Repo: `novakai-command`, worktree `Novakai-Command-kimi-messaging-ui`,
> branch `kimi/messaging-ui` (PR #36). All UI work lives in
> `src/frontend/components/workspace/messages/` unless stated otherwise.

## Owner fix list (verbatim source, Chris 2026-07-19 ~12:30)

1. Left panel toggle does the wrong thing — hides/shows the "No live agents"
   box inside the rail instead of collapsing the rail.
2. Both panels should open/close at 700ms — "they used to open and close
   well, check what changed."
3. Animations are jumpy — every click is a fast change, everything jumps.
4. No way to add a mission room or DM (feature add, not a regression).
5. Composer should sit lower — currently rides to the top.
6. Show more/less is good, but too fast — no smoothing.
7. Some screens have no composer at all (evidence: `~/Desktop/messageInputBox.png`
   — #team, feed fills the column, no input).
8. Right panel: DM lanes get an identity header ("where you are") — mission
   rooms don't. Rooms should have the same.
9. Some right-panel Review buttons are no-ops (possibly stale data — verify).

Review-instance additions (evidence in the design-review shots):
10. Mission Control header regression: session pill (`● Opus · claude · 4134e112`)
    missing, LIVE SQUAD renders 0/0 "No agents attached", DIRECT MESSAGES empty
    — old app on :3030 shows all three populated (shots old-01 vs new-01/20).
11. Send-and-know gap: sending while scrolled up clears the draft but never
    scrolls to or shows the new message's Sending→Delivered (shots 16/17).
12. Mention picker did not open on a bare `@` in review (round-2 evidence shows
    it opening with filter text — check the trigger threshold is deliberate).
13. Console: `ws://localhost:3040/ws` connection failure ×2 on load.
14. One CSS glyph (`msg-ghost-glyph`) is used for FOUR different actions
    (New room, Show conversations, Hide context, Show context) — identical
    icons, differentiated only by tooltip (rail/index.tsx:168, index.tsx:221,
    context/index.tsx:42).
15. Old rail had Search + All/People/Rooms tabs; new rail dropped them.
    Restore search or record the deferral as a decision.
16. Nit: at 760px the app top nav wraps "Mission Control" to two lines.
17. Data provenance: :3040 currently proxies to the WORKTREE backend; maya /
    atlas messages are seed fixtures in the worktree `messages.jsonl` only.
    Label seeded data in the UI or document the seed clearly — owner doctrine
    is "honest ugly data beats pretty fake data".

## Root causes already established (don't re-investigate)

- **(2, 3, 6) Motion:** round 1 deliberately replaced the app's house motion
  with fast-only tokens — `tokens.css:133` "--msg-t-fast: 150ms; --msg-t-tab:
  200ms" with the comment "faster than the studio's house speed". The house
  speed is `--anim-slow: 700ms cubic-bezier(0.33, 1, 0.68, 1)`
  (`src/frontend/css/index.css:55`), and the old app's reveal/panel language
  is built on it (see `components/workspace/renderers/index.css:74`).
  Additionally, ContextPanel is conditionally unmounted
  (`messages/index.tsx:262`) and the shell grid flips
  `grid-template-columns` instantly (`index.css:17`) — instant unmount makes
  ANY transition impossible. The desktop rail has no collapse at all.
- **(1)** The glyph button in the rail tabbar is "New room"
  (`rail/index.tsx:168-176`). It opens `NewRoomPicker`, which renders
  "No live agents" when the roster is empty. There is no rail-collapse
  control on desktop — the only rail toggle is phone-only
  (`.msg-thread-topbar`, `index.css:86`, shown ≤800px).
- **(8)** `SummaryView` (rooms) has no identity header; `PersonView` (DMs)
  has `msg-person-head` (`context/index.tsx:149-153`).
- **(9)** `review()` (`messages/index.tsx:198-201`) scrolls to
  `messageRowId(envelopeId)` in the CURRENT thread only. If the failed row
  isn't loaded/rendered there, the click is a silent no-op.
- **(7)** Composer renders in-flow as the last grid row of `.msg-thread`
  (`index.css:76-83` — `auto / minmax(0,1fr) / auto`). Correct in tests at
  1560×940; the owner's screenshot (1692×978 CSS) shows it gone. Hypothesis:
  an ancestor height constraint fails at some viewport/state, the view grows
  past the fold, and the composer is pushed below it. Repro first, then fix.

## Doctrine requirements (owner-mandated)

**A. Novakai-Analytics 10 design principles** (`Novakai-Analytics/STANDARDS.md:3-13`:
coupling, cohesion, separation of concerns, information hiding, single
responsibility, dependency direction, DRY, YAGNI, least surprise,
composability). Gate: run `npm run analyze -- <repoPath>` from the
Novakai-Analytics repo against the worktree before and after; the diff must
not regress, and every new module must grade clean. Note YAGNI cuts both
ways — do not gold-plate while being principled.

**B. Typed-block Style/Script doctrine** (from html-builder, added
2026-07-19: `core/prototype/style-class.js`, `script-class.js`, dogfooded in
`projects/messaging-styled/` with 113 Style Classes, zero inline CSS):
- Everything is a typed-block object — `{ id, name (PascalCase -Style /
  -Script), purpose, css|behavior }` — including UI styling and interactions.
- Blocks are IMMUTABLE (no update path); change = construct new block +
  re-point attachment. `Object.freeze` them.
- Components hold ATTACHMENTS (`styles: StyleId[]`), never style objects;
  state changes (selected, expanded, panel-open) swap attachments, they
  don't mutate CSS.
- ONE resolver seam (`resolveStyle(ids)`) used by render, tests, and any
  export — no scattered inline merges. Purity rule: no inline-style escape
  hatches in authored code.
- The messages tab is already philosophically aligned (tokens-as-data in
  `tokens.css`, derivations in `model.ts`, "change lives there, not here").
  Round 3 formalizes it: motion and panel state become typed blocks with
  attachments, not ad-hoc class flips; new UI added in M5/M8 follows the
  block pattern from birth. Adopt pragmatically for React+TS (frozen
  `StyleBlock` objects + a single `resolveStyle` seam); do NOT port
  html-builder's file/manifest machinery.

## Design reference (added 2026-07-19, second pass)

Static design target lives in `docs/plans/messaging-ui-round3-design/`,
distilled from the html-builder project `messaging-styled` (revision
6f585a74, exported via `project-export`, scenes screenshot-verified):

- `storyboard-scene-01.png` — room lane + Summary right panel
- `storyboard-scene-02.png` — DM lane + Tasks right panel (identity header:
  name, role, live status)
- `storyboard-scene-03.png` — DM lane + Stats right panel
- `storyboard-tokens.css` — COMPLETE exact-value inventory (every color, font,
  weight, letter-spacing, radius, border, shadow + counts and source classes;
  nothing renamed or collapsed — hex-exact, no pixel guessing)
- `storyboard-styles.md` — full 116-class catalog with purposes (lookup table
  for "how does the storyboard style X"; when mirroring a component, copy its
  exact class values — they beat the nearest inventory entry)

**Precedence rules (read first):**
1. The app's `tokens.css` wins wherever it already defines a value. The
   storyboard reference is the tie-breaker for net-new UI (M2 icons/toggle,
   M4 room header, M5 flows) and for anything tokens.css does not cover.
2. This is a LOOK reference, not a motion spec — the storyboard contains zero
   transitions. All motion values come from M1 / `--anim-slow`.
3. **Trap:** scene-01 renders a room WITHOUT an identity header — that is the
   old state the storyboard inherited, not the target. M4's room header must
   mirror the DM header in scenes 02/03. Do not copy scene-01's missing header.
4. Scenes 02/03 show Tasks/Stats/Settings TABS in the right panel. Round 3
   does NOT build panel tabs (YAGNI, principle 8) — reference the header
   pattern and panel chrome only.
5. The storyboard runs dense (9–10px micro-labels). Match its hierarchy and
   chrome, not its exact type scale, where the app is already more spacious.
6. Storyboard content (Maya/Orbit/Atlas/Nova/Sage) is fiction that happens to
   share names with the seed fixtures — neither is real data. Item 17's
   honesty rule still applies.

Per-item verification (M9) now compares against these refs, not vibes:
M1 → motion only, no visual diff expected. M2 → rail chrome vs scene-01 left
rail. M3 → composer placement vs any scene (pinned, "Draft saved" subtext
optional). M4 → room header vs scenes 02/03 DM header. M5 → pickers styled
per `storyboard-styles.md` (ComposerShell/Picker classes where applicable).

## Method

| # | Task | Done when |
|---|---|---|
| M1 | **Motion language restoration.** Add `--msg-t-struct: 700ms cubic-bezier(0.33, 1, 0.68, 1)` to tokens.css (same curve as `--anim-slow`). ContextPanel: mount always, animate open/close (width/opacity on the struct token) instead of unmounting. Show more/less: animate row height (max-height or measured height) on the struct token. Keep 150ms for hover color only. | Panel open/close visibly smooth; expand/collapse glides; owner eyeball pass |
| 1.1 | Check old app panel behavior (main src) and mirror its motion feel | note in commit body |
| M2 | **Rail collapse + icon honesty.** Add a real desktop rail-collapse toggle (animate like M1). Give the four ghost actions four distinct glyphs (CSS-drawn is fine — no icon font per spec). New-room button gets a label or distinct affordance. | Clicking rail toggle collapses/expands the rail at 700ms; the "No live agents" picker no longer masquerades as a toggle |
| M3 | **Composer pinning.** Repro the missing-composer state at the owner's viewport (1692×978, real data, #team). Fix so the composer is pinned to the bottom of the center column at every viewport and scroll state. | Composer visible at 1560×940, 1692×978, 1100, 760; screenshot each |
| M4 | **Right-panel parity + Review resilience.** Rooms get an identity header (name, kind, member count) matching the DM `msg-person-head`. Review: if the target row isn't loaded, load it / switch lane and then scroll; if it genuinely can't be located, show an honest inline note instead of a silent no-op. | Room header shot; Review works on a stale failed row or says why it can't |
| M5 | **New room / New DM flows.** Discoverable, labeled entry points (not a bare glyph). Room: name + member picker (existing `POST /api/user/rooms`). DM: pick one agent → opens/creates the DM lane. Empty-roster state must still allow DM creation from known agents, not just live ones. | Create a room and a DM in browser; both open as lanes |
| M6 | **Mission Control regression.** Restore the session pill top-right, LIVE SQUAD population, and DIRECT MESSAGES list on the MC view. Find what the branch changed in the MC data path; fix at the seam, not with a workaround. | MC shot matches old-01's information content |
| M7 | **Send-and-know.** After sending while scrolled up: smooth-scroll the feed to the new row and let its Sending…→Delivered settle in view (respect a user who is actively scrolling — don't yank). | Probe send from mid-feed scrolls + settles visibly |
| M8 | **Sweep.** (a) mention picker trigger on bare `@` — confirm or fix; (b) silence or honestly handle the `ws://localhost:3040/ws` console failure; (c) rail search — restore or log a deferred decision; (d) 760px top-nav wrap; (e) seeded fixtures (maya/atlas) labeled or seed documented. | Console clean; each sub-item noted in commit |
| M9 | **Doctrine gates.** Run Novakai-Analytics analyzer before/after (no regression). Typed-block adoption per §B for motion/panel state and all M2–M8 UI. `tsc --noEmit`, messaging tests, eslint baseline held. Per-item browser verification with screenshots, isolated vite (NEVER proxy the live backend :3031 — round-2 incident). | Analyzer diff clean; gates green; shots per item |

Rules of thumb: one commit per task; browser-verify against real data in
#team; keep every value a token/typed object (density, thresholds, timings)
so Chris can flip them in one line; no backend plumbing changes — if a fix
needs one, log it, skip, report.

## Boundaries & abort
- **Must NOT:** touch main checkout; run `npm run dev` (predev kills the live
  app); proxy :3040 to the live backend :3031 without labeling; gold-plate
  (YAGNI is principle 8); merge to main.
- **Abort if:** a fix needs backend changes; the analyzer gate forces a
  refactor bigger than the fix (log and report instead).
