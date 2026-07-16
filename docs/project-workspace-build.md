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

- [x] Projects persist after application restart.
- [x] Threads persist inside their project.
- [x] Claude sessions attach manually.
- [x] Codex sessions attach manually.
- [x] Missing session files show actionable errors.
- [x] Provider events normalize consistently.
- [x] Provider attribution remains visible.
- [x] Thread switching preserves active PTYs.
- [x] Browser reload restores subscriptions.
- [x] Background output replays correctly.
- [x] Transcript tab remains visible.
- [x] Existing Transcript behaviour still works.
- [x] Existing Files behaviour still works.
- [x] Existing Agents behaviour still works.
- [x] Provider transcripts remain unchanged.

## Visual checklist

- [x] Restrained dark-and-amber palette.
- [x] No neon provider colours.
- [x] Selected project remains obvious.
- [x] Selected thread remains obvious.
- [x] Active provider remains obvious.
- [x] Execution status remains calm.
- [x] Approval consequences remain explicit.
- [x] Empty states explain their next action.
- [x] Error states avoid technical noise.
- [x] Transcript tab remains prominent.
- [x] Desktop layout has no clipping.
- [x] Narrow layouts remain usable.
- [x] Every changed UI receives browser inspection.

## Quality checklist

- [x] New modules have cohesive responsibilities.
- [x] New interfaces stay narrow.
- [x] No new import cycles.
- [x] No new giant files.
- [x] No swallowed errors.
- [x] No unused exports.
- [x] Exported declarations are documented.
- [x] TypeScript passes.
- [x] Tests pass.
- [x] Standards lint passes.
- [x] Production build passes.
- [x] Novakai Analytics shows no regression.

## Verification evidence

- Full suite: 20 tests passing.
- Standards score: 201, matching baseline.
- Production build: Vite build passing.
- Browser: desktop layout, scrolling, provider switching verified.
- Browser: Projects/Transcript switching preserves both views.
- Browser: zero console errors after reload and switching.
- Browser: approval renderer and 900px layout verified.
- Novakai Analytics: 53/100, improved from 50/100.

## Phase 2 runtime checklist

- [x] TerminalManager accepts Claude or Codex.
- [x] Claude launches with a predetermined session ID.
- [x] Codex launches in inline terminal mode.
- [x] Codex discovers its provider-owned session ID.
- [x] Project launch attaches sessions automatically.
- [x] Project composer sends prompts to live PTYs.
- [x] Unified timelines update while providers run.
- [x] Thread switching preserves live terminals.
- [x] Restart restores projects and provider transcripts.
- [x] Complete launch loop receives browser verification.

### Codex session discovery

Codex CLI does not accept a predetermined session ID or write its rollout until
the first prompt. Novakai snapshots `CODEX_HOME/sessions`, launches with a real
terminal type and startup update checks disabled, then returns the interactive
PTY immediately. The first new `session_meta` matching the exact project `cwd`
becomes the agent session and is attached asynchronously. One launch request
owns discovery for each working directory. Timeouts keep the PTY available and
show the manual attachment fallback instead of guessing an identity.

### Phase 2 browser evidence

- Created `Phase 2 Browser Test` through visible controls.
- Created separate Claude and Codex threads.
- Launched both provider CLIs from their Start buttons.
- Sent prompts through Novakai's conversation composer.
- Observed both exact responses in unified timelines.
- Switched threads while Codex remained running.
- Opened the mounted Codex terminal after switching.
- Restarted the backend and restored Claude transcript history.
- Opened Transcript and manual attachment fallback successfully.

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
