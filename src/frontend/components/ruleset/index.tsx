import React, { useState } from 'react';
import { Shield, FileCode, BookOpen, ChevronRight, Terminal, Webhook } from 'lucide-react';
import { Pill, KIND_META } from '../ui/index.js';
import './index.css';

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

// Strip the `kind-` prefix off a KIND_META className so it can be passed to <Pill kind=.../>.
function eventKind(name: string): string {
  return (KIND_META[name]?.className ?? 'kind-muted').slice(5);
}

export function RulesetInspector({ data }: RulesetInspectorProps) {
  const [tab, setTab] = useState<Tab>('hooks');
  const [selectedGate, setSelectedGate] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="rs-loading">
        <Shield size={28} strokeWidth={1.5} />
        <span className="rs-msg-sm">Loading ruleset...</span>
      </div>
    );
  }

  const hookCount = data.hooks.length;
  const gateCount = data.gates.length;
  const hasClaudeMd = data.claudeMd !== null;

  return (
    <div className="rs-root">
      {/* Left sidebar: tab nav + list */}
      <div className="rs-sidebar">
        {/* Tabs */}
        <div className="rs-tabs">
          <TabButton active={tab === 'hooks'} onClick={() => setTab('hooks')} icon={<Webhook size={12} />} label="Hooks" count={hookCount} />
          <TabButton active={tab === 'gates'} onClick={() => setTab('gates')} icon={<Shield size={12} />} label="Gates" count={gateCount} />
          <TabButton active={tab === 'claude-md'} onClick={() => setTab('claude-md')} icon={<BookOpen size={12} />} label="Rules" count={hasClaudeMd ? 1 : 0} />
        </div>

        {/* List content based on tab */}
        <div className="rs-list">
          {tab === 'hooks' && (
            <HookList hooks={data.hooks} />
          )}
          {tab === 'gates' && (
            <GateList gates={data.gates} selectedGate={selectedGate} onSelect={setSelectedGate} />
          )}
          {tab === 'claude-md' && (
            <div className="rs-cmd-wrap">
              <div className="rs-cmd-header">
                <BookOpen size={12} color="var(--text-secondary)" />
                <span className="rs-cmd-title">CLAUDE.md</span>
              </div>
              {hasClaudeMd ? (
                <div className="glass-panel rs-cmd-path">
                  {data.claudeMdPath?.replace(data.projectPath + '/', '')}
                </div>
              ) : (
                <span className="rs-cmd-empty">No CLAUDE.md found</span>
              )}
              <div className="rs-cmd-meta">
                <div className="rs-cmd-meta-row">Project: {data.projectPath}</div>
                {data.toolsPath && <div>Tools: {data.toolsPath.replace(data.projectPath + '/', '')}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel: detail viewer */}
      <div className="rs-detail-pane">
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
    <button onClick={onClick} className={`rs-tab-btn${active ? ' active' : ''}`}>
      {icon}
      <span>{label}</span>
      {count > 0 && (
        <span className={`rs-tab-count${active ? ' active' : ''}`}>{count}</span>
      )}
    </button>
  );
}

// ===== Hooks List =====
function HookList({ hooks }: { hooks: HookConfig[] }) {
  if (hooks.length === 0) {
    return <div className="rs-list-empty">No hooks configured</div>;
  }

  // Group by event type
  const grouped: Record<string, HookConfig[]> = {};
  for (const hook of hooks) {
    if (!grouped[hook.event]) grouped[hook.event] = [];
    grouped[hook.event].push(hook);
  }

  return (
    <div className="rs-hook-groups">
      {Object.entries(grouped).map(([event, eventHooks]) => (
        <div key={event}>
          <div className="rs-hook-group-head">
            <div className={`rs-event-dot kind-${eventKind(event)}`} />
            <span className="rs-event-label">{event}</span>
          </div>
          {eventHooks.map((hook, i) => (
            <div key={i} className="glass-panel rs-hook-item">
              {hook.matcher && (
                <span className="rs-note">matcher: {hook.matcher}</span>
              )}
              <span className="rs-hook-command">{hook.command}</span>
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
    <div className="rs-detail">
      <div className="rs-row-sm">
        <Webhook size={14} color="var(--text-secondary)" />
        <span className="rs-detail-title">Hook Configuration</span>
        <span className="rs-detail-sub">— .claude/settings.json</span>
      </div>

      {hooks.map((hook, i) => (
        <div key={i} className="glass-panel rs-hook-card">
          <div className="rs-row-sm">
            <Pill kind={eventKind(hook.event)}>{hook.event}</Pill>
            {hook.matcher && (
              <span className="rs-hook-matcher-badge">{hook.matcher}</span>
            )}
          </div>
          <div className="rs-row-xs">
            <Terminal size={11} color="var(--text-muted)" />
            <code className="rs-hook-cmd-code">{hook.command}</code>
          </div>
          {hook.scriptPath && (
            <div className="rs-note">→ {hook.scriptPath.split('/').slice(-3).join('/')}</div>
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
    return <div className="rs-list-empty">No gate scripts found</div>;
  }

  return (
    <div className="rs-gate-list">
      {gates.map((gate) => (
        <div
          key={gate.fileName}
          onClick={() => onSelect(gate.fileName)}
          className={`glass-panel rs-gate-row${selectedGate === gate.fileName ? ' selected' : ''}`}
        >
          <div className="rs-row-xs">
            <Shield size={11} color={selectedGate === gate.fileName ? 'var(--accent-active)' : 'var(--text-muted)'} />
            <span className="rs-gate-name">{gate.fileName}</span>
          </div>
          <div className="rs-gate-tags">
            {gate.hookEvents.map(ev => (
              <Pill key={ev} kind={eventKind(ev)}>{ev}</Pill>
            ))}
            {gate.matchers.map(m => (
              <span key={m} className="rs-gate-matcher-pill">{m}</span>
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
    <div className="rs-gate-detail">
      {/* Header */}
      <div className="rs-gate-detail-head">
        <div className="rs-gate-detail-title-row">
          <FileCode size={14} color="var(--text-secondary)" />
          <span className="rs-gate-detail-title">{gate.fileName}</span>
        </div>
        <div className="rs-gate-detail-meta">
          <span>{gate.relativePath}</span>
          <span>{(gate.size / 1024).toFixed(1)}KB</span>
          {gate.hookEvents.map(ev => (
            <Pill key={ev} kind={eventKind(ev)}>{ev}</Pill>
          ))}
        </div>
      </div>

      {/* Source code */}
      <div className="rs-gate-source-wrap">
        {header && (
          <div className="rs-gate-header-block">
            <pre className="rs-gate-header-pre">
              {header.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').replace(/^\s*\*\s?/gm, '')}
            </pre>
          </div>
        )}
        <div className="rs-gate-body-wrap">
          <div className="rs-source-head">
            <ChevronRight size={12} color="var(--text-muted)" />
            <span className="rs-source-title">Source</span>
          </div>
          <pre className="rs-gate-body-pre">{body.trim()}</pre>
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
    <div className="rs-md-detail">
      <div className="rs-md-head">
        <BookOpen size={14} color="var(--text-secondary)" />
        <span className="rs-detail-title">CLAUDE.md</span>
      </div>
      <pre className="rs-md-pre">{content}</pre>
    </div>
  );
}

// ===== Empty State =====
function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="rs-empty">
      {icon}
      <span className="rs-msg-sm">{message}</span>
    </div>
  );
}
