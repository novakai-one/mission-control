import React, { useState } from 'react';
import { Shield, FileCode, BookOpen, ChevronRight, Terminal, Webhook } from 'lucide-react';

export interface HookConfig {
  event: string;
  matcher: string | null;
  command: string;
  scriptPath: string | null;
}

export interface GateScript {
  fileName: string;
  relativePath: string;
  source: string;
  size: number;
  hookEvents: string[];
  matchers: string[];
}

export interface RulesetData {
  hooks: HookConfig[];
  gates: GateScript[];
  claudeMd: string | null;
  claudeMdPath: string | null;
  projectPath: string;
  toolsPath: string | null;
}

interface RulesetInspectorProps {
  data: RulesetData | null;
}

type Tab = 'hooks' | 'gates' | 'claude-md';

const EVENT_COLORS: Record<string, string> = {
  PreToolUse: 'var(--kind-tool)',
  PostToolUse: 'var(--kind-result)',
  SessionStart: 'var(--kind-assistant)',
  Stop: 'var(--kind-error)',
  SubagentStop: 'var(--kind-thinking)',
  Notification: 'var(--text-muted)',
};

export function RulesetInspector({ data }: RulesetInspectorProps) {
  const [tab, setTab] = useState<Tab>('hooks');
  const [selectedGate, setSelectedGate] = useState<string | null>(null);

  if (!data) {
    return (
      <div style={{
        display: 'flex', flex: 1, backgroundColor: 'var(--bg-primary)',
        alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
        flexDirection: 'column', gap: '0.8rem'
      }}>
        <Shield size={28} strokeWidth={1.5} />
        <span style={{ fontSize: '0.75rem' }}>Loading ruleset...</span>
      </div>
    );
  }

  const hookCount = data.hooks.length;
  const gateCount = data.gates.length;
  const hasClaudeMd = data.claudeMd !== null;

  return (
    <div style={{ display: 'flex', flex: 1, backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left sidebar: tab nav + list */}
      <div style={{
        width: '280px', backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column'
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          <TabButton active={tab === 'hooks'} onClick={() => setTab('hooks')} icon={<Webhook size={12} />} label="Hooks" count={hookCount} />
          <TabButton active={tab === 'gates'} onClick={() => setTab('gates')} icon={<Shield size={12} />} label="Gates" count={gateCount} />
          <TabButton active={tab === 'claude-md'} onClick={() => setTab('claude-md')} icon={<BookOpen size={12} />} label="Rules" count={hasClaudeMd ? 1 : 0} />
        </div>

        {/* List content based on tab */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.8rem' }}>
          {tab === 'hooks' && (
            <HookList hooks={data.hooks} />
          )}
          {tab === 'gates' && (
            <GateList gates={data.gates} selectedGate={selectedGate} onSelect={setSelectedGate} />
          )}
          {tab === 'claude-md' && (
            <div style={{ padding: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
                <BookOpen size={12} color="var(--text-secondary)" />
                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>CLAUDE.md</span>
              </div>
              {hasClaudeMd ? (
                <div className="glass-panel" style={{ padding: '0.5rem 0.8rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {data.claudeMdPath?.replace(data.projectPath + '/', '')}
                </div>
              ) : (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No CLAUDE.md found</span>
              )}
              <div style={{ marginTop: '1rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                <div style={{ marginBottom: '0.3rem' }}>Project: {data.projectPath}</div>
                {data.toolsPath && <div>Tools: {data.toolsPath.replace(data.projectPath + '/', '')}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel: detail viewer */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-primary)' }}>
        {tab === 'hooks' && <HookDetail hooks={data.hooks} />}
        {tab === 'gates' && <GateDetail gates={data.gates} selectedGate={selectedGate} />}
        {tab === 'claude-md' && <ClaudeMdDetail content={data.claudeMd} />}
      </div>
    </div>
  );
}

// ===== Tab Button =====
function TabButton({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
        padding: '0.7rem 0.4rem', backgroundColor: active ? 'var(--bg-tertiary)' : 'transparent',
        border: 'none', borderBottom: active ? '2px solid var(--accent-active)' : '2px solid transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        cursor: 'pointer', fontSize: '0.7rem', fontWeight: active ? 600 : 400,
      }}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && (
        <span style={{
          fontSize: '0.55rem', backgroundColor: active ? 'var(--accent-color)' : 'var(--bg-tertiary)',
          color: 'var(--text-secondary)', padding: '0.05rem 0.35rem', borderRadius: '8px', fontWeight: 600,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ===== Hooks List =====
function HookList({ hooks }: { hooks: HookConfig[] }) {
  if (hooks.length === 0) {
    return <div style={{ padding: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No hooks configured</div>;
  }

  // Group by event type
  const grouped: Record<string, HookConfig[]> = {};
  for (const hook of hooks) {
    if (!grouped[hook.event]) grouped[hook.event] = [];
    grouped[hook.event].push(hook);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {Object.entries(grouped).map(([event, eventHooks]) => (
        <div key={event}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              backgroundColor: EVENT_COLORS[event] || 'var(--text-muted)',
            }} />
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              {event}
            </span>
          </div>
          {eventHooks.map((hook, i) => (
            <div key={i} className="glass-panel" style={{
              padding: '0.4rem 0.6rem', marginBottom: '0.2rem',
              display: 'flex', flexDirection: 'column', gap: '0.2rem',
            }}>
              {hook.matcher && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  matcher: {hook.matcher}
                </span>
              )}
              <span style={{ fontSize: '0.65rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                {hook.command}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ===== Hook Detail =====
function HookDetail({ hooks }: { hooks: HookConfig[] }) {
  if (hooks.length === 0) {
    return (
      <EmptyState icon={<Webhook size={24} strokeWidth={1.5} />} message="No hooks configured in .claude/settings.json" />
    );
  }

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Webhook size={14} color="var(--text-secondary)" />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Hook Configuration</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>— .claude/settings.json</span>
      </div>

      {hooks.map((hook, i) => (
        <div key={i} className="glass-panel" style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              fontSize: '0.6rem', fontWeight: 600, padding: '0.1rem 0.5rem', borderRadius: '4px',
              backgroundColor: `${EVENT_COLORS[hook.event] || 'var(--text-muted)'}22`,
              color: EVENT_COLORS[hook.event] || 'var(--text-muted)',
            }}>
              {hook.event}
            </span>
            {hook.matcher && (
              <span style={{
                fontSize: '0.6rem', color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-tertiary)', padding: '0.1rem 0.5rem', borderRadius: '4px',
              }}>
                {hook.matcher}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Terminal size={11} color="var(--text-muted)" />
            <code style={{ fontSize: '0.7rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
              {hook.command}
            </code>
          </div>
          {hook.scriptPath && (
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
              → {hook.scriptPath.split('/').slice(-3).join('/')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ===== Gate List =====
function GateList({ gates, selectedGate, onSelect }: {
  gates: GateScript[]; selectedGate: string | null; onSelect: (name: string) => void;
}) {
  if (gates.length === 0) {
    return <div style={{ padding: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No gate scripts found</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      {gates.map((gate) => (
        <div
          key={gate.fileName}
          onClick={() => onSelect(gate.fileName)}
          className="glass-panel"
          style={{
            padding: '0.5rem 0.6rem', cursor: 'pointer',
            backgroundColor: selectedGate === gate.fileName ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
            borderColor: selectedGate === gate.fileName ? 'var(--border-active)' : 'var(--border-color)',
            display: 'flex', flexDirection: 'column', gap: '0.2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Shield size={11} color={selectedGate === gate.fileName ? 'var(--accent-active)' : 'var(--text-muted)'} />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 500 }}>
              {gate.fileName}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {gate.hookEvents.map(ev => (
              <span key={ev} style={{
                fontSize: '0.5rem', padding: '0.05rem 0.3rem', borderRadius: '3px',
                backgroundColor: `${EVENT_COLORS[ev] || 'var(--text-muted)'}22`,
                color: EVENT_COLORS[ev] || 'var(--text-muted)',
              }}>
                {ev}
              </span>
            ))}
            {gate.matchers.map(m => (
              <span key={m} style={{
                fontSize: '0.5rem', padding: '0.05rem 0.3rem', borderRadius: '3px',
                backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)',
              }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== Gate Detail =====
function GateDetail({ gates, selectedGate }: {
  gates: GateScript[]; selectedGate: string | null;
}) {
  const gate = selectedGate ? gates.find(g => g.fileName === selectedGate) : gates[0];

  if (!gate) {
    return (
      <EmptyState icon={<Shield size={24} strokeWidth={1.5} />} message="No gate scripts found in tools/" />
    );
  }

  // Extract the header comment block for display
  const headerMatch = gate.source.match(/^\/\*[\s\S]*?\*\//);
  const header = headerMatch ? headerMatch[0] : null;
  const body = headerMatch ? gate.source.slice(headerMatch[0].length) : gate.source;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <FileCode size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {gate.fileName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
          <span>{gate.relativePath}</span>
          <span>{(gate.size / 1024).toFixed(1)}KB</span>
          {gate.hookEvents.map(ev => (
            <span key={ev} style={{
              padding: '0.05rem 0.35rem', borderRadius: '3px',
              backgroundColor: `${EVENT_COLORS[ev] || 'var(--text-muted)'}22`,
              color: EVENT_COLORS[ev] || 'var(--text-muted)', fontWeight: 600,
            }}>
              {ev}
            </span>
          ))}
        </div>
      </div>

      {/* Source code */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
        {header && (
          <div style={{
            padding: '1rem 1.5rem', backgroundColor: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-color)', maxHeight: '300px', overflowY: 'auto',
          }}>
            <pre style={{
              fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5rem', margin: 0,
            }}>
              {header.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').replace(/^\s*\*\s?/gm, '')}
            </pre>
          </div>
        )}
        <div style={{ padding: '1rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
            <ChevronRight size={12} color="var(--text-muted)" />
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Source</span>
          </div>
          <pre style={{
            fontSize: '0.65rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.4rem', margin: 0,
          }}>
            {body.trim()}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ===== CLAUDE.md Detail =====
function ClaudeMdDetail({ content }: { content: string | null }) {
  if (!content) {
    return (
      <EmptyState icon={<BookOpen size={24} strokeWidth={1.5} />} message="No CLAUDE.md found in project root" />
    );
  }

  return (
    <div style={{ padding: '1.5rem', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <BookOpen size={14} color="var(--text-secondary)" />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>CLAUDE.md</span>
      </div>
      <pre style={{
        fontSize: '0.72rem', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.6rem', margin: 0,
      }}>
        {content}
      </pre>
    </div>
  );
}

// ===== Empty State =====
function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div style={{
      display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '0.8rem', color: 'var(--text-muted)',
    }}>
      {icon}
      <span style={{ fontSize: '0.75rem' }}>{message}</span>
    </div>
  );
}
