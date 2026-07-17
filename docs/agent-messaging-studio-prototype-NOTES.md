# Agent messaging studio prototype

Question: how should agent messaging feel calm while preserving inspectable context,
hooks, subagent history, and team-tunnel messages?

- A — Inline folds: operational events remain inside chronology.
- B — Margin ledger: conversation stays clean; operations occupy a gutter.
- C — Agent ensemble: each lead response reveals contributors and exchanges.

Verdict: pending user review. Keep the existing Projects/Threads rail.

## Data provenance

- Main conversation: real Starforge transcript, 16–17 July 2026.
- Loaded evidence: 17 user turns, 70 agent updates, four screenshots.
- Build evidence: seven scenes, 1,939 nodes, 208.5 kB standalone.
- Validation evidence: zero external assets, seven-stage browser journey passed.
- Subagent examples: real completed HTML Builder architecture handoffs.
- Starforge itself spawned no subagents; the interface states this explicitly.

## Interaction contract

- Conversation remains primary; operational detail stays collapsed initially.
- Any response segment can be expanded, inspected, then replied-to directly.
- Inspection studio opens over 42% and separates trace, files, agents, messages.
- Context, hooks, files, output, references, and routes remain independently inspectable.
- Movement uses 700ms transitions; text disclosure uses 900ms transitions.
- No pills; controls and surfaces remain at eight-pixel radius or below.
- Human-facing agent routes use the Novakai sans stack, never terminal typography.
- Human-agent dialogue is always the centre surface and visibly chronological.
- Selecting a response shows its previous and next conversation messages.
- “Team” means agent-to-agent traffic; it never labels human-agent dialogue.
- Conversation copy is verbatim; interface summaries never impersonate transcript text.
- Long Codex messages retain original sections behind calm disclosure controls.
