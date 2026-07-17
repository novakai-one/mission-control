// Terminal-parity registry (C23). Everything you can do in a terminal session
// but couldn't from Conversation, declared as DATA: adding interrupt,
// permissions, or effort later is a new registry entry, not a rewrite. The
// strip renders quietly in the ACTIVE Conversation's header region — no new
// rail, no attention text, Inter only, no gold.
import React, { useEffect, useState } from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import { runSessionControl, type SessionControlIntent } from '../../../../lib/sessionControl/index.js';
import {
  fetchUsage,
  formatCost,
  formatTokens,
  sessionCost,
  sessionTokens,
  useCostSettings,
  type CostSettings,
  type SessionUsage,
} from '../../../../lib/cost/index.js';
import './index.css';

/** The shell's usage state follows the Transcript tab's selection; the parity
 * readout must follow the LIVE agent instead. When the shell has nothing for
 * this session, resolve the agent's transcript dir once and project usage on
 * a slow tick — a read-only projection, never a second store. */
function useAgentUsage(agent: AgentInfo | null, shellUsage: SessionUsage | null): SessionUsage | null {
  const [resolved, setResolved] = useState<SessionUsage | null>(null);
  const sessionId = agent?.status === 'running' ? agent.sessionId : null;
  useEffect(() => {
    setResolved(null);
    if (!sessionId || shellUsage) return;
    let alive = true;
    let dirName: string | null = null;
    async function tick(): Promise<void> {
      try {
        if (!dirName) {
          const response = await fetch('/api/sessions');
          if (!response.ok) return;
          const sessions = (await response.json()) as { sessionId: string; dirName: string }[];
          dirName = sessions.find((entry) => entry.sessionId === sessionId)?.dirName ?? null;
        }
        if (!dirName || !sessionId) return;
        const usage = await fetchUsage(dirName, sessionId);
        if (alive && usage) setResolved(usage);
      } catch { /* readout stays blank — honesty over guesses */ }
    }
    void tick();
    const timer = setInterval(() => { void tick(); }, 15_000);
    return () => { alive = false; clearInterval(timer); };
  }, [sessionId, shellUsage === null]);
  return shellUsage ?? resolved;
}

export interface ParityContext {
  agent: AgentInfo;
  usage: SessionUsage | null;
  settings: CostSettings;
}

interface CommandSelectControl {
  id: string;
  kind: 'command-select';
  label: string;
  /** Providers whose CLI understands this command. */
  providers: AgentInfo['provider'][];
  options: { id: string; label: string }[];
  /** The typed SessionControl intent — validated, serialized, and written to
   * the live PTY by the backend, which answers with an honest receipt. */
  intent(optionId: string): SessionControlIntent;
}

interface ReadoutControl {
  id: string;
  kind: 'readout';
  label: string;
  /** A plain projection over already-fetched state; never its own store. */
  project(context: ParityContext): string | null;
}

export type ParityControl = CommandSelectControl | ReadoutControl;

export const PARITY_CONTROLS: ParityControl[] = [
  {
    id: 'model',
    kind: 'command-select',
    label: 'Model',
    providers: ['claude'],
    options: [
      { id: 'fable', label: 'Fable 5' },
      { id: 'opus', label: 'Opus 4.8' },
      { id: 'sonnet', label: 'Sonnet 5' },
      { id: 'haiku', label: 'Haiku 4.5' },
    ],
    intent: (optionId) => ({ kind: 'model', model: optionId }),
  },
  {
    id: 'tokens',
    kind: 'readout',
    label: 'Tokens',
    project: ({ usage, settings }) => {
      if (!usage) return null;
      const total = sessionTokens(usage);
      if (total === 0) return null;
      return `${formatTokens(total)} · ${formatCost(sessionCost(usage, settings), settings.currency)}`;
    },
  },
];

const lastAcceptedKey = (sessionId: string, controlId: string) => `novakai-parity:${controlId}:${sessionId}`;

function CommandSelect({ control, agent }: { control: CommandSelectControl; agent: AgentInfo }) {
  // The select shows the LAST BACKEND-ACCEPTED choice for this session
  // (accepted = the validated command reached the live PTY — codex's
  // SessionControl receipt, never localStorage fiction). Applied
  // confirmation stays transcript-derived (the next model/usage event).
  const [accepted, setAccepted] = useState<string>(() => {
    try { return localStorage.getItem(lastAcceptedKey(agent.sessionId, control.id)) ?? ''; } catch { return ''; }
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    try { setAccepted(localStorage.getItem(lastAcceptedKey(agent.sessionId, control.id)) ?? ''); } catch { setAccepted(''); }
    setNote(null);
  }, [agent.sessionId, control.id]);

  async function choose(optionId: string): Promise<void> {
    if (!optionId || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await runSessionControl(agent.agentId, control.intent(optionId));
      if (result.status === 'accepted') {
        setAccepted(optionId);
        try { localStorage.setItem(lastAcceptedKey(agent.sessionId, control.id), optionId); } catch { /* display only */ }
      } else {
        setNote(result.reason ?? 'rejected');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="st-parity-item">
      <span className="st-parity-label">{control.label}</span>
      <select
        aria-label={`${control.label} — sends a typed control to the session`}
        title={accepted ? 'Last accepted by the session backend' : 'As launched — pick to send the switch into the session'}
        value={accepted}
        disabled={busy}
        onChange={(change) => void choose(change.target.value)}
      >
        <option value="">as launched</option>
        {control.options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
      {note && <span className="st-parity-note">{note}</span>}
    </label>
  );
}

export function ParityStrip({ agent, usage }: { agent: AgentInfo | null; usage: SessionUsage | null }) {
  const [settings] = useCostSettings();
  const liveUsage = useAgentUsage(agent, usage);
  if (!agent || agent.status !== 'running') return null;
  const context: ParityContext = { agent, usage: liveUsage, settings };
  const commandControls = PARITY_CONTROLS.filter(
    (control): control is CommandSelectControl =>
      control.kind === 'command-select' && control.providers.includes(agent.provider),
  );
  const readouts = PARITY_CONTROLS.filter(
    (control): control is ReadoutControl => control.kind === 'readout',
  );
  return (
    <div className="st-parity">
      {commandControls.map((control) => (
        <CommandSelect key={control.id} control={control} agent={agent} />
      ))}
      {readouts.map((control) => {
        const value = control.project(context);
        if (!value) return null;
        return (
          <span key={control.id} className="st-parity-read" title={`${control.label} — session total`}>
            {value}
          </span>
        );
      })}
    </div>
  );
}
