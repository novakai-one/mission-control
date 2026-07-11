// Run with `npx tsx src/frontend/lib/cost/cost.test.ts`.
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, costOfModel, fetchUsage, formatCost, formatTokens, priceFor, sessionCost, sessionTokens, type SessionUsage } from './index.js';

// Prefix pricing: longest match wins; unknown models fall back to Opus rates.
assert.equal(priceFor('claude-fable-5', DEFAULT_SETTINGS.prices).inputPerMTok, 10);
assert.equal(priceFor('claude-sonnet-4-6', DEFAULT_SETTINGS.prices).outputPerMTok, 15);
assert.equal(priceFor('experimental-model', DEFAULT_SETTINGS.prices).inputPerMTok, 5);

// Cost math: fresh input at 1x, cache write 1.25x/2x, cache read 0.1x, output at output price.
const totals = { input: 1_000_000, cacheWrite5m: 1_000_000, cacheWrite1h: 1_000_000, cacheRead: 1_000_000, output: 1_000_000, requests: 3 };
const usdCost = costOfModel('claude-opus-4-8', totals, DEFAULT_SETTINGS);
// 5 + 5*1.25 + 5*2 + 5*0.1 + 25 = 46.75
assert.ok(Math.abs(usdCost - 46.75) < 1e-9, `expected 46.75, got ${usdCost}`);

// Currency conversion applies the FX rate.
const audCost = costOfModel('claude-opus-4-8', totals, { ...DEFAULT_SETTINGS, currency: 'AUD', usdToAud: 2 });
assert.ok(Math.abs(audCost - 93.5) < 1e-9);

// Session rollup includes subagents.
const session: SessionUsage = {
  main: { perModel: { 'claude-fable-5': { ...totals } } },
  subagents: [{ agentId: 'agent-a1', agentType: 'Explore', description: 'x', toolUseId: 't1', perModel: { 'claude-haiku-4-5': { ...totals } } }],
};
assert.equal(sessionTokens(session), 10_000_000);
// fable: 10 + 12.5 + 20 + 1 + 50 = 93.5; haiku: 1 + 1.25 + 2 + 0.1 + 5 = 9.35
assert.ok(Math.abs(sessionCost(session, DEFAULT_SETTINGS) - 102.85) < 1e-9);

assert.equal(formatTokens(1_234_000), '1.23M');
assert.equal(formatTokens(12_340), '12.3k');
assert.equal(formatCost(1.234, 'USD'), '$1.23');
assert.equal(formatCost(123.4, 'AUD'), 'A$123');

// fetchUsage: 404 and non-SessionUsage bodies resolve to null instead of leaking into state.
const fetchStub = (ok: boolean, body: unknown) => async () => ({ ok, json: async () => body }) as Response;
globalThis.fetch = fetchStub(false, { error: 'Session not found' }) as typeof fetch;
assert.equal(await fetchUsage('-proj', 's1'), null);
globalThis.fetch = fetchStub(true, { error: 'weird 200' }) as typeof fetch;
assert.equal(await fetchUsage('-proj', 's1'), null);
globalThis.fetch = fetchStub(true, session) as typeof fetch;
assert.deepEqual(await fetchUsage('-proj', 's1'), session);

console.log('cost tests passed');
