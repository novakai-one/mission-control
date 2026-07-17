# NOVAKAI HELM — Director Script v1.1

> **v1.1 restage (binding, per codex's causality review + WGT ruling):** the hero
> stages `msg-continuity` verbatim — cursor-482 loss in `agentSocket` → tribunal asks
> "Which system owns conversation truth?" (1 One canonical ledger · 2 Synchronize
> three stores · 3 Read causal evidence) → Chris resolves → recompose around
> `MessageStore` in its accepted ledger role. Module ids per codex's repo-verified
> amendments: `MessagingHub`, `MessageStore`, corrected paths. §4's original
> deploy-snapshot example is superseded; choreography (beats, timings, laws) unchanged.
> Company scope per Chris: the wide shot reads as five territories (Novakai, Canvas,
> Command, Design, Analytics) with missions as terrain state.

The contract for `docs/design-guild-workspace.html`. Map = world (fable), Thread = memory
(codex), Director = camera (this document). Built against gate C1–C16
(`docs/design-guild-gate.md`); codex's causal dataset embeds verbatim.

## 0 · Stage

- **World** — the architecture map is the ground plane. Places use real module names:
  `src/backend/tunnel` (envelope store), `agentSocket`, `TerminalHost`, `tools/deploy`,
  `src/frontend/studio`. Repo-health is terrain: a hurting place is drawn with darker,
  rougher ink — never a colored badge (C11, C16).
- **Inhabitants** — roster agents (Helm, Orchestrator, Deploy Snapshot · opus,
  Messaging UI · opus, Fable · Ghostty, Design Guild × 3, CodexChat · codex) as quiet
  presence dots at the place they're working, name on hover. Authority shows as
  position, not iconography.
- **Surfaces** — terminal (JetBrains Mono, the only mono besides the wordmark), diff,
  thread, decision card, mission card. Every surface is docked to a place and carries a
  provenance footer (§6).

**Gold-budget note for guild review:** brand's "agent-name labels in gold" is
subordinated to gate C1 (one amber max) in this prototype — agent labels render
`#ececee`. Flagging rather than silently deviating.

## 1 · Shot grammar — four compositions

| Composition | What | Entered by |
|---|---|---|
| `wide` | The whole world; surfaces as small live thumbnails at their places | Rest, `M`, or 8s of quiet |
| `work` | Dominant surface ~60% + 1–2 supports; world stays visible as ground strip (orientation is never lost — C5) | Director default |
| `study` | One surface near-full, world as thin margin | **User intent only** (click/Enter). The director may suggest via growth, never force |
| `tribunal` | Everything recedes into depth; decision card center stage (~560px); the app's only gold lives here | Director, on a human-required ask |

## 2 · The laws

1. **One gold (C1).** At most one `[data-gold]` element in the DOM at any instant.
   Gold = the current human-required item: the decision's primary action when the card
   is in viewport, or the edge-thread beacon when it isn't. The gold class swaps on
   intersection — never both.
2. **The slate (C4, legible cuts).** Every automatic cut writes one muted Inter line,
   bottom-left: `grew terminal · 3 failures in tunnel store`. Descriptive record of the
   director's own act — never a directive to the human (C16). Fades in 900ms, persists
   until the next cut. Hook: `[data-slate]`.
3. **Reverse (C5).** `Esc` returns to the pre-cut composition, 700ms glide (stack depth
   3). The camera never jumps, including backwards.
4. **Pin (C6).** `P` or click-hold 300ms suspends the director — thin `#ececee`
   hairline around the stage edge marks suspension (no gold, no badge). Same gesture
   releases; resume writes a slate line. Hook: `[data-pinned]`.
5. **Dwell.** ≥4000ms between structural cuts. Queued demands may express only as
   continuous growth/dimming until dwell allows a cut. No thrash, ever.
6. **Focus (C9).** The director never moves keyboard focus while the human is typing;
   cuts defer until 1200ms input-idle.
7. **Reduced motion (C8).** Glides → 120ms crossfades; growth → stepped sizes;
   breathing off; wash → plain fill transition. Same compositions, same order, same
   slate lines. `prefers-reduced-motion` plus `[data-motion="reduced"]` test override.

## 3 · Metronome (CSS variables, single source)

```
--cut:    700ms cubic-bezier(0.22, 1, 0.36, 1)   /* structural cut / camera glide  */
--depth:  700ms  same curve                       /* recede: scale .94, opacity .5, saturate .6 */
--reveal: 900ms  opacity only                     /* slate + any text, no translation */
--grow:   500ms  per failure event, +8% width, cap 1.5×
--wash:  1100ms  radial sage from the resolved control; hold 1800ms; decay 1400ms
--breathe: 6s    sine, periphery opacity .58↔.66  /* below screenshot-diff threshold (C7) */
--dwell:  4000ms min between cuts
--idle:   1200ms typing guard
```

## 4 · Hero sequence (playable timeline, build 1)

**Load — "morning, mid-mission", `work`:** thread `deploy-snapshot` dominant at
`tools/deploy`; supports: terminal at `src/backend/tunnel` scrolling green tests + the
`feat/deploy-snapshot` diff. World strip live, agents at their places. Zero gold.
Slate: `composed · morning review`.

- **T+2s — first crack.** Terminal prints a red FAIL (`store.append: envelope order`).
  +8% growth. Slate: `grew terminal · tests failing in tunnel store`. The tunnel-store
  terrain darkens one step.
- **T+6s — second, third fail.** Growth to ~1.24×; the diff dims (support weight
  shifts). Still zero gold — Deploy Snapshot · opus's presence dot glides to the
  tunnel-store node; the thread gains their line. Agents handling it ≠ human needed.
- **T+12s — the ask.** Deploy Snapshot · opus raises a decision: *lockfile hash
  mismatch at the merge gate.* Director cut → `tribunal` (700ms): room pulls into
  depth; card advances; **the** gold appears on its primary action. Slate:
  `decision · deploy snapshot at the merge gate`. Defers if the human is typing.
- **Decision anatomy (anti-prose).** Caption: `Snapshot deps disagree with the
  workspace lockfile.` Then numbered rows — the row IS the link and the option, no
  chips (per b970bf88):
  `1 Rebuild deps inside the snapshot · ~90s, keeps sha` — hover lights the terminal
  `2 Pin the previous snapshot · instant, one merge behind` — lights the map node
  `3 Read the diff first` — lights the diff surface
  Keys 1–3 answer. Hovering a row lights its object in the dimmed world behind.
- **Resolve (press 1 or 2 — each branch is truthful).** Gold releases → sage floods the
  card (1100ms) and the ripple travels the causal path: card → thread line → the *chosen*
  seam's node. The card folds home, becoming a stable thread entry `evt-07` (actor Chris,
  `decisionId`, `causedBy` evt-06 → root evt-05) — the memory absorbs the decision.
  The Director may only stage the consequence Chris chose (reversible-director law):
  **1 = ledger** accepts `MessageStore` (dashed → solid), reruns the ledger suite green;
  **2 = sync** accepts *no* single owner — the three memory nodes reconcile together,
  a reconciler suite runs, mission reads `reconciling` (drift work is ongoing). The
  chosen option is encoded in the hash so a reload never turns a sync choice into ledger.
