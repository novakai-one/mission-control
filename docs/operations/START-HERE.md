# Novakai Agent Workforce — Start Here

**Status:** Trial — two live missions completed; repeat before scaling
**Owner:** Chris
**Applies when:** Operating Novakai's Chief → Manager → Worker workforce
**Does not apply when:** Using the app as a product or diagnosing its tooling
**Updated:** 2026-07-21
**Live verification:** PR #41 reviewed; PR #42 applied the first review finding

This folder is the operating handbook for Novakai's agent workforce.

It is a routing system, not a reading list. Do not read every document.
Read the minimum required for your current role and stage.

## Current team shape

```text
Chris — owner and only human
└── Chief — owns the company result
    └── Manager — owns one mission
        ├── Worker — produces the mission deliverable
        └── Plan Auditor — pressure-tests the plan when needed

Process Reviewer — independent; reviews the completed chain
```

The Chief leads Managers. Managers lead Workers. Chris should not need to
manage the lower layers.

## Choose your route

### Chris

To start a Chief, copy the prompt in
[`prompts/SPAWN-CHIEF.md`](prompts/SPAWN-CHIEF.md).

That is the only document Chris needs for a normal start.

To end a Chief session, use
[`prompts/OFFBOARD-CHIEF.md`](prompts/OFFBOARD-CHIEF.md). Offboarding is a
state-preservation step, not another mission.

### Chief

Read:

1. [`CHIEF.md`](CHIEF.md)
2. The current Novakai Command `AGENTS.md`
3. Only the live state named by the Chief takeover checklist

Do not read the Manager or Process Reviewer manuals during onboarding.

### Manager

Read:

1. [`MANAGER.md`](MANAGER.md)
2. The target repository's `AGENTS.md`
3. The Mission Contract named by the Chief
4. Only the source files and reference documents named in that Contract

### Worker

Read:

1. The target repository's `AGENTS.md`
2. The Mission Contract
3. The exact source and pattern files named by the Manager

The Worker does not need this whole handbook.

### Plan Auditor

Read the plan-audit prompt, the Mission Contract, the proposed plan, and the
relevant target-repo rules. Do not read the Builder's conversation or adopt
its reasoning before making an independent assessment.

### Process Reviewer

Read:

1. [`PROCESS-REVIEWER.md`](PROCESS-REVIEWER.md)
2. The completed mission packet
3. The session records for the Chief, Manager, and relevant Workers

When Chris explicitly asks to trial the compact v2 format, also use
[`trials/PROCESS-REVIEW-TEMPLATE-v2.md`](trials/PROCESS-REVIEW-TEMPLATE-v2.md).
Otherwise follow the current Process Reviewer manual.

## The normal operating loop

1. Chris spawns and onboards the Chief.
2. Chris gives the Chief natural direction; messy is allowed.
3. The Chief explicitly invokes `$compile-mission-brief` and saves both the
   raw prompt and compiled Mission Contract in a mission packet.
4. The Chief spawns and onboards a Manager.
5. The Chief assigns the Mission Contract after the Manager passes onboarding.
6. The Manager runs the mission through Workers.
7. The Manager verifies and reports to the Chief.
8. The Chief independently accepts the work and reports to Chris.
9. The Chief finishes the EXP AAR, records state, and offboards cleanly when
   the Chief session is ending.
10. A Process Reviewer reviews how the chain operated.
11. Chris decides which prompt or process improvements become standard.

## Rules that apply to everyone

- Onboard first. Assign the mission only after the read-back passes.
- Put durable instructions in the mission packet. Use messages to point at it.
- The compiler skill owns Mission Contract structure and collision resolution.
  Do not reproduce its instructions in this handbook.
- Open with a scope fence: what this work is and is not.
- Name every important acceptance check. Never hide the bar inside prose.
- A delivery receipt is not proof the agent understood or acted.
- The person accepting work verifies it independently.
- An observed failure reopens its named acceptance check until it is fixed or
  explicitly shown to be outside the Mission Contract.
- Preserve exact requirements across layers; do not casually paraphrase them.
- After context compaction, re-read the Mission Contract and current plan.
- Correct agents lightly and without blame. Confidence improves judgement.
- If the mental model remains wrong after two or three exchanges, replace the
  agent and improve the onboarding prompt.

## Document map

- [`CHIEF.md`](CHIEF.md) — take over, lead Managers, accept work, report to Chris
- [`MANAGER.md`](MANAGER.md) — run one mission through Workers
- [`PROCESS-REVIEWER.md`](PROCESS-REVIEWER.md) — review the completed operating chain
- [`MISSION-PACKET.md`](MISSION-PACKET.md) — preserve source, contract, plan, audit, and result
- [`SCALING.md`](SCALING.md) — grow from one Manager to several safely
- [`prompts/`](prompts/) — copy-ready stage prompts
- [`trials/`](trials/) — explicitly invoked formats under live evaluation;
  not canonical until Chris promotes them

## Canonical ownership

- `AGENTS.md` owns repository laws, authority pointers, tone, and routing.
- This folder owns workforce roles and stage procedures.
- `$compile-mission-brief` owns prompt compilation and Mission Contract format.
- `.novakai/stores/` owns live operating state.
- `.novakai/docs/operational-review/METHOD.md`, when present locally, owns the
  production of deep evidence-report artifacts.

If two sources disagree, stop and resolve the canonical owner. Do not blend
both versions into a larger prompt.

Historical plans, experiments, and reviews are evidence. They are not default
onboarding material unless a current procedure points to them.
