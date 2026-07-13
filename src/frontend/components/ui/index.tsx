import React from 'react';
import { FileText, Brain, Wrench, AlertTriangle, Radio } from 'lucide-react';
import './index.css';

interface KindMeta {
  icon: React.ReactNode;
  className: string;
}

/**
 * Single source of truth for event-kind taxonomy: icon + Pill className.
 * className is `kind-<suffix>` matching the --kind-* tokens in css/index.css
 * (assistant, thinking, tool, result, error); kinds with no dedicated token
 * fall back to `kind-secondary` / `kind-muted` (styled in ui/index.css).
 *
 * Keys 1-8 are transcript event kinds (icons match board/calm's prior
 * per-kind icon maps, now consolidated here). Keys 9-14 are ruleset hook-event names mapped onto the
 * same canonical taxonomy: PreToolUse->tool, PostToolUse->result,
 * SessionStart->assistant, Stop->error, SubagentStop->thinking,
 * Notification->muted (mirrors ruleset/index.tsx EVENT_COLORS).
 */
export const KIND_META: Record<string, KindMeta> = {
  user_text: { icon: <FileText size={11} color="var(--text-secondary)" />, className: 'kind-secondary' },
  assistant_text: { icon: <FileText size={11} color="var(--kind-assistant)" />, className: 'kind-assistant' },
  assistant_thinking: { icon: <Brain size={11} color="var(--kind-thinking)" />, className: 'kind-thinking' },
  tool_use: { icon: <Wrench size={11} color="var(--kind-tool)" />, className: 'kind-tool' },
  tool_result: { icon: <Wrench size={11} color="var(--kind-result)" />, className: 'kind-result' },
  hook_event: { icon: <AlertTriangle size={11} color="var(--kind-error)" />, className: 'kind-error' },
  system: { icon: <Radio size={11} color="var(--text-muted)" />, className: 'kind-muted' },
  session_meta: { icon: <Radio size={11} color="var(--text-muted)" />, className: 'kind-muted' },
  PreToolUse: { icon: <Wrench size={11} color="var(--kind-tool)" />, className: 'kind-tool' },
  PostToolUse: { icon: <Wrench size={11} color="var(--kind-result)" />, className: 'kind-result' },
  SessionStart: { icon: <FileText size={11} color="var(--kind-assistant)" />, className: 'kind-assistant' },
  Stop: { icon: <AlertTriangle size={11} color="var(--kind-error)" />, className: 'kind-error' },
  SubagentStop: { icon: <Brain size={11} color="var(--kind-thinking)" />, className: 'kind-thinking' },
  Notification: { icon: <Radio size={11} color="var(--text-muted)" />, className: 'kind-muted' },
};

interface PillProps {
  kind?: string;
  status?: string;
  children?: React.ReactNode;
}

/** Generic tag: `kind`/`status` are raw kind- and status-token suffixes, not KIND_META keys. */
export function Pill({ kind, status, children }: PillProps) {
  const classes = ['u-pill'];
  if (kind) classes.push(`kind-${kind}`);
  if (status) classes.push(`status-${status}`);
  return <span className={classes.join(' ')}>{children}</span>;
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}

export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className="u-empty">
      {icon && <span className="u-empty-icon">{icon}</span>}
      <span>{title}</span>
      {hint && <span className="u-empty-hint">{hint}</span>}
    </div>
  );
}

interface PanelHeaderProps {
  title: string;
  actions?: React.ReactNode;
}

export function PanelHeader({ title, actions }: PanelHeaderProps) {
  return (
    <header className="u-panel-header">
      <span className="u-section-title">{title}</span>
      {actions}
    </header>
  );
}

interface PanelGlyphProps {
  /** Divider position tells the state: near the middle = drawer open, hugging
   * the left edge = drawer tucked away. */
  open: boolean;
  size?: number;
}

export function PanelGlyph({ open, size = 16 }: PanelGlyphProps) {
  const dividerX = open ? 10.5 : 6.5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <line x1={dividerX} y1="4" x2={dividerX} y2="20" />
    </svg>
  );
}
