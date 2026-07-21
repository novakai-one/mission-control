# Prompt — Authorize the Build

The Manager sends this after plan review and audit rulings:

```text
Plan approved. Build is authorized.

Canonical Mission Contract:
<brief path>

Approved plan:
<plan path>

Audit rulings:
- <accepted change>
- <rejected finding and Manager ruling, if relevant>

Ownership:
- Branch/worktree: <path>
- You own: <files/modules>
- Do not touch: <files/modules>

Completion checks — preserve these exactly:
1. <named observable check>
2. <named observable check>
3. <named observable check>

Required evidence:
- <evidence>

Checkpoint:
- <meaningful phase or silence boundary>

Stop before:
- Any destructive or irreversible action
- Scope or ownership conflict
- A decision reserved for Manager/Chief/Chris

If your context compacts, re-read the Mission Contract and plan before continuing.

Build, self-verify, write your evidence, and report to me. You own ordinary
implementation decisions inside these boundaries. Have fun with it.
```
