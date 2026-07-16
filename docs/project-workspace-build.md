# Project workspace build

## Scope

- Preserve Files, Agents, Transcript, Ruleset, and Debug.
- Add project-owned threads and provider-session pointers.
- Read Claude and Codex transcripts from provider storage.
- Keep provider transcripts authoritative and unmodified.
- Preserve active PTYs across navigation changes.
- Render conversation, execution, approval, and result states.

## Cost and context controls

- Deliver vertical slices with one focused commit each.
- Keep this checklist current after every slice.
- Read targeted files; never load complete provider histories.
- Use compact, production-shaped transcript fixtures.
- Keep canonical schemas shared across frontend and backend.
- Test through module interfaces, not implementation details.
- Run focused tests before the complete quality gate.
- Commit verified slices before starting another slice.

## Architecture

```text
Project record
└── Thread
    ├── Claude session reference
    └── Codex session reference

ProviderSessionSource
├── ClaudeSessionSource
└── CodexSessionSource

Provider transcripts → canonical events → thread projection → renderer
```

Project records live under `~/.novakai-command/projects/`.

## Behaviour checklist

- [ ] Projects persist after application restart.
- [ ] Threads persist inside their project.
- [ ] Claude sessions attach manually.
- [ ] Codex sessions attach manually.
- [ ] Missing session files show actionable errors.
- [ ] Provider events normalize consistently.
- [ ] Provider attribution remains visible.
- [ ] Thread switching preserves active PTYs.
- [ ] Browser reload restores subscriptions.
- [ ] Background output replays correctly.
- [ ] Transcript tab remains visible.
- [ ] Existing Transcript behaviour still works.
- [ ] Existing Files behaviour still works.
- [ ] Existing Agents behaviour still works.
- [ ] Provider transcripts remain unchanged.

## Visual checklist

- [ ] Restrained dark-and-amber palette.
- [ ] No neon provider colours.
- [ ] Selected project remains obvious.
- [ ] Selected thread remains obvious.
- [ ] Active provider remains obvious.
- [ ] Execution status remains calm.
- [ ] Approval consequences remain explicit.
- [ ] Empty states explain their next action.
- [ ] Error states avoid technical noise.
- [ ] Transcript tab remains prominent.
- [ ] Desktop layout has no clipping.
- [ ] Narrow layouts remain usable.
- [ ] Every changed UI receives browser inspection.

## Quality checklist

- [ ] New modules have cohesive responsibilities.
- [ ] New interfaces stay narrow.
- [ ] No new import cycles.
- [ ] No new giant files.
- [ ] No swallowed errors.
- [ ] No unused exports.
- [ ] Exported declarations are documented.
- [ ] TypeScript passes.
- [ ] Tests pass.
- [ ] Standards lint passes.
- [ ] Production build passes.
- [ ] Novakai Analytics shows no regression.

## Commit sequence

1. Document architecture and acceptance criteria.
2. Add shared project and provider schemas.
3. Add project persistence.
4. Add Claude and Codex session adapters.
5. Add unified thread projections.
6. Add typed backend routes.
7. Add project workspace interface.
8. Add provider and thread switching.
9. Verify runtime persistence and transcript regression.
10. Complete browser and analytics verification.

