# Operational Review — the repeatable operation

How to audit a long agent run (hours of autonomous work) and produce the
house-style review report. First run: `2026-07-20-or001-kimi-messaging-ui-round3/`
(the 8-hour Kimi messaging-ui build). Any agent should be able to repeat this
end-to-end from this file.

## What it produces

One directory per review, named `YYYY-MM-DD-orNNN-short-slug/` (orNNN is a
simple running counter across all reviews — next is or002):

```
.novakai/docs/operational-review/
  METHOD.md            ← this file
  wire-tracer.py       ← session tracer (digest / stats / grep)
  render.mjs           ← shared renderer: report.jsonl → report.html
  YYYY-MM-DD-orNNN-slug/
    report.jsonl       ← the data (typed blocks, one JSON object per line)
    assets/*.png       ← evidence crops referenced by figure blocks
    report.html        ← rendered output (self-contained, images inlined)
```

Re-render any report, same visuals, one command:

```
node .novakai/docs/operational-review/render.mjs .novakai/docs/operational-review/<report-dir>
```

Open `report.html` directly (file:// works) or publish it as an artifact.

## The operation, phase by phase

1. **Locate + onboard.** Find the session data. Kimi: per-agent `wire.jsonl`
   under `~/.kimi-code/sessions/<wd>/<session>/agents/*/`. Read the repo's
   AGENTS.md/CONTEXT.md, the plan the run executed, and every doc the run was
   given as input. You must understand what the agent was *asked* before
   judging what it *did*.
2. **Trace mechanically, don't read raw.** Point `wire-tracer.py` at the
   session (edit its BASE path). Three verbs:
   - `digest <agent>` — readable per-agent timeline (prompts, thinking, tool
     calls, results, todos, per-step tokens). Read main/chief first, then
     each subagent.
   - `stats` — wall-clock, LLM-latency share, first-token medians, tool mix,
     token totals per agent. This finds where the hours actually went.
   - `grep <regex>` — cross-agent event search.
3. **Reconstruct the timeline.** Who did what, when, with commit hashes and
   diff stats (`git show <hash> --stat`). Note owner interrupts/cancels —
   they mark the run's real inflection points.
4. **Chain-of-custody trace the key requirements.** For each requirement that
   mattered (especially the one that failed): grep its key phrase at every
   hop — plan → spawn briefs → builder tool calls → gate brief → final
   report — and mark where it stops appearing. Every hop that rewrites
   instructions is a place a requirement can silently die. Also check
   *artifact consumption*: did agents ever open the reference files/images
   they were given? (grep ReadMediaFile / Read calls per agent.)
5. **Verify claims live — never trust the run's own reports.** Check claimed
   code against the merged branch. Drive the shipped UI in a real browser
   (`~/.claude/browse`, or `tools/browse` in-repo): click the disputed
   controls, measure the disputed motion, screenshot. Read-only: an
   operational review never edits the reviewed codebase.
6. **Cut the evidence crops.** Zoomed side-by-side crops (design vs built,
   or before vs after) — small regions, not full screenshots; a viewer must
   be able to tell compliance at a glance. Save to the report's `assets/`.
7. **Author `report.jsonl`.** Typed blocks, schema below. Structure: Team
   roster (owner rule 2026-07-20: a `table` section near the top listing
   every participant — Role, Name, Model; include Chris as Coach — Human) →
   short version (+ its callout) → stats → timeline → case study (figures,
   finding, chain) → where-the-time-went → what held up → gaps → playbook
   → method. Findings
   ranked; exactly ONE gold `finding` block per report (amber scarcity);
   wins are sage; everything else monochrome. Every claim carries its
   evidence (times, hashes, counts) and each gap ends in a playbook step.
8. **Render + verify + file.** `node render.mjs <dir>`, then drive
   report.html in the browser (scroll, open the detail rows, read the
   shots) before calling it done. Publish as artifact for Chris, and log
   the review in `.novakai/stores/captains-log.jsonl` / file learnings with
   evidence refs per AGENTS.md. Log entries carry session lookup keys
   (owner rule, 2026-07-20): top-level `sessionId` + `sessionProvider` =
   the session that WROTE the entry, and any session the work references
   (e.g. the reviewed build) goes in `refs` as
   `{"kind":"session","value":"<session id>","label":"..."}`.

## report.jsonl block schema (v1)

Every line: `{ "id": "...", "kind": "...", ... }`. One `review` block; `section`
blocks define order and type; content blocks point at sections via `section`.

| kind | fields | notes |
|---|---|---|
| `review` | ts, title, kicker, subtitle(html), subMeta, timelineAxis{start,end,endDayOffset,ticks[{at,label,dayOffset}]}, subject{...}, footer[html] | one per report |
| `section` | order, type, label, tight?, note?, columns? | type ∈ prose, stats, timeline, figures, finding, chain, latency, rows, play, table. Empty label + `tight:true` = continuation of the section above |
| `prose` | section, order, html, lead? | paragraphs |
| `stat` | section, order, v, k | stat tile |
| `span` | section, order, who, what, start, end, startDay?, endDay?, tone?(soft/gold), label, anchorRight? | timeline bar; times "HH:MM" + day offsets vs axis start |
| `figure` | section, order, img(relative), alt, capTitle, cap(html), wide? | images inlined as data URIs at render time |
| `finding` | section, order, label, headline, detail(html) | THE gold banner — max one per report |
| `callout` | section, order, html | sage-barred emphasis box — owner rule (2026-07-20): every report's Short Version carries one, with a plain-words "how Chris should feel" line, positive-leaning |
| `chain-link` | section, order, status(ok/part/dead), title, body(html) | chain-of-custody card |
| `latency` | section, order, who, pct, label | single-measure bar |
| `row` | section, order, tone(win/gap), mark?, title, tag, body(html), open? | expandable evidence row |
| `play-step` | section, order, title, body(html), save? | numbered playbook step; `save` renders sage |
| `table-row` | section, order, cells[html] | first cell bold |

## Spawn brief (paste-ready)

> You are running an **operational review** of an agent session. Read
> `.novakai/docs/operational-review/METHOD.md` and follow its phases exactly.
> Subject session: `<path>`. The run's task docs: `<plan/brief paths>`.
> Owner's complaint(s) to root-cause: `<verbatim>`. Do NOT edit the reviewed
> codebase — read, trace, drive the UI, screenshot. Deliverables: (1) a new
> report directory per METHOD.md naming (next id: orNNN) with report.jsonl,
> assets, rendered report.html — browser-verified before you report done;
> (2) an artifact link for the owner; (3) chain-of-custody verdict for each
> owner complaint. House rules: one gold finding, sage wins, evidence on
> every claim, readable over academic.

## Lessons already banked (apply to the next review)

- Checklists eclipse prose: whatever the gate must check, name item-by-item
  in the gate's own brief.
- The wire's `stats` view settles "where did the hours go" arguments in
  seconds — run it before theorizing.
- Zoomed crops beat full-app screenshots for compliance judgment.
- Kimi infra: background dev servers need `< /dev/null` + no timeout;
  worktrees have `playwright-core`, not `@playwright/test`.
