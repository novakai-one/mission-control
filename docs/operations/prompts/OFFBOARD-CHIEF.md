# Prompt — Offboard a Chief

Use this after the Chief has completed its current mission and you want the
session to end. Offboarding preserves truthful state for a fresh Chief; it is
not permission to begin more work.

```text
Please offboard as Chief now.

This is close-out only:
- Do not start a new mission.
- Do not merge a PR.
- Do not change the handbook.
- Do not begin adjacent cleanup.

Before reporting:
1. Reconcile every observed failure with the mission's acceptance result. If
   anything remains contradictory, name it; do not convert it into a pass.
2. Finish the current EXP's AAR without rewriting its BEFORE predictions.
   Leave Review pending for Chris or the independent Process Reviewer.
3. Update mission and task records only to what is true now. Distinguish open,
   merged remotely, pulled locally, and cleaned locally.
4. Write one factual Captain's Log close-out with the PR/deliverable, strongest
   independent verification, team/session IDs, and any severe carry-over.
5. Thank and release agents that no longer have a purpose. Verify the live
   workforce rather than trusting roster status.
6. Report exact repository state: current branch, ahead/behind state, staged or
   unstaged files, surviving worktrees/branches, and shared processes. Do not
   discard or commit owner changes.
7. List everything waiting on Chris and all unfinished work.
8. Preserve the paths to the mission packet, EXP, result, process review, and
   relevant sessions.

Reply only in this format:

Chief offboarding complete.

Waiting on Chris
- <item or Nothing>

Open PRs
- <PR, state, owner action or None>

Unfinished work
- <item or Nothing>

Live workforce
- <name, role, reason or Nobody>

Repository and process state
- <branch, sync state, staged/unstaged files, worktrees, shared processes>

Evidence preserved
- <mission packet, EXP, result, review, session IDs>

Next Chief should know
- <only facts that materially affect the next Chief>

Unknowns
- <anything not verified or Nothing>

Then stop. Do not offer or begin another task.
```

## Chris's finish gate

Offboarding passes when a fresh Chief can reconstruct the company from stores,
artifacts, and repository state without needing the previous Chief's memory.
The EXP AAR must be complete; its Review box may correctly remain open.
