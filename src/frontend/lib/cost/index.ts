// Pricing over backend-aggregated token totals. Tokens are summed backend-side
// (/api/usage); this module only converts them to money.
import { useState } from 'react';

export interface TokenTotals {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
  requests: number;
}

export type ModelTotals = Record<string, TokenTotals>;

export interface AgentUsage {
  perModel: ModelTotals;
  /** Provider-applied model from the newest usage-bearing transcript event. */
  latestModel?: string | null;
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

export interface ModelPrice {
  inputPerMTok: number;   // USD per million uncached input tokens
  outputPerMTok: number;  // USD per million output tokens
}

export interface CostSettings {
  currency: 'USD' | 'AUD';
  usdToAud: number;
  prices: Record<string, ModelPrice>; // keyed by model-id prefix
}

// Fixed assumptions (Anthropic pricing structure): cache reads bill at 0.1x
// input, cache writes at 1.25x (5m TTL) / 2x (1h TTL). Long-context premiums ignored.
export const CACHE_READ_MULT = 0.1;
export const CACHE_WRITE_5M_MULT = 1.25;
export const CACHE_WRITE_1H_MULT = 2.0;

/** USD per MTok by model-id prefix; longest matching prefix wins. */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'claude-fable': { inputPerMTok: 10, outputPerMTok: 50 },
  'claude-mythos': { inputPerMTok: 10, outputPerMTok: 50 },
  'claude-opus': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku': { inputPerMTok: 1, outputPerMTok: 5 },
};

export const DEFAULT_SETTINGS: CostSettings = { currency: 'USD', usdToAud: 1.52, prices: DEFAULT_PRICES };

/** Longest matching price prefix; unknown models priced at Opus rates (stated assumption in the UI). */
export function priceFor(model: string, prices: Record<string, ModelPrice>): ModelPrice {
  let best: ModelPrice | null = null;
  let bestLen = -1;
  for (const [prefix, price] of Object.entries(prices)) {
    if (model.startsWith(prefix) && prefix.length > bestLen) {
      best = price;
      bestLen = prefix.length;
    }
  }
  return best ?? prices['claude-opus'] ?? { inputPerMTok: 5, outputPerMTok: 25 };
}

/** Cost in the settings currency for one model's token totals. */
export function costOfModel(model: string, totals: TokenTotals, settings: CostSettings): number {
  const price = priceFor(model, settings.prices);
  const usdCost = (
    totals.input * price.inputPerMTok
    + totals.cacheWrite5m * price.inputPerMTok * CACHE_WRITE_5M_MULT
    + totals.cacheWrite1h * price.inputPerMTok * CACHE_WRITE_1H_MULT
    + totals.cacheRead * price.inputPerMTok * CACHE_READ_MULT
    + totals.output * price.outputPerMTok
  ) / 1_000_000;
  return settings.currency === 'AUD' ? usdCost * settings.usdToAud : usdCost;
}

export function costOf(usage: AgentUsage, settings: CostSettings): number {
  return Object.entries(usage.perModel)
    .reduce((total, [model, totals]) => total + costOfModel(model, totals, settings), 0);
}

export function tokensOf(usage: AgentUsage): number {
  return Object.values(usage.perModel).reduce(
    (total, tokens) => total + tokens.input + tokens.cacheWrite5m + tokens.cacheWrite1h + tokens.cacheRead + tokens.output, 0);
}

export function sessionCost(usage: SessionUsage, settings: CostSettings): number {
  return costOf(usage.main, settings) + usage.subagents.reduce((total, subagent) => total + costOf(subagent, settings), 0);
}

export function sessionTokens(usage: SessionUsage): number {
  return tokensOf(usage.main) + usage.subagents.reduce((total, subagent) => total + tokensOf(subagent), 0);
}

/** Fetch /api/usage; null on HTTP errors (404 until the transcript file exists) or a non-SessionUsage body. */
export async function fetchUsage(projectDir: string, sessionId: string): Promise<SessionUsage | null> {
  const response = await fetch(`/api/usage?project=${encodeURIComponent(projectDir)}&session=${encodeURIComponent(sessionId)}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data?.main?.perModel
    && (data.main.latestModel === undefined || typeof data.main.latestModel === 'string' || data.main.latestModel === null)
    && Array.isArray(data.subagents)
    ? data as SessionUsage
    : null;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
}

export function formatCost(amount: number, currency: 'USD' | 'AUD'): string {
  const symbol = currency === 'AUD' ? 'A$' : '$';
  return `${symbol}${amount >= 100 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

const SETTINGS_KEY = 'mc-cost-settings';

export function loadCostSettings(): CostSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '');
    if (parsed && (parsed.currency === 'USD' || parsed.currency === 'AUD') && typeof parsed.usdToAud === 'number') {
      return { ...DEFAULT_SETTINGS, ...parsed, prices: { ...DEFAULT_PRICES, ...(parsed.prices || {}) } };
    }
  } catch {
    // malformed/absent -> defaults
  }
  return DEFAULT_SETTINGS;
}

export function useCostSettings(): [CostSettings, (next: CostSettings) => void] {
  const [settings, setSettings] = useState<CostSettings>(loadCostSettings);
  function update(next: CostSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setSettings(next);
  }
  return [settings, update];
}
