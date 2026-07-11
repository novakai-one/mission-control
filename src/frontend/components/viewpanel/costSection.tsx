// Cost breakdown + pricing settings for the view panel. Totals come from
// /api/usage (full transcripts) — event-visibility filters and playback never
// affect these numbers.
import React, { useEffect, useRef, useState } from 'react';
import * as agentSocket from '../../lib/agentSocket/index.js';
import type { AgentInfo } from '../../lib/agentSocket/index.js';
import {
  CACHE_READ_MULT,
  CACHE_WRITE_1H_MULT,
  CACHE_WRITE_5M_MULT,
  costOf,
  costOfModel,
  fetchUsage,
  formatCost,
  formatTokens,
  sessionCost,
  sessionTokens,
  tokensOf,
  type AgentUsage,
  type CostSettings,
  type SessionUsage,
} from '../../lib/cost/index.js';

interface CostSectionProps {
  usage: SessionUsage | null;
  settings: CostSettings;
  onSettingsChange: (next: CostSettings) => void;
}

function ModelRows({ usage, settings }: { usage: AgentUsage; settings: CostSettings }) {
  return (
    <>
      {Object.entries(usage.perModel).map(([model, totals]) => (
        <div key={model} className="vp-row vp-row-child">
          <span className="vp-label" title={`in ${totals.input.toLocaleString()} · cache-write ${(totals.cacheWrite5m + totals.cacheWrite1h).toLocaleString()} · cache-read ${totals.cacheRead.toLocaleString()} · out ${totals.output.toLocaleString()} · ${totals.requests} msgs`}>
            {model || 'unknown model'}
          </span>
          <span className="vp-count">{formatTokens(tokensOf({ perModel: { [model]: totals } }))} · {formatCost(costOfModel(model, totals, settings), settings.currency)}</span>
        </div>
      ))}
    </>
  );
}

function numberInput(value: number, onCommit: (parsed: number) => void): React.ReactNode {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      defaultValue={value}
      key={value}
      className="vp-cost-input"
      onBlur={(domEvent) => {
        const parsed = Number.parseFloat(domEvent.target.value);
        if (Number.isFinite(parsed) && parsed >= 0) onCommit(parsed);
      }}
    />
  );
}

export function CostSection({ usage, settings, onSettingsChange }: CostSectionProps) {
  return (
    <>
      <div className="vp-section-head">
        <span className="vp-section-title">Cost</span>
      </div>
      {usage ? (
        <div className="vp-group">
          <div className="vp-row">
            <span className="vp-label vp-cost-total">Session total</span>
            <span className="vp-count">{formatTokens(sessionTokens(usage))} · {formatCost(sessionCost(usage, settings), settings.currency)}</span>
          </div>
          <div className="vp-group-title">Main agent</div>
          <ModelRows usage={usage.main} settings={settings} />
          {usage.subagents.length > 0 && <div className="vp-group-title">Subagents</div>}
          {usage.subagents.map((subagent) => (
            <div key={subagent.agentId} className="vp-row vp-row-child">
              <span className="vp-label" title={`${subagent.agentType || 'agent'} · ${subagent.agentId}`}>{subagent.description || subagent.agentId}</span>
              <span className="vp-count">{formatTokens(tokensOf(subagent))} · {formatCost(costOf(subagent, settings), settings.currency)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="vp-group"><div className="vp-group-title">No usage data</div></div>
      )}

      <div className="vp-group">
        <div className="vp-group-title">Settings</div>
        <div className="vp-row">
          <span className="vp-label">Currency</span>
          <select
            value={settings.currency}
            className="vp-cost-select"
            onChange={(domEvent) => onSettingsChange({ ...settings, currency: domEvent.target.value as 'USD' | 'AUD' })}
          >
            <option value="USD">USD</option>
            <option value="AUD">AUD</option>
          </select>
        </div>
        <div className="vp-row">
          <span className="vp-label">USD→AUD rate</span>
          {numberInput(settings.usdToAud, (parsed) => onSettingsChange({ ...settings, usdToAud: parsed }))}
        </div>
        <div className="vp-group-title">Prices (USD / MTok, in · out)</div>
        {Object.entries(settings.prices).map(([prefix, price]) => (
          <div key={prefix} className="vp-row vp-row-child">
            <span className="vp-label">{prefix}</span>
            <span className="vp-cost-pair">
              {numberInput(price.inputPerMTok, (parsed) => onSettingsChange({ ...settings, prices: { ...settings.prices, [prefix]: { ...price, inputPerMTok: parsed } } }))}
              {numberInput(price.outputPerMTok, (parsed) => onSettingsChange({ ...settings, prices: { ...settings.prices, [prefix]: { ...price, outputPerMTok: parsed } } }))}
            </span>
          </div>
        ))}
        <div className="vp-group-title">Assumptions</div>
        <div className="vp-cost-assumptions">
          Cache read ×{CACHE_READ_MULT}, cache write ×{CACHE_WRITE_5M_MULT} (5m) / ×{CACHE_WRITE_1H_MULT} (1h) of input price.
          Unknown models priced at Opus rates. Long-context premiums ignored.
          Totals dedupe repeated transcript lines by API message id and always cover the full transcript — event visibility toggles and playback do not change costs.
        </div>
      </div>
    </>
  );
}

/** Agents-tab variant: fetches /api/usage for the active persistent agent and live-refreshes off the agent socket. */
export function AgentCostSection({ agent, settings, onSettingsChange }: { agent: AgentInfo | null; settings: CostSettings; onSettingsChange: (next: CostSettings) => void }) {
  const [usage, setUsage] = useState<SessionUsage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setUsage(null);
    if (!agent) return;
    const { projectDir, sessionId } = agent;
    let disposed = false;

    function refetch(delayMs: number): void {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fetchUsage(projectDir, sessionId)
          .then((data) => { if (!disposed) setUsage(data); })
          .catch(() => {});
      }, delayMs);
    }

    refetch(0);
    agentSocket.connect();
    agentSocket.watchSession(projectDir, sessionId);
    const offMain = agentSocket.onTranscriptEvent((eventSessionId, event) => {
      if (eventSessionId === sessionId && (event as { kind?: string })?.kind === 'usage') refetch(1500);
    });
    const offSub = agentSocket.onSubagentEvent((eventSessionId, _subagentId, event) => {
      if (eventSessionId === sessionId && (event as { kind?: string })?.kind === 'usage') refetch(1500);
    });
    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      offMain();
      offSub();
      agentSocket.unwatchSession(projectDir, sessionId);
    };
  }, [agent?.agentId]);

  if (!agent) return <div className="vp-empty">No active agent selected</div>;
  return <CostSection usage={usage} settings={settings} onSettingsChange={onSettingsChange} />;
}
