import React, { useEffect, useRef } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import * as agentSocket from '../../lib/agentSocket/index.js';
import type { AgentInfo } from '../../lib/agentSocket/index.js';
import { THEME_CHANGED_EVENT } from '../../lib/theme/index.js';
import './index.css';

// xterm reads no CSS variables (canvas-rendered) — resolve the theme tokens
// to concrete colors at creation time, and again on theme change.
function xtermTheme(): ITheme {
  const style = getComputedStyle(document.documentElement);
  const resolve = (name: string) => style.getPropertyValue(name).trim();
  const bg = resolve('--theme-bg');
  const ink = resolve('--theme-ink');
  // xterm's color parser takes hex/rgb only — #rrggbbaa for the translucent selection.
  return {
    background: bg,
    foreground: ink,
    cursor: ink,
    cursorAccent: bg,
    selectionBackground: `${ink}2e`,
    black: bg,
    brightBlack: resolve('--theme-muted'),
  };
}

// xterm's canvas font string can't resolve var(), so read --font-mono to a
// concrete stack at creation time; the literal is the fallback if it's empty.
// (--font-mono is fixed per :root, not theme-selectable, so no re-theme needed.)
const XTERM_FONT_FALLBACK =
  'JetBrains Mono, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace';

function xtermFontFamily(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-mono').trim();
  return value || XTERM_FONT_FALLBACK;
}

export interface AgentTerminalProps {
  agent: AgentInfo;
  visible: boolean;
}

export function AgentTerminal({ agent, visible }: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // xterm measures cell size at open(); opening inside display:none caches
  // garbage metrics, so open (and subscribe) are deferred to first visibility.
  const openedRef = useRef(false);

  // Create the terminal exactly once for this agent's lifetime; dispose only
  // when this pane itself unmounts (agent removed from the list).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const term = new Terminal({
      theme: xtermTheme(),
      fontFamily: xtermFontFamily(),
      fontSize: 13,
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    termRef.current = term;
    fitRef.current = fitAddon;

    term.onData(data => agentSocket.sendInput(agent.agentId, data));

    // Terminals stay mounted across tab switches, so re-theme in place.
    const onThemeChange = () => { term.options.theme = xtermTheme(); };
    window.addEventListener(THEME_CHANGED_EVENT, onThemeChange);

    const resizeObserver = new ResizeObserver(() => {
      // Never fit/resize before open (cols/rows would still be the 80x24
      // default and resize the live PTY) or while hidden (zero-size fit).
      if (!openedRef.current) return;
      if (container.classList.contains('agent-terminal-hidden')) return;
      fitAddon.fit();
      agentSocket.sendResize(agent.agentId, term.cols, term.rows);
    });
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener(THEME_CHANGED_EVENT, onThemeChange);
      resizeObserver.disconnect();
      agentSocket.unsubscribeAgent(agent.agentId);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      openedRef.current = false;
    };
  }, [agent.agentId]);

  // Hidden panes use display:none, which reports zero size — do all sizing
  // work in a frame after the browser has actually laid the container out.
  useEffect(() => {
    if (!visible) return undefined;
    const frame = requestAnimationFrame(() => {
      const fitAddon = fitRef.current;
      const term = termRef.current;
      const container = containerRef.current;
      if (!fitAddon || !term || !container) return;
      if (!openedRef.current) {
        // First reveal: open at real size, tell the PTY, then subscribe so
        // the scrollback replay parses at the true width instead of 80x24.
        term.open(container);
        openedRef.current = true;
        fitAddon.fit();
        agentSocket.sendResize(agent.agentId, term.cols, term.rows);
        agentSocket.subscribeAgent(agent.agentId, {
          onReplay: data => { term.reset(); term.write(data); },
          onData: data => term.write(data),
          onExit: code => term.write('\r\n[agent exited ' + code + ']\r\n'),
        });
      } else {
        fitAddon.fit();
        agentSocket.sendResize(agent.agentId, term.cols, term.rows);
        // Repaint rows written while the pane was display:none.
        term.refresh(0, term.rows - 1);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, agent.agentId]);

  const containerClass = visible ? 'agent-terminal' : 'agent-terminal agent-terminal-hidden';
  return <div ref={containerRef} className={containerClass} />;
}
