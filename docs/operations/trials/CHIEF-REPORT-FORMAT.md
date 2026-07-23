# Chief's Mission Report — Trial Format v1

**Status:** Trial — use for the Chief's close-out report to Chris; does not
replace CHIEF.md Part 6 (the in-chat report to Chris still happens as before)
**Applies when:** A Chief accepts a mission and reports the outcome to Chris
**Does not apply when:** Process reviews (`PROCESS-REVIEWER.md`) or
operational-review deep artifacts (`.novakai/docs/operational-review/METHOD.md`)
**Example:** `.novakai/docs/reports/2026-07-23-chief-report-example/report.html`
(served at `http://127.0.0.1:7300/reports/2026-07-23-chief-report-example/report.html`
while the docs server runs). This example is kept — do not overwrite it.
**Created:** 2026-07-23, iterated live with Chris against real
`mission_mission-object-model` data. Chris's verdict: "This report is
something I can read!"

## Purpose

Chris may open this report 12 hours after the work, remembering nothing.
The first screen must restore context in under 5 seconds, and the whole page
must be readable without effort. Show, don't tell.

## Structure (in this order)

1. **Title block** — mission name, date, project, reporting Chief.
2. **What we set out to do** — FIRST on the page. One large colored tile per
   workstream. The tile carries ONLY the workstream name ("Object Model",
   "Messaging Fixes") — no subtitles, no extra story. The tiles ground the
   reader; the short plain text beside each tile explains.
3. **Verdict banner** — one line: "It works." / "It mostly works." /
   "It didn't work." plus what that means for Chris. The only full-width
   element on the page.
4. **What you got** — 2-column card grid. Each card = small uppercase
   takeaway label + one short sentence. Reading only the labels should give
   the whole section. A lone unpaired last card (e.g. the 5th of 5) is fine —
   Chris confirmed.
5. **The proof** — one figure per claim: screenshot or diagram with a 2–3
   sentence caption. No claim without a picture; a claim with no picture is a
   confession, not a section. Diagrams should come from novakai-canvas once
   wired up; hand-drawn inline SVG is acceptable during the trial.
6. **What didn't go to plan** — cards that fill the row (3 items → 3 across).
   Amber accent. Honest warts, bold title + one sentence each.
7. **What happens next** — 2-across cards with pills: YOUR MOVE (amber) /
   OUR LIST (blue). Whose turn it is must read at a glance.
8. **Fine print** — branch, commits, team, packet path. For the process
   reviewer, not for Chris.

## Layout laws (learned 2026-07-23, iterating with Chris)

- **No full-width text.** Constrain every paragraph and list. Long full-width
  prose hurts; modular blocks don't.
- **Never leave a section looking half-empty.** A single constrained-width
  column with blank space to its right reads as broken (this killed the first
  version of "What didn't go to plan"). Fill the row with a grid or go full
  width.
- **A lone last card in a 2-column grid is fine.** The "What you got" section
  with 5 cards was explicitly approved — don't "fix" it by stretching the
  last card.
- **One idea per tile, just the name.** Adding a subtitle to the tile was
  tried and rejected: it tries to communicate too much and defeats the
  grounding purpose.
- **Chris-friendly sentences.** "We restarted the server mid-message and
  checked nothing was lost" — not "CC4b D2 SIGKILL drill marker count
  exactly 1". No thriller prose, no internal jargon.
- **Scanability comes in layers:** tiles = context, banner = outcome, card
  labels = substance, sentences = detail. Each layer must work on its own.

## Generation intent (not yet built)

The report is a view over the mission packet (`result.md`, `evidence/`,
audit, EXP), assembled by the Chief at close-out — not hand-authored prose.
The typed-block artifacts stay underneath for the process reviewer; this is
the human rendering of the same facts.

## Trial notes

- Built and approved against one real mission. Needs at least one more live
  use before promotion is discussed.
- Promotion (CHIEF.md Part 6 pointing here, or this becoming the default
  close-out artifact) happens only when Chris says so. Do not silently
  rewrite the operating method.
