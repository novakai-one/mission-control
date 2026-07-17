// Token-usage aggregation over parsed transcript events. The single source of
// truth for token totals — the frontend prices these, it never sums tokens.
import { statSync } from 'node:fs';
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

const usageCache = new Map<string, { fingerprint: string; usage: AgentUsage }>();

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

function cachedUsage(cacheKey: string, fingerprint: string, read: () => TranscriptEvent[]): AgentUsage {
  const cached = usageCache.get(cacheKey);
  if (cached?.fingerprint === fingerprint) return cached.usage;
  const usage = aggregateUsage(read());
  usageCache.set(cacheKey, { fingerprint, usage });
  return usage;
}

function subagentUsage(projectDir: string, sessionId: string, meta: ReturnType<typeof listSubagents>[number]): SubagentUsage {
  const cacheKey = `${projectDir}/${sessionId}/${meta.agentId}`;
  return {
    agentId: meta.agentId,
    agentType: meta.agentType,
    description: meta.description,
    toolUseId: meta.toolUseId,
    ...cachedUsage(cacheKey, `${meta.modified}:${meta.size}`, () => (
      readSubagent(projectDir, sessionId, meta.agentId) ?? []
    )),
  };
}

/** Aggregate a session's main transcript plus every subagent transcript (deduped per file). */
export function sessionUsage(mainFilePath: string, projectDir: string, sessionId: string): SessionUsage {
  const mainStat = statSync(mainFilePath);
  const main = cachedUsage(
    mainFilePath,
    `${mainStat.mtimeMs}:${mainStat.size}`,
    () => readSession(mainFilePath),
  );
  const subagents = listSubagents(projectDir, sessionId)
    .map((meta) => subagentUsage(projectDir, sessionId, meta));
  return { main, subagents };
}
