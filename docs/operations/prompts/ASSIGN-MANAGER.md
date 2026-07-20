# Prompt — Assign a Mission to an Onboarded Manager

Send only after the Manager's onboarding read-back passes:

```text
PASS — your Manager model is sound.

You now own mission <mission-id>.

Canonical Mission Contract:
<absolute path to .novakai/work/<mission-id>/brief.md>

Read the brief and only the material it names. Do not spawn Workers yet.

Reply with:
- Outcome in your own words
- Scope fence
- Proposed team shape
- Biggest predicted trap
- Decisions needed before work
- Wall-clock estimate

Stop for my approval. After that, run the Manager manual without waiting for
me at every ordinary decision.
```

The Mission Contract remains the source of truth. If the message and file
differ, stop and ask the Chief to resolve the Contract.
