import React, { useState } from 'react';
import { Bug } from 'lucide-react';
import { BuildMessage } from '../terminal/index.js';

interface DebugPanelProps {
  buildMessages: BuildMessage[];
  wsReady: boolean;
}

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
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Bug size={16} color="#c9b57a" />
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>BUILD DEBUG</span>
        {!wsReady && (
          <span style={{ marginLeft: '0.5rem', color: '#c97a7a', fontSize: '0.7rem' }}>● WebSocket disconnected — no live events</span>
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
        <Row k="Status" v={status} color={status === 'success' ? '#7ac98f' : status === 'failed' ? '#c97a7a' : status === 'stopped' ? '#c9b57a' : '#7a9ec9'} />
        <Row k="Exit code" v={exitCode === undefined ? '—' : String(exitCode)} />
        <Row k="Duration" v={durationMs !== undefined ? `${durationMs} ms` : '—'} />
        {errorMessage && <Row k="Error" v={errorMessage} color="#c97a7a" mono />}
      </Section>

      {/* Checks */}
      <Section title="Checks (expected vs actual)">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.25rem 0.75rem', alignItems: 'baseline' }}>
          {checks.map((c, i) => (
            <React.Fragment key={i}>
              <span style={{ color: c.ok === null ? 'var(--text-muted)' : c.ok ? '#7ac98f' : '#c97a7a' }}>
                {c.ok === null ? '·' : c.ok ? '✓' : '✗'}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{c.label}</span>
              <span style={{ color: 'var(--text-muted)' }}>{c.actual} <span style={{ opacity: 0.5 }}>(want {c.expected})</span></span>
            </React.Fragment>
          ))}
        </div>
      </Section>

      {/* stderr */}
      {stderrText && (
        <Section title="stderr">
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#c97a7a', backgroundColor: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
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
          style={{ width: '100%', marginBottom: '0.5rem', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', outline: 'none' }}
        />
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.5rem', maxHeight: '40vh', overflowY: 'auto' }}>
          {visible.length === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>No events.</span>
          ) : visible.map((m, i) => (
            <div key={i} style={{ marginBottom: '0.3rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              <span style={{ color: '#7a9ec9' }}>{m.event}</span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>{JSON.stringify(m.payload)}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v, mono, color }: { k: string; v: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.2rem' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: '130px', flexShrink: 0 }}>{k}</span>
      <span style={{ color: color || 'var(--text-secondary)', wordBreak: mono ? 'break-all' : 'normal' }}>{v}</span>
    </div>
  );
}
