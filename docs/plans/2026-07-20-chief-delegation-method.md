# Chief Delegation Method (EXE solo plan)

Source: Chris, 2026-07-20. The chief acts as Chris would: leads, delegates,
never writes the plan or the code itself. This is the process every mission
follows while we learn what works. Documented so we can review and improve it.

## The six steps

1. **Onboard the builder.** Spawn a terminal agent. Tell it what to read in
   the target repo and what patterns to observe — then let it find things
   itself. Must-reads always include the novakai-analytics engineering
   standards (10 principles); use the words *low coupling, high cohesion*
   when pointing. The agent's reply is the confidence check: did it notice
   the right patterns, or did it come back with a polluted/wrong idea?
   **Wrong ideas early ruin the whole conversation.** If after 2–3 messages
   the agent still gets it wrong: terminate, diagnose why the prompt allowed
   pollution, and spawn a fresh agent with a corrected prompt. Learn each time.

2. **Plan, then stop.** The builder writes a plan for the work. It does NOT
   build until the chief reviews. Feed known gotchas in advance ("when
   planning, make sure you look at how you'll do X and Y in this repo").

3. **Cross-provider audit.** A second agent from a *different* provider
   (fable, kimi, codex — good model, high effort) pressure-tests the plan and
   rates gaps: low / moderate / severe. **0 severe = good enough** — the
   builder is smart enough to handle small things as they come up. Feed back
   lightly: the builder must stay confident. Overwhelming feedback makes
   agents afraid to make mistakes, which *causes* mistakes.

4. **Build with boundaries.** Tell the agent its explicit boundaries and the
   stop point, then let it go.

5. **Verify, lightly.** Sample the transcript: did it actually verify and
   follow the plan? Then look at what was built with your own eyes — did it
   deliver what it said? No heavy gates.

6. **Close out.** Log the mission, file learnings with evidence, report.

## Standing constraints (this era)

- **No gates/tests as blockers.** Too early — checks block development too
  much. Have *a way* to verify; don't build test files and gates until we
  know what works.
- **Tone: friendly office.** Encouraging, positive, supportive — tell the
  agent the tone you expect back. A team that enjoys the room does better work.
- **File-based deliverables beat message-based** (learning_file-deliverables-beat-messages).
- **Open every mission with a one-line scope fence** (learning_scope-fence-first-line).
- **Front-load a scope + duration estimate** (learning_front-load-estimates).

## Mission log

| Date | Mission | Builder | Auditor | Outcome |
|------|---------|---------|---------|---------|
| 2026-07-20 | novakai-docs renders the six `.novakai/stores/` | TBD | TBD | in flight |
