# Process Review — Trial Template v2

**Status:** Trial — invoke explicitly; do not replace the current report format
**Applies when:** Reviewing a completed Chief → Manager → Worker mission
**Does not apply when:** Performing product acceptance or fixing the work
**Deep artifact method:** `.novakai/docs/operational-review/METHOD.md`, when requested

The short verdict comes first. Product quality and workforce quality receive
separate verdicts. Findings are evidence-backed; recommendations are proposed,
not silently installed.

---

# Process Review — `<mission>`

## Verdict

- **Process:** `Held / Partly held / Did not hold`
- **Product:** `Accepted / Accepted with follow-up / Not accepted / Not reviewed`
- **How Chris should feel:** `<one plain-language sentence>`
- **Scaling:** `Scale / Repeat once / Hold`
- **Reason:** `<one sentence naming the strongest evidence>`

## Review identity and limits

- **Reviewer:** `<name, provider/model, session id>`
- **Reviewed period:** `<exact timestamps with offset>`
- **Mission packet:** `<path>`
- **EXP:** `<path>`
- **Deliverable / PR:** `<path or URL>`
- **Evidence unavailable:** `<items or None>`
- **Independence limits:** `<prior involvement/context, or None>`

## Team

| Role | Name | Provider/model | Session |
|---|---|---|---|
| Chief | | | |
| Manager | | | |
| Worker | | | |
| Auditor | | | |

## Outcomes

### Product outcome

- **What works:** `<observed behaviour>`
- **What remains:** `<bounded defect/follow-up or Nothing>`
- **Verification:** `<primary evidence>`

### Process outcome

- **What held:** `<strongest operating behaviours>`
- **What did not:** `<material operating failure or Nothing>`
- **Verification:** `<primary evidence>`

Do not turn a bounded product defect into a verdict on the whole workforce.
Do not hide a serious acceptance failure because most product behaviour works.

## Hypothesis verdicts

| EXP hypothesis | Prediction | Observed | Verdict | Evidence |
|---|---|---|---|---|
| Product | | | Confirmed / Rejected / Inconclusive | |
| Process | | | Confirmed / Rejected / Inconclusive | |

## Process scorecard

| Stage | Held / Partly / Missed | Evidence |
|---|---|---|
| Source preserved and Contract compiled | | |
| Chief onboarding and state reconstruction | | |
| Manager onboarding and read-back judgement | | |
| Requirement custody and assignment | | |
| Plan gate and independent audit | | |
| Worker boundaries and execution | | |
| Manager independent verification | | |
| Chief contradiction brake and acceptance | | |
| Reporting, EXP AAR, and offboarding | | |

## Requirement custody

Trace only the requirements that could change the outcome.

| Requirement | Source | Contract | Manager | Worker/plan | Verification | Final report | Verdict |
|---|---|---|---|---|---|---|---|
| | exact / changed | exact / changed | exact / changed | exact / changed | named / lost | honest / drifted | Held / Weakened / Lost |

## Verification truth

| Named check | Claimed result | What primary evidence shows | Contradiction reconciled before acceptance? |
|---|---|---|---|
| | Pass / Fail | | Yes / No / N/A |

Any `No` here is at least a verification finding. If it makes acceptance
unreliable at scale, rate it Severe.

## What worked

- `<strength — evidence>`
- `<strength — evidence>`

Preserve successful prompt language and management behaviour, not just gaps.

## Findings

Order Severe first. Omit low-value findings unless Chris asks for them.

### `<SEVERE | MODERATE | LOW>` — `<short finding>`

- **Class:** `Prompt / Onboarding / Management / Execution / Verification / System / Reporting`
- **Observed fact:** `<neutral statement>`
- **Why it matters at scale:** `<consequence>`
- **Evidence:** `<timestamp, path, session event, test, or commit>`
- **Smallest useful change:** `<one change>`
- **Applies when:** `<conditions>`
- **Does not apply when:** `<conditions>`

Repeat this block per material finding. Do not label an agent careless when
the prompt or system made the failure predictable.

## Timing and interventions

Use transcript or journal timestamps, never session-age estimates.

| Event | Timestamp | Evidence |
|---|---|---|
| Direction received | | |
| Manager assigned | | |
| Build authorized | | |
| First completion claim | | |
| Manager accepted | | |
| Chief accepted | | |
| Final report / offboard | | |

- **Chris interventions:** `<count and reasons>`
- **Chief contract corrections:** `<count and reasons>`
- **Late defects:** `<count and where found>`

## Deviations

| Planned | Actual | Surfaced to the accepting role? | Impact |
|---|---|---|---|
| | | Yes / No | |

## Proposed prompt changes

Only propose changes supported by a finding.

### `<prompt/stage>`

**Before**

> `<current wording or Missing>`

**After**

> `<proposed wording>`

**Why:** `<finding and expected effect>`

## Proposed process change

- **Change:** `<smallest useful intervention>`
- **Owner:** `<role>`
- **Where it belongs:** `<canonical document or system>`
- **Trial condition:** `<what the next run must demonstrate>`
- **Promotion condition:** `<evidence required before standardising>`

## Scaling recommendation

- **Decision:** `Scale / Repeat once / Hold`
- **Safe next team shape:** `<for example: one Chief + one Manager>`
- **What must be proven next:** `<specific transfer or reliability test>`

When the same Chief applies its own fresh lesson, call that `learning
application`, not proof that the handbook transfers the lesson to a fresh
Chief.

## Evidence index

- **Source prompt:** `<path>`
- **Mission Contract:** `<path>`
- **Plan / audit / authorization:** `<paths>`
- **Result / Chief report:** `<paths>`
- **EXP:** `<path>`
- **Sessions:** `<ids and providers>`
- **Git / PR:** `<branch, commits, URL>`
- **Review artifact:** `<this path; report.jsonl/html when produced>`
