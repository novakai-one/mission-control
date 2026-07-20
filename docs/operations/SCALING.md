# Scaling the Agent Workforce

**Status:** Trial — promote after reviewed live missions
**Owner:** Chief
**Applies when:** Growing from one Manager to multiple parallel Managers
**Does not apply when:** One direct Worker is completing a small standalone task
**Updated:** 2026-07-21
**Live verification:** Pending first multi-Manager trial

## Current operating shape

```text
Chris
└── 1 Chief
    └── 1 Manager
        └── 1 primary Worker
```

A temporary Plan Auditor may pressure-test the plan. A Process Reviewer audits
the completed chain independently.

The next intended shape is:

```text
Chris
└── 1 Chief
    ├── Manager A — Mission A — Worker(s)
    └── Manager B — Mission B — Worker(s)
```

## Scaling principle

Scale one dimension at a time.

Add another Manager while keeping each Manager's mission and Worker team
simple. Do not simultaneously add more Managers, larger Worker teams, new
communication paths, and a new process.

## When to add the next Manager

The current chain should first demonstrate:

- Chief onboarding works without Chris reconstructing state for it.
- Manager onboarding passes in one or two exchanges.
- The Mission Contract survives into the plan and verification.
- The Chief does not need to bypass the Manager.
- Manager and Chief independently verify.
- The Process Reviewer finds no severe role or verification failure.

This is evidence that the process can be copied.

## Initial limits

Until several reviewed runs hold:

- One Chief
- Up to two active Managers
- One active mission per Manager
- One primary Worker per mission
- One temporary Auditor when useful
- One independent Process Reviewer after substantial missions

Auditors can run sequentially to keep the live fleet understandable.

These are operating limits, not permanent product limits.

## Rules with two or more Managers

### Chief owns the mission map

For each active mission, know:

- Manager
- Outcome
- Repository and worktree
- Owned files/modules
- Current stage
- Next checkpoint
- Dependencies on other missions

Use the existing mission store as the source of truth.

### Managers own their teams

- Chief speaks to Managers.
- Managers speak to their Workers.
- Workers do not casually coordinate across Manager boundaries.
- Cross-mission decisions travel through the Chief.

This keeps accountability visible.

### Separate work before parallelising

Parallel missions need:

- Different worktrees or safe non-code boundaries
- Explicit file/module ownership
- No shared mutable artifact without one named owner
- A defined integration order

If two missions need the same file, the Chief decides the split before build.

### Keep acceptance local

Each mission has its own source, Contract, plan, checklist, evidence, and result.
Do not create one giant Contract shared by every Manager.

### Chief verifies the seam

Managers verify their missions. The Chief also verifies interactions between
missions: conflicting assumptions, integration order, shared contracts, and
the combined result.

## Signs scaling is too fast

- Chris receives questions from lower layers.
- Chief repeatedly talks directly to Workers.
- Managers wait on each other without a clear dependency owner.
- Several agents edit the same files.
- Acceptance requirements are paraphrased differently by each team.
- The Chief cannot state who owns each live process.
- Verification still depends on Chris finding the bugs.
- Process reviews repeat the same severe finding.

When these appear, reduce simultaneous missions. Fix the operating seam before
adding more agents.

## Promotion rule

Promote agents that have already demonstrated the process they will manage.

A strong Worker may become a Manager after they have:

- Completed a bounded mission
- Produced a sound plan
- Responded well to audit feedback
- Verified honestly
- Communicated clearly and supportively

Before promotion, give the Manager manual and run the normal read-back gate.
Past success does not replace role onboarding.

## What success looks like

- Chris speaks mainly with one Chief.
- Chief gives each Manager a clear mission and stays out of implementation.
- Managers run their teams and deliver verified results.
- Requirements survive every management layer.
- Process Reviewer finds improvements without discovering hidden chaos.
- The workforce can add another Manager by copying a proven operating unit.
