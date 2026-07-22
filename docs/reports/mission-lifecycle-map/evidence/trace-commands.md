# A4 — Exact commands per lifecycle stage (evidence trace)

Read-only evidence mining over completed mission packets under
`Novakai-Command/.novakai/work/`. Primary packet: `mission_mission-object-model`
(accepted 2026-07-23T00:06+10, PR #46). Secondary packets:
`mission_studio-tab-cleanup`, `mission_messages-tab-v1`, plus
`session-traces/session_b07173dc.../digest.md` for spawn-sequence corroboration.

All file:line citations are repo-relative from `.novakai/work/` unless a full
path is shown. Commands are quoted verbatim; nothing is paraphrased or
reconstructed.

## 1. Method

Run from `/Users/christopherdasca/Programming/Novakai-Command/.novakai/work`:

```bash
# Census pass 1 — broad invocation patterns
grep -rnE 'node scripts/|npm run|curl |scripts/nvk-|tools/browse|\.claude/browse|git |npx |nvk-msg|nvk-store|nvk-agent|nvk-live|POST /api|launchctl|lsof' \
  mission_mission-object-model/ mission_studio-tab-cleanup/ mission_messages-tab-v1/

# Census pass 2 — verb-level patterns
grep -rnE 'nvk-agent (spawn|send|tail|status|kill)|transition-task|nvk-store\.mjs [a-z]|browse (goto|click|shot|type|scroll)|curl -|stores:(gate|audit|test)|git (worktree|checkout|log|diff|commit|status)' \
  mission_mission-object-model/ mission_studio-tab-cleanup/ mission_messages-tab-v1/

# Onboarding/EXP corroboration
grep -nE 'nvk-msg|nvk-agent|spawn|send --from' \
  mission_studio-tab-cleanup/onboarding.md mission_studio-tab-cleanup/worker-onboarding.md \
  mission_messages-tab-v1/onboarding.md \
  mission_studio-tab-cleanup/EXP-2026-07-23-studio-tab-cleanup.md \
  mission_messages-tab-v1/EXP-2026-07-23-messages-tab-v1.md
```

Then full reads of the command-densest primary files: `result.md`, `plan.md`,
`final-audit.md`, `onboard-manager.md`, `onboard-worker.md`, `assign-worker.md`,
`build-authorization.md`, `audit-plan-brief.md`, `audit-final-brief.md`,
`correction-round-1.md`, `evidence/self-verification.md`,
`evidence/containment.log`, `EXP-2026-07-22-object-model-breadth.md`; plus
`mission_messages-tab-v1/plan.md` (sections 4, 8, 9),
`mission_studio-tab-cleanup/evidence/gate-*.txt`, and the session-trace digest.

## 2. Command census

Legend for packet column: **OM** = mission_mission-object-model,
**STC** = mission_studio-tab-cleanup, **MT** = mission_messages-tab-v1.

| # | Exact command (verbatim) | Lifecycle stage | Source (file:line) | Packet |
|---|---|---|---|---|
| 1 | `$compile-mission-brief` (skill invocation, not a shell command) | Mission filing / Contract compilation | mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md:90 | OM |
| 2 | `scripts/nvk-agent.mjs` (spawn path; "agents spawned via `scripts/nvk-agent.mjs`; messages via nvk-agent send / nvk-msg" — no full spawn invocation with arguments appears anywhere in the packet) | Spawn / create | mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md:71 | OM |
| 3 | `node scripts/nvk-msg.mjs send --from "Worker Opus ObjectModel" --to "Manager Kimi ObjectModel" "..."` | Onboarding (Worker read-back reply) | mission_mission-object-model/onboard-worker.md:31 | OM |
| 4 | `node scripts/nvk-msg.mjs send --from "Auditor Codex Plan" --to "Manager Kimi ObjectModel" "..."` | Verification (plan-audit report-back) | mission_mission-object-model/audit-plan-brief.md:49 | OM |
| 5 | `node scripts/nvk-msg.mjs send --from "Auditor Codex Final" --to "Manager Kimi ObjectModel" "..."` | Verification (final-audit report-back) | mission_mission-object-model/audit-final-brief.md:57 | OM |
| 6 | `nvk-agent send` (verb only; observed to crash on multi-line bodies) | Messaging during build | mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md:98 | OM |
| 7 | `nvk-agent tail` (verb only; Manager's stage-boundary monitoring evidence) | Messaging / oversight during build | mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md:99, 105, 107 | OM |
| 8 | `nvk-agent status` (verb only; Worker liveness/watchdog checks) | Oversight during build | mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md:109, 117, 146 | OM |
| 9 | `npm run stores:gate` | Verification (store integrity gate) | mission_mission-object-model/brief.md:13; assign-worker.md:39 | OM |
| 10 | `npm run stores:test` | Verification (test gate) | mission_mission-object-model/final-audit.md:14; audit-final-brief.md:25 | OM |
| 11 | `npx tsx src/backend/server/tests/missionSpawn.test.ts` | Verification (focused test) | mission_mission-object-model/final-audit.md:15 | OM |
| 12 | `npx tsx src/backend/messaging/tests/deliveryStateMachine.test.ts` | Verification (focused test) | mission_mission-object-model/final-audit.md:16 | OM |
| 13 | `npx tsx src/frontend/components/workspace/messages/tests/restore.test.ts` | Verification (focused test) | mission_mission-object-model/final-audit.md:17 | OM |
| 14 | `npx tsx src/backend/missionView/tree/index.test.ts` | Verification (focused test) | mission_mission-object-model/final-audit.md:18 | OM |
| 15 | `npx tsx src/backend/missionView/snapshot/index.test.ts` | Verification (focused test) | mission_mission-object-model/final-audit.md:19 | OM |
| 16 | `npx tsc --noEmit` | Verification (typecheck gate) | mission_mission-object-model/final-audit.md:20; audit-final-brief.md:27 | OM |
| 17 | `node tools/gates/stores.mjs --dir /Users/christopherdasca/Programming/Novakai-Command/.novakai/stores --baseline /Users/christopherdasca/Programming/Novakai-Command/stores-baseline.json` | Verification (new gate code vs canonical stores) | mission_mission-object-model/audit-final-brief.md:28-29 | OM |
| 18 | `git diff --check 286f143a..HEAD` | Verification (diff hygiene) | mission_mission-object-model/final-audit.md:23 | OM |
| 19 | `git log/diff 286f143a..HEAD` (as written in the brief) | Verification (diff-vs-claims check) | mission_mission-object-model/audit-final-brief.md:22 | OM |
| 20 | `npm run lint` | Verification (standards gate, DEC-2026-07-20-001) | mission_mission-object-model/final-audit.md:32, 109; correction-round-1.md:47; evidence/self-verification.md:133 | OM |
| 21 | `npm run build` | Verification (build gate) | mission_mission-object-model/evidence/self-verification.md:72 | OM |
| 22 | `stores:audit` (npm script name as cited) | Verification (findings census, baseline honesty) | mission_mission-object-model/plan.md:281; plan-audit.md:24-25 | OM |
| 23 | `npx tsx` per test file (house test style, named as such) | Verification | mission_mission-object-model/plan.md:284 | OM |
| 24 | `tools/browse` isolated engine with `NVK_SESSION` set (verbs; rig detail `NVK_SESSION=objectmodel-worker, rig backend 3250/3251`) | Verification (real-browser drive) | mission_mission-object-model/plan.md:298-301; evidence/containment.log:9 | OM |
| 25 | `cd <canonical> && touch .novakai/stores/{teams,agents,artifacts,threads}.jsonl` (deploy note; later WITHDRAWN by correction C1) | Store provisioning (proposed manual step) | mission_mission-object-model/evidence/self-verification.md:95, 115 | OM |
| 26 | `gh pr view 46` | Close-out (Chief acceptance verification) | mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md:124 | OM |
| 27 | `git status` (as "worktree git status", Chief watchdog check) | Oversight during build | mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md:109 | OM |
| 28 | `git log` (Worker stop-point evidence) | Build / stage boundary | mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md:117 | OM |
| 29 | Dedicated `git worktree` from recorded base SHA (house norm; exact `git worktree add` invocation not shown) | Build workspace creation | mission_mission-object-model/plan.md:14; plan-rulings.md:77; build-authorization.md:10-13 | OM |
| 30 | `GET /api/agents/:id/identity` (HTTP, confirmation projection) | Verification (spawn confirmation) | mission_mission-object-model/result.md:41; EXP:113 | OM |
| 31 | drill agents "killed via API" (endpoint not spelled in OM packet; see #40 for the MT verbatim) | Kill / teardown (drill scope) | mission_mission-object-model/evidence/containment.log:25 | OM |
| 32 | sha256 hashes of 9-14 canonical files before/after drills (hash lines only; the generating command is not shown in the packet) | Verification (containment proof) | mission_mission-object-model/evidence/containment.log:11-66 | OM |
| 33 | `npx tsx src/backend/stores/validate.test.mjs && npx tsx src/backend/stores/objectmodel.test.mjs && npx tsx src/backend/stores/transition.test.mjs && npx tsx src/backend/stores/store.test.mjs && npx tsx src/backend/stores/cli.test.mjs && npx tsx tools/gates/stores.test.mjs` (expansion of `stores:test`) | Verification | mission_studio-tab-cleanup/evidence/gate-tests.txt:3 | STC |
| 34 | `node tools/gates/standards.mjs` (expansion of `npm run lint`) | Verification | mission_studio-tab-cleanup/evidence/gate-lint.txt:3 | STC |
| 35 | `npm run lint -- --update` (ratchet-down hint printed by the gate) | Verification (gate tooling output) | mission_studio-tab-cleanup/evidence/gate-lint.txt:6 | STC |
| 36 | `NOVAKAI_SERVER_PORT=3231 NOVAKAI_TERMINAL_RUNTIME=host npx tsx src/backend/index.ts   # scratch backend` | Verification (scratch rig bring-up) | mission_messages-tab-v1/plan.md:68 | MT |
| 37 | `NOVAKAI_SERVER_PORT=3231 npx vite --port 3230 --strictPort --host                      # scratch frontend` | Verification (scratch rig bring-up) | mission_messages-tab-v1/plan.md:69 | MT |
| 38 | `tools/browse goto http://localhost:3230` (then verbs: `goto/click/type/press/text/eval/shot/release — scroll via` `eval scrollBy`) | Verification (browser drive) | mission_messages-tab-v1/plan.md:74-75 | MT |
| 39 | `POST /api/agents` (spawn path; accepts `{provider?, title?}`) | Spawn / create | mission_messages-tab-v1/plan.md:18, 39, 47; brief.md:11 | MT |
| 40 | `POST /api/agents/:id/kill` | Kill / teardown | mission_messages-tab-v1/plan.md:367 | MT |
| 41 | `lsof -i :3231 -i :3230` (port-scoped teardown check; "No broad pkill") | Kill / teardown verification | mission_messages-tab-v1/plan.md:368-369 | MT |
| 42 | `lsof -ti tcp:3231 -sTCP:LISTEN` (recorded fix for `lsof -ti :3231` also matching non-listeners) | Kill / teardown verification | mission_messages-tab-v1/evidence/before/NOTES.md:17-19 | MT |
| 43 | curl "to 3231" for gap-commit actions; `curl 3131 vs 3031` (registry visibility check) | Verification / oversight | mission_messages-tab-v1/plan.md:354; EXP-2026-07-23-messages-tab-v1.md:84 | MT |
| 44 | loop `nvk-msg send` (seeding >200 lanes; also real agent-to-agent exchange proof) | Verification (drill seeding) | mission_messages-tab-v1/plan.md:320, 335 | MT |
| 45 | `git diff --stat` (file-fence check) | Verification | mission_messages-tab-v1/plan.md:382 | MT |
| 46 | `lsof` cwd check (Chief acceptance re-drive; also `cd X && cmd &` shell-bug root cause) | Verification / close-out | mission_studio-tab-cleanup/EXP-2026-07-23-studio-tab-cleanup.md:83, 105 | STC |
| 47 | `/api/missions/active/snapshot` (HTTP, correction C4) | Verification | mission_mission-object-model/evidence/self-verification.md:128 | OM |

## 3. Stage sequence — mission_mission-object-model

Timeline reconstructed from the EXP DURING table
(mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md, cited as
EXP:line below) plus the packet files. Issuer named where the packet says.

1. **Origin (Chris, 19:47+10).** First direction captured as `source.md`
   (EXP:89). No command trail — the direction is a document.
2. **Contract compilation (Chief, 19:55+10).** "`$compile-mission-brief`
   invoked; Contract written" (EXP:90) — a skill invocation, not a shell
   command; output is `brief.md`.
3. **Mission filing (Chief, 20:05+10).** "Mission recorded in store" with
   evidence "missions.jsonl `mission_mission-object-model`" (EXP:91). No
   verbatim store-write command appears; the store facade is the sanctioned
   path (assign-worker.md:30-32) but the invocation is not shown.
4. **Contract amendments (Chris, 20:06+10).** Pre-build amendments 1-4 land in
   brief.md (EXP:92-93). Document edits; no command trail.
5. **Manager spawn (Chief, 20:10+10).** "Manager spawned; provider confirmed
   kimi; brief delivery confirmed (1.9s)"; evidence "nvk-agent spawn receipt;
   session_5dacb32b" (EXP:94). The spawn tool is named as
   `scripts/nvk-agent.mjs` (EXP:71) but no full spawn command with arguments
   is recorded anywhere in the packet.
6. **Manager onboarding (Chief → Manager).** Onboarding text is
   `onboard-manager.md` (reading list: START-HERE.md, MANAGER.md, AGENTS.md,
   CONTEXT.md; read-back under 250 words). Read-back PASS at EXP:95
   (evidence msg_f6b915e3). The reply channel command is not printed in
   onboard-manager.md (unlike the Worker/Auditor briefs).
7. **Stage-1 restatement + rulings (Manager 20:09Z, Chief 20:12+10).**
   msg_105d3c9c; Chief PASS via live_aa78dda7 (EXP:96-97). During this window
   the Chief observed "`nvk-agent.mjs send` crashed (Node stack trace) on
   multi-line message body; single-line resend succeeded" (EXP:98).
8. **Worker spawn + onboarding (Manager, by 20:30+10).** Worker onboarded via
   `onboard-worker.md`, whose reply line is verbatim:
   `node scripts/nvk-msg.mjs send --from "Worker Opus ObjectModel" --to "Manager Kimi ObjectModel" "..."`
   (onboard-worker.md:31). Read-back PASS; assignment issued as
   `assign-worker.md` (EXP:99). The Worker's own spawn command is not
   recorded.
9. **Assignment (Manager).** assign-worker.md names the acceptance gate
   command verbatim: "`npm run stores:gate` passes" (assign-worker.md:39) and
   orders: write plan.md and STOP (assign-worker.md:56-58).
10. **Plan (Worker) → plan audit (Auditor Codex Plan).** Audit commissioned
    with `audit-plan-brief.md`; its report-back channel is verbatim:
    `node scripts/nvk-msg.mjs send --from "Auditor Codex Plan" --to "Manager Kimi ObjectModel" "..."`
    (audit-plan-brief.md:49). Result: 8 SEVERE / 5 MOD / 2 LOW, ruled in
    plan-rulings.md (EXP:102); Chief spot-check adds the AGENTS.md thread-law
    named check (EXP:103).
11. **Build authorization (Manager, 21:00+10).** One authorization
    (build-authorization.md): "dedicated worktree from a recorded base SHA...
    branch `feat/mission-object-model`" (build-authorization.md:10-13). The
    worktree's actual creation is evidenced by containment.log:1-4 (base SHA
    `286f143a1c3eff0b392d9f165ae0ccbeae7cc9ca`, worktree
    `/Users/christopherdasca/Programming/Novakai-Command-object-model`,
    created 2026-07-22T10:52:15Z) — the `git worktree add` command itself is
    not shown.
12. **Build stages 0-5 (Worker) with stage-boundary verification (Manager).**
    Manager evidence at each boundary is "nvk-agent tail" / "nvk-agent
    status" (EXP:107, 113, 115, 117) — verbs only, no full invocations.
    Worker verification commands during build (evidence/self-verification.md):
    `npm run build` clean, stores:test green (line 72-73), `stores:audit` 59
    findings before/after (line 74-75), 25 suites via `npx tsx` house style
    (plan.md:284), browser drives via the `tools/browse` isolated engine with
    `NVK_SESSION=objectmodel-worker` on rig 3250/3251 (containment.log:9),
    amber DOM assertion via eval (containment.log:10), sha256 before/after
    checksums (containment.log:11-36).
13. **Mid-build oversight (Chief, 22:05+10).** Watchdog stall check used
    "nvk-agent status; worktree git status" as evidence (EXP:109); recovery
    by Manager nudge (EXP:146).
14. **Worker stop point (23:05+10).** "Worker stopped at authorized stop
    point"; evidence "nvk-agent status; git log" (EXP:117).
15. **Manager independent verification (23:05+10).** "ran stores:test chain,
    missionSpawn, restore, deliveryStateMachine, tree/snapshot, tsc, lint,
    and the canonical gate with branch code" (result.md:65-69).
16. **Final audit (Auditor Codex Final).** Commissioned via
    `audit-final-brief.md`, which mandates the verbatim commands: `npm run
    stores:test`; the four focused test files via `npx tsx <path>`; `npx tsc
    --noEmit` (audit-final-brief.md:25-27); the gate as
    `node tools/gates/stores.mjs --dir /Users/christopherdasca/Programming/Novakai-Command/.novakai/stores --baseline /Users/christopherdasca/Programming/Novakai-Command/stores-baseline.json`
    (audit-final-brief.md:28-29); `git log/diff 286f143a..HEAD`
    (audit-final-brief.md:22); report-back via
    `node scripts/nvk-msg.mjs send --from "Auditor Codex Final" --to "Manager Kimi ObjectModel" "..."`
    (audit-final-brief.md:57). The audit records what it actually ran,
    including `git diff --check 286f143a..HEAD` (final-audit.md:14-23) and
    the failing `npm run lint` (final-audit.md:32).
17. **Correction round 1 (Manager → Worker, 23:10-23:40+10).**
    correction-round-1.md; C5 re-runs `npm run lint` to baseline
    (correction-round-1.md:47; closed at 189 ≤ 201,
    self-verification.md:133). M4 extends containment checksums to 14 files
    (containment.log:37-76). Worker stops at commit 7fcca756 (EXP:122).
18. **Kill / teardown (drill scope only).** "teardown: drill agents killed
    via API, rig backend + my host down, other lanes' hosts untouched"
    (containment.log:25). No endpoint or command is spelled in the OM packet.
19. **Close-out (Manager, then Chief, 23:49 → 00:06+10).** Manager files
    `result.md`. Chief acceptance evidence: "gh pr view 46; stores:gate; test
    runs; result.md" (EXP:124); captains-log record
    `log_2026-07-23-object-model-accepted` and "5 follow-up issues filed"
    (EXP:124) — no store-write commands shown. The Worker also prepared a
    captains-log JSON line for the Manager to append "through the facade"
    (self-verification.md:97-100; result.md:32-33) — the append command
    itself is not shown. EXP AAR written; Process review section left
    Pending (EXP:192-197).

## 4. Corroboration

- **`node scripts/nvk-msg.mjs send --from "..." --to "..." "..."`** — three
  verbatim instances in OM (onboard-worker.md:31, audit-plan-brief.md:49,
  audit-final-brief.md:57). Secondary packets reference `nvk-msg send` in
  drill plans (mission_messages-tab-v1/plan.md:320, 335) but their onboarding
  files (mission_studio-tab-cleanup/onboarding.md, worker-onboarding.md;
  mission_messages-tab-v1/onboarding.md) do not print a reply-channel
  command.
- **`npm run stores:gate` / stores gate family** — OM (brief.md:13,
  assign-worker.md:39); corroborated by mission_studio-tab-cleanup evidence
  outputs (`stores:test` expansion at evidence/gate-tests.txt:3, exit 0 at
  :31).
- **`npm run lint` (standards ratchet)** — OM (final-audit.md:32);
  corroborated at mission_studio-tab-cleanup/evidence/gate-lint.txt:3-7
  (`node tools/gates/standards.mjs`, "PASS: 189 < baseline 201") and
  mission_messages-tab-v1/plan.md:310.
- **`npx tsx <test file>` per-file tests** — OM (final-audit.md:15-19);
  corroborated at mission_studio-tab-cleanup/evidence/gate-tests.txt:3 and
  mission_messages-tab-v1/plan.md:283, 381.
- **`npx tsc --noEmit`** — OM (final-audit.md:20); corroborated at
  mission_messages-tab-v1/plan.md:21 and
  mission_studio-tab-cleanup/evidence/gate-tsc.txt:1 (`tsc --noEmit exit: 0`).
- **`npm run build`** — OM (self-verification.md:72); corroborated at
  mission_studio-tab-cleanup/evidence/gate-build.txt (exit 0) and
  brief.md:14.
- **`tools/browse` + `NVK_SESSION` browser drives** — OM (plan.md:298-301,
  containment.log:9); corroborated verbatim at
  mission_messages-tab-v1/plan.md:74-75 (`tools/browse goto
  http://localhost:3230`) and mission_studio-tab-cleanup/plan.md:38.
- **Scratch-rig bring-up (`NOVAKAI_SERVER_PORT=... npx tsx
  src/backend/index.ts` + `npx vite --port ...`)** — verbatim only in
  mission_messages-tab-v1/plan.md:68-69; OM records the same pattern
  descriptively as "rig backend 3250/3251 with all mutable roots injected"
  (containment.log:9).
- **Agent spawn via `scripts/nvk-agent.mjs` / `POST /api/agents`** — OM
  names the script (EXP:71) and cites "nvk-agent spawn receipt" (EXP:94);
  corroborated by mission_messages-tab-v1/plan.md:18, 39, 47 (`POST
  /api/agents`) and by the session-trace digest's repeated
  "Manager ... spawned · agents.json:NNNN" rows
  (session-traces/session_b07173dc-0d0a-4e6f-9869-f959ed6804f4/digest.md,
  e.g. 08:20, 08:26, 10:18, 10:27 rows). No packet contains a full verbatim
  spawn invocation.
- **Kill via API + port-scoped lsof teardown** — OM descriptive
  (containment.log:25); verbatim endpoint and checks in
  mission_messages-tab-v1/plan.md:367-369 (`POST /api/agents/:id/kill`,
  `lsof -i :3231 -i :3230`) and evidence/before/NOTES.md:17-19
  (`lsof -ti tcp:3231 -sTCP:LISTEN`).
- **`gh pr view 46`** — OM only (EXP:124). mission_studio-tab-cleanup and
  mission_messages-tab-v1 packets reference PR delivery in prose but show no
  `gh` command.

## 5. Stages with no command trail

Marked strictly: "no command trail observed in packet" means no verbatim shell
invocation appears; the stage may still be evidenced by documents or store
records.

- **Mission filing / store record creation** — "Mission recorded in store"
  (EXP:91) cites missions.jsonl but no facade/CLI invocation. No
  `nvk-store.mjs append` (or equivalent) command trail observed in any of the
  three packets.
- **Agent spawn (full invocation)** — the tool (`scripts/nvk-agent.mjs`) and
  the receipt are cited (EXP:71, 94), but no complete spawn command with
  arguments is observed in any packet.
- **Onboarding message delivery (Chief → Manager)** — onboard-manager.md
  contains no reply/delivery command (the Worker and Auditor briefs do).
- **Task transitions** — no `nvk-store transition-task` (or any
  transition-verb CLI invocation) observed in any packet, in either the
  primary or secondary missions. The OM mission *built* a transition writer
  (plan.md:99-120) but its own task tracking shows no CLI transition trail.
- **Store writes at close-out** — captains-log records
  (`log_2026-07-23-object-model-accepted`, EXP:124;
  `log_2026-07-22-transition-writer`, result.md:32-33) and "5 follow-up
  issues filed" are asserted with store ids as evidence; no append command
  observed. The Worker's prepared captains-log line is given as a JSON
  literal for the Manager to append (self-verification.md:100), command
  unstated.
- **Kill/retire of the mission team itself (Manager, Worker, Auditors)** —
  drill-agent teardown is trailed (containment.log:25), but no kill/retire
  command for the mission's own Manager/Worker/Auditor sessions appears in
  any packet.
- **Worktree creation** — base SHA, path, branch, and creation timestamp are
  recorded (containment.log:1-4); the `git worktree add` invocation is not.
- **Checksum generation** — sha256 hash lines are recorded
  (containment.log:11-66) without the generating command.
- **PR creation** — PR #46 existence is verified (`gh pr view 46`, EXP:124);
  the command that opened the PR is not observed. mission_messages-tab-v1
  plan defers PR opening to Manager instruction (plan.md:384), also without
  a command.

## 6. Observed drift notes

Neutral observations of command behavior the packets record as unexpected,
tool-vs-manual divergence, or environment-dependent variation.

- Observed `nvk-agent.mjs send` crash (Node stack trace) on a multi-line
  message body at EXP:98; single-line resend succeeded; filed as
  `issue_nvk-agent-multiline-send-crash` (EXP:145).
- Observed scratch drill agent replying "via scripts/nvk-msg.mjs, whose
  default port is the canonical 3031 (known repo gotcha) instead of the rig's
  3251 quoted in its briefing" at containment.log:70-73; one DM plus two
  watchdog posts landed in the canonical messages journal (13/14 containment
  files byte-identical, containment.log:67); filed as
  `issue_nvk-msg-default-port-footgun` (EXP:147); result.md:85-90 suggests a
  process note or issue on the default-port footgun.
- Observed a proposed manual store-adoption step
  (`cd <canonical> && touch .novakai/stores/{teams,agents,artifacts,threads}.jsonl`,
  self-verification.md:95) that final-audit S1 (final-audit.md:37-53)
  classified as an unshipped prerequisite; withdrawn after correction C1
  (self-verification.md:111-115) in favor of provisioning at composition.
- Observed a non-routable sender alias `nvk-agent-spawn` flagged during
  Manager onboarding read-back at EXP:95.
- Observed Worker spawned on the DEV backend (3131) rather than Live, so
  "Chief oversight tools (3031-default) cannot see the Worker" at
  mission_messages-tab-v1/EXP-2026-07-23-messages-tab-v1.md:84; recorded as
  "deviation (lane interpretation) — noted".
- Observed a Chief shell interaction where `cd X && cmd &` backgrounded the
  cd so vite served the main checkout instead of the worktree, producing a
  contradictory first acceptance drive at
  mission_studio-tab-cleanup/EXP-2026-07-23-studio-tab-cleanup.md:83;
  reconciled via an lsof process-cwd check (same file:105).
- Observed a Worker probe-spawn failure attributed to a bogus cwd at
  mission_studio-tab-cleanup/EXP-2026-07-23-studio-tab-cleanup.md:106;
  self-corrected.
- Observed `lsof -ti :3231` matching non-listening processes; the packet
  records `lsof -ti tcp:3231 -sTCP:LISTEN` as the corrected teardown check
  at mission_messages-tab-v1/evidence/before/NOTES.md:17-19.
- Observed that Manager oversight evidence is consistently cited at verb
  level ("nvk-agent tail", "nvk-agent status") rather than as full
  invocations (EXP:99, 107, 109, 113, 115, 117) — the packets audit outcomes,
  not command lines, for the messaging/oversight stages.
