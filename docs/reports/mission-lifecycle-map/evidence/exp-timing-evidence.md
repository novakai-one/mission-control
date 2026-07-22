# A7 evidence — where the EXP v2 timing confusion lives

Method (re-runnable):
`grep -n "EXP" docs/operations/CHIEF.md docs/operations/MANAGER.md docs/operations/MISSION-PACKET.md docs/operations/START-HERE.md docs/operations/prompts/*.md`
and `grep -n "BEFORE" docs/operations/trials/EXP-TEMPLATE-v2.md` plus the two
real EXP files under `.novakai/work/`.

## The template is already correct

- `docs/operations/trials/EXP-TEMPLATE-v2.md:9` — "records predictions before
  work, observations during work"
- `docs/operations/trials/EXP-TEMPLATE-v2.md:13` — "Do not rewrite BEFORE
  sections after execution begins."

## The operating chain only ever mentions the EXP at the END

Every reference to the EXP in the role docs is about finishing it:

- `docs/operations/START-HERE.md:101` — loop step 9: "The Chief finishes the
  EXP AAR" — steps 1–8 (direction → compile → packet → spawn → assign → run →
  verify → accept) never mention creating it.
- `docs/operations/CHIEF.md:263` — offboarding: "Finish the EXP AAR without
  rewriting its original predictions."
- `docs/operations/prompts/OFFBOARD-CHIEF.md:19` — same, at offboard time.

No document in `docs/operations/` instructs creating the EXP and filling its
BEFORE sections when the mission packet is created. A Chief following the
manual first meets the EXP at close-out — after the work.

## Observed consequence in a real mission

- `.novakai/work/mission_mission-object-model/EXP-2026-07-22-object-model-breadth.md:100`
  — deviation log: "EXP v2 template provided late (his note); asked that it
  be written now; hypothesis set BEFORE build authorization" (2026-07-22,
  Chris). The BEFORE sections were filled mid-mission because nothing in the
  operating chain scheduled them earlier.

## Fix target (CH4)

Add EXP creation (with BEFORE sections) to the packet-creation stage of the
operating loop — `docs/operations/START-HERE.md` step 3 and the matching
CHIEF.md mission-start section — so BEFORE timing is scheduled by the chain,
not left to memory. Wording change only; template untouched beyond, at most,
one clarifying line.