- **Recompose (after 1800ms hold).** One 700ms cut back to `work`, re-cast: terminal
  dominant (rebuild streaming), thread support. Slate: `resumed · snapshot rebuilding`.
  Zero gold. ~T+40s the suite goes green, terrain lightens, and after 8s of quiet the
  world settles to `wide` — breathing only. The app is visibly at rest.

## 5 · Verbs (keyboard-first, C9)

`Esc` reverse cut · `P` pin/release · `G` go to gold (beacon-guided if off-screen) ·
`M` wide · `1–9` answer decision rows · click surface = user cut (instant legitimacy,
slate: `you · opened the diff`) · `R` replay timeline. Off-screen gold: a hairline gold
thread from the screen edge toward the beacon — static, no pulse, no text (C3).

## 6 · Provenance (C15)

Every surface's footer, tiny muted Inter: terminal `tsx · src/backend/tunnel — live`;
diff `feat/deploy-snapshot vs main · b970bf8`; decision card `raised by Deploy
Snapshot · opus · from tunnel-store failures`. Provenance is the causal reason made
permanently visible — the slate explains the cut, the footer explains the artifact.

## 7 · Gate hooks

`[data-gold]` (count ≤ 1) · `[data-slate]` · `[data-pinned]` ·
`[data-composition="wide|work|study|tribunal"]` · `[data-motion="reduced"]` · all
timings as the §3 CSS vars. One file, file://, zero network (C13), real names (C14).
