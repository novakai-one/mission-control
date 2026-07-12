import React, { useState } from 'react';
import { Bug } from 'lucide-react';
import './index.css';

export interface BuildMessage {
  event: string;
  payload: any;
}

interface DebugPanelProps {
  buildMessages: BuildMessage[];
  wsReady: boolean;
}

type Tone = 'result' | 'error' | 'tool' | 'assistant';

const AUTH_MARKER = /Not logged in|Please run \/login|command not found/i;

export function DebugPanel({ buildMessages, wsReady }: DebugPanelProps) {
  const [filter, setFilter] = useState('');

  // Scope everything to the most recent build (builds run one at a time, in order).
  const startIdx = buildMessages.map(m => m.event).lastIndexOf('build-started');
  const scoped = startIdx >= 0 ? buildMessages.slice(startIdx) : buildMessages;

  const lastOf = (evt: string) => [...scoped].reverse().find(m => m.event === evt);
  const started = lastOf('build-started');
  const debug = lastOf('build-debug');
  const completed = lastOf('build-completed') || lastOf('build-stopped');

  // The build object carries the debug facts after completion; build-debug carries them live during the run.
  const build = (completed?.payload?.build) || (started?.payload?.build) || {};
  const facts = debug?.payload || {};
  const command = build.command ?? facts.command;
  const args = build.args ?? facts.args;
  const cwd = build.cwd ?? facts.cwd;
  const pid = build.pid ?? facts.pid;
  const cliExists = build.cliExists ?? facts.cliExists;
  const llm = build.llm ?? facts.llm;
  const status: string = build.status || (started ? 'running' : '—');
  const exitCode = build.exitCode;
  const errorMessage = build.errorMessage;
  const durationMs = build.durationMs;

  // stderr is emitted as steps tagged stream:'stderr'; collect it separately from stdout.
  const stepMsgs = scoped.filter(m => m.event === 'agent-step');
  const stderrText = stepMsgs.filter(m => m.payload?.step?.stream === 'stderr').map(m => m.payload.step.content).join('');
  const stdoutText = scoped.filter(m => m.event === 'agent-stdout').map(m => m.payload?.content || '').join('');
  const allOutput = stdoutText + stderrText;

  const isDone = status === 'success' || status === 'failed' || status === 'stopped';
  const authMarkerHit = AUTH_MARKER.test(allOutput);

  // Literal expected-vs-actual checks (no rule engine). null = not applicable yet.
  const checks: { label: string; expected: string; actual: string; ok: boolean | null }[] = [
    { label: 'WebSocket', expected: 'connected', actual: wsReady ? 'connected' : 'disconnected', ok: wsReady },
    { label: 'CLI path exists', expected: 'true', actual: cliExists === undefined ? '—' : String(cliExists), ok: cliExists === undefined ? null : !!cliExists },
    { label: 'Exit code', expected: '0', actual: exitCode === undefined ? '—' : String(exitCode), ok: !isDone ? null : exitCode === 0 },
    { label: 'stderr empty', expected: 'empty', actual: stderrText ? `${stderrText.length} chars` : 'empty', ok: !isDone ? null : stderrText.trim() === '' },
    { label: 'No auth/exec error in output', expected: 'none', actual: authMarkerHit ? 'found "Not logged in / not found"' : 'none', ok: !isDone ? null : !authMarkerHit },
    { label: 'Status matches result', expected: 'success ⇒ clean', actual: status, ok: status !== 'success' ? (isDone ? true : null) : (exitCode === 0 && !authMarkerHit && stderrText.trim() === '') },
  ];

  const visible = filter.trim()
    ? buildMessages.filter(m => (m.event + ' ' + JSON.stringify(m.payload)).toLowerCase().includes(filter.toLowerCase()))
    : buildMessages;

  return (
    <div className="dbg-panel">
      <div className="dbg-header">
        <Bug size={16} color="var(--kind-tool)" />
        <span className="dbg-title">BUILD DEBUG</span>
        {!wsReady && (
          <span className="dbg-ws-warning">● WebSocket disconnected — no live events</span>
        )}
      </div>

      {/* Environment */}
      <Section title="Environment">
        <Row k="LLM path" v={llm || '—'} />
        <Row k="Resolved command" v={command || '— (no build run yet)'} mono />
        <Row k="Args" v={args ? args.join(' ') : '—'} mono />
        <Row k="cwd" v={cwd || '—'} mono />
        <Row k="PID" v={pid !== undefined ? String(pid) : '—'} />
      </Section>

      {/* Per-build diagnostics */}
      <Section title="Last build">
        <Row k="Build ID" v={build.id || started?.payload?.build?.id || '—'} />
        <Row k="Status" v={status} color={status === 'success' ? 'result' : status === 'failed' ? 'error' : status === 'stopped' ? 'tool' : 'assistant'} />
        <Row k="Exit code" v={exitCode === undefined ? '—' : String(exitCode)} />
        <Row k="Duration" v={durationMs !== undefined ? `${durationMs} ms` : '—'} />
        {errorMessage && <Row k="Error" v={errorMessage} color="error" mono />}
      </Section>

      {/* Checks */}
      <Section title="Checks (expected vs actual)">
        <div className="dbg-checks-grid">
          {checks.map((c, i) => (
            <React.Fragment key={i}>
              <span className={`dbg-tone-${c.ok === null ? 'muted' : c.ok ? 'result' : 'error'}`}>
                {c.ok === null ? '·' : c.ok ? '✓' : '✗'}
              </span>
              <span className="dbg-tone-secondary">{c.label}</span>
              <span className="dbg-tone-muted">{c.actual} <span className="dbg-opacity-half">(want {c.expected})</span></span>
            </React.Fragment>
          ))}
        </div>
      </Section>

      {/* stderr */}
      {stderrText && (
        <Section title="stderr">
          <pre className="dbg-stderr">
            {stderrText}
          </pre>
        </Section>
      )}

      {/* Raw event log */}
      <Section title={`Raw event log (${buildMessages.length})`}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="filter events…"
          className="dbg-filter-input"
        />
        <div className="dbg-log-container">
          {visible.length === 0 ? (
            <span className="dbg-tone-muted">No events.</span>
          ) : visible.map((m, i) => (
            <div key={i} className="dbg-log-row">
              <span className="dbg-tone-assistant">{m.event}</span>{' '}
              <span className="dbg-tone-muted">{JSON.stringify(m.payload)}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="dbg-section">
      <div className="u-section-title dbg-section-title">{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v, mono, color }: { k: string; v: string; mono?: boolean; color?: Tone }) {
  const valueClasses = [mono ? 'dbg-row-value-mono' : '', color ? `dbg-tone-${color}` : ''].filter(Boolean).join(' ');
  return (
    <div className="dbg-row">
      <span className="dbg-row-key">{k}</span>
      <span className={valueClasses || undefined}>{v}</span>
    </div>
  );
}
