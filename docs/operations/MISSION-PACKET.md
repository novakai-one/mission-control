# Mission Packet

**Status:** Trial — promote after reviewed live missions
**Owner:** Chief
**Applies when:** Turning Chris's natural direction into one managed mission
**Does not apply when:** A tiny direct task has no delegated team or durable artifacts
**Updated:** 2026-07-21
**Live verification:** Pending first trial run

The packet preserves the instruction chain without creating a second Mission
Contract format. The `$compile-mission-brief` skill owns contract structure and
collision resolution; this document owns artifact custody.

## Packet layout

Create one directory per mission:

```text
<target-repo>/.novakai/work/<mission-id>/
  source.md    ← Chris's raw prompt, preserved exactly
  brief.md     ← compiled Mission Contract; canonical mission instruction
  plan.md      ← execution plan; written before build
  audit.md     ← independent plan audit when required
  result.md    ← Manager's verified result
```

The mission store owns status and references. The packet owns the working
artifacts. Messages point to packet files rather than reproducing them.

## Create the packet

1. Save Chris's complete mission direction in `source.md`.
2. Explicitly invoke `$compile-mission-brief`.
3. Save the emitted Mission Contract in `brief.md`.
4. Record any material collision the compiler resolved below the Contract
   under `## Compiler notes`; do not turn harmless cleanup into ceremony.
5. Add paths to required source material only when they change execution.
6. Give the Manager `brief.md` only after onboarding passes.

Do not send `source.md` downstream as an alternative brief. It exists so the
Chief and Process Reviewer can detect lost intent, invented constraints, or a
bad compiler decision.

## Plan and audit

- The Manager or Worker writes `plan.md` and stops before building.
- A different-provider Auditor writes `audit.md` for material or risky work.
- The Manager resolves every severe finding and records the ruling in the
  approved plan or build authorization.
- Empty audit ceremony is worse than no audit; use one only when it can change
  a meaningful decision.

## Result

The Manager writes `result.md` using the result format in `MANAGER.md`.

It must distinguish:

- Worker self-verification
- Manager independent verification
- Deviations from the Contract or approved plan
- Work deliberately left outside scope
- Sessions, branches, commits, PRs, and artifact paths

## Change control

If the Mission Contract changes materially:

1. Preserve the previous version in git or the mission evidence trail.
2. Record who made the decision and why.
3. Notify the Manager.
4. Require every active participant to re-read `brief.md` and `plan.md`.

Do not maintain a separate prose copy of the Contract in messages, plans, or
status reports. Reference its headings and named checks.

## Completion

The packet is complete when:

- The original prompt and compiled Contract are both preserved.
- Plan and audit decisions are traceable.
- Result evidence maps to the Contract's observable finish line.
- The Process Reviewer can reconstruct the chain without asking participants
  to remember what happened.
