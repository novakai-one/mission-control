# Build Experiment — Trial Template v2

**Status:** Trial — invoke explicitly; do not replace the current EXP template
**Owner:** Chris
**Applies when:** A build is intended to teach us something about product or process
**Does not apply when:** The work is a tiny routine change with no useful comparison
**Source of truth:** One EXP file; reports link to it instead of copying it

This document records predictions before work, observations during work, and
verdicts after work. It does not replace the Mission Contract or repeat its
task plan. Missing data is data: use `Not measured`, never an invented number.

Do not rewrite BEFORE sections after execution begins. Correct them only with
an explicit timestamped note.

---

## Identity

- **ID:** `EXP-YYYY-MM-DD-<slug>`
- **Mission:** `<mission id>`
- **Mission Contract:** `<path>`
- **Build/deliverable:** `<one concrete result>`
- **Owner:** `<Chief or Manager>`
- **Start:** `<ISO-8601 timestamp with offset>`
- **Baseline:** `<prior EXP/evidence path, or None>`
- **Stage:** `[ ] Before  [ ] During  [ ] AAR  [ ] Process review`

## BEFORE — Product hypothesis

- **We expect:** `<observable product result>`
- **Confirmed if:** `<named test, behaviour, or measurement and threshold>`
- **Rejected if:** `<observable failure condition>`
- **Confidence:** `<0–100% and one-sentence reason>`

## BEFORE — Process hypothesis

- **We expect:** `<observable workforce/process result>`
- **Confirmed if:** `<measure and threshold>`
- **Rejected if:** `<measure and threshold>`
- **Why this is worth testing:** `<one sentence>`

Use `Not testing process` when appropriate. Do not combine the product and
process hypotheses; one may pass while the other fails.

## BEFORE — Variable, controls, and measures

- **One variable tested:** `<the deliberate change, or No controlled variable>`
- **Held constant:** `<team shape, model, harness, scope, or relevant controls>`
- **Comparison run:** `<EXP id/path, or None>`

| Measure | Source | Baseline | Prediction |
|---|---|---:|---:|
| Product acceptance | `<test/evidence>` | `<value>` | `<threshold>` |
| Wall time | `<first direction → accepted timestamps>` | `<value>` | `<value>` |
| Owner interventions | `<session transcript>` | `<count>` | `<count>` |
| Contract corrections | `<messages/authorization>` | `<count>` | `<count>` |
| Late defects | `<verification/review>` | `<count>` | `<count>` |

Only keep measures that answer the hypotheses. Define the timestamp boundaries
before work so session age cannot be mistaken for mission duration.

## BEFORE — Setup and team

- **Repo / branch / worktree:** `<exact values>`
- **Harness / permissions:** `<values>`
- **Boundaries:** `<Mission Contract section; do not duplicate it>`
- **Abort condition:** `<when the team must stop>`

| Role | Name | Provider/model | Effort | Fresh/resumed |
|---|---|---|---|---|
| Chief | | | | |
| Manager | | | | |
| Worker | | | | |
| Auditor | | | | |

## DURING — Append-only observations

Add exact timestamps. Mark late reconstruction as `(retro)`. Record evidence,
not a polished story.

| Time | Role | Observation or decision | Evidence | Contract impact |
|---|---|---|---|---|
| `<ISO-8601>` | | | `<path/id>` | None / ruling / deviation |

Always log:

- rulings and requirement changes;
- observed failures, respawns, forced kills, manual recovery, and masked exits;
- interventions from Chris;
- plan deviations and why;
- the first claim of completion and later corrections.

An observed failure remains open until reconciled. A later pass does not erase
the earlier observation.

## AFTER — Measured result

- **End:** `<ISO-8601 timestamp with offset>`
- **Measured wall time:** `<start boundary → acceptance boundary>`
- **Artifact:** `<PR, commit, or output path>`
- **Acceptance state:** `Accepted / Returned / Stopped`

| Measure | Predicted | Observed | Evidence | Hit? |
|---|---:|---:|---|---|
| Product acceptance | | | | Yes / No |
| Wall time | | | | Yes / No |
| Owner interventions | | | | Yes / No |
| Contract corrections | | | | Yes / No |
| Late defects | | | | Yes / No |

## AFTER — Contradiction reconciliation

| Observed failure or conflicting claim | Final disposition | Evidence |
|---|---|---|
| | Fixed / Outside Contract / Still open | |

If any mission-critical contradiction is still open, the mission was not
accepted. Do not write `Nothing broken` while this table contains an open item.

## AFTER — Separate verdicts

- **Product hypothesis:** `Confirmed / Rejected / Inconclusive` — `<why>`
- **Process hypothesis:** `Confirmed / Rejected / Inconclusive` — `<why>`
- **What worked:** `<short evidence-backed statement>`
- **What hurt:** `<short evidence-backed statement>`
- **What surprised us:** `<short evidence-backed statement>`

## AFTER — Learning and next decision

- **Learning:** `<one evidence-backed sentence>`
- **Applies when:** `<conditions>`
- **Does not apply when:** `<conditions>`
- **Decision:** `Promote / Repeat once / Hold / Abandon`
- **Next comparison:** `<what a fresh run must test>`

Do not claim transfer across Chiefs when the same Chief retained the prior
mission in context. Label that run `learning application`; use a fresh Chief
for a clean transfer test.

## Process review

- **Reviewer:** `<name/session or Pending>`
- **Review artifact:** `<path or Pending>`
- **Verdict:** `<Held / Partly held / Did not hold / Pending>`
- **Template decision:** `<Promote / Amend / Repeat / Pending>`
