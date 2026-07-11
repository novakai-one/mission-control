// Token-usage aggregation over parsed transcript events. The single source of
// truth for token totals — the frontend prices these, it never sums tokens.
import { listSubagents, readSession, readSubagent, type TokenUsage, type TranscriptEvent } from '../parser.js';

export type ModelTotals = Record<string, TokenUsage & { requests: number }>;

export interface AgentUsage {
  perModel: ModelTotals;
}

export interface SubagentUsage extends AgentUsage {
  agentId: string;
  agentType: string;
  description: string;
  toolUseId: string;
}

export interface SessionUsage {
  main: AgentUsage;
  subagents: SubagentUsage[];
}

/**
 * Sum usage events per model, deduped by msgId within this event list: one API
 * message.id appears on multiple JSONL lines with identical usage (~half of
 * all usage lines) — last occurrence wins.
 */
export function aggregateUsage(events: TranscriptEvent[]): AgentUsage {
  const byMsg = new Map<string, { model: string; usage: TokenUsage }>();
  for (const event of events) {
    if (event.kind === 'usage') byMsg.set(event.msgId, { model: event.model, usage: event.usage });
  }
  const perModel: ModelTotals = {};
  for (const { model, usage } of byMsg.values()) {
    const totals = perModel[model] ?? (perModel[model] = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, requests: 0 });
    totals.input += usage.input;
    totals.cacheWrite5m += usage.cacheWrite5m;
    totals.cacheWrite1h += usage.cacheWrite1h;
    totals.cacheRead += usage.cacheRead;
    totals.output += usage.output;
    totals.requests += 1;
  }
  return { perModel };
}

/** Aggregate a session's main transcript plus every subagent transcript (deduped per file). */
export function sessionUsage(mainFilePath: string, projectDir: string, sessionId: string): SessionUsage {
  const main = aggregateUsage(readSession(mainFilePath));
  const subagents = listSubagents(projectDir, sessionId).map((meta) => ({
    agentId: meta.agentId,
    agentType: meta.agentType,
    description: meta.description,
    toolUseId: meta.toolUseId,
    ...aggregateUsage(readSubagent(projectDir, sessionId, meta.agentId) ?? []),
  }));
  return { main, subagents };
}
