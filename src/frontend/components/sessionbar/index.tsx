import React, { useEffect, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { SessionMeta } from '../index.js';
import { formatCost, formatTokens, sessionCost, sessionTokens, type CostSettings, type SessionUsage } from '../../lib/cost/index.js';
import { currentTimeZone } from '../../lib/timezone/index.js';
import './index.css';

interface SessionBarProps {
  sessions: SessionMeta[];
  selectedSession: string | null;
  onSelectSession: (id: string) => void;
  eventCount: number;
  subagentCount: number;
  sessionUsage: SessionUsage | null;
  costSettings: CostSettings;
}

function formatWhen(modified: number): string {
  return new Date(modified).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: currentTimeZone() });
}

/** Transcript header: session dropdown + title on the left, aggregate stats on the right. */
export function SessionBar({ sessions, selectedSession, onSelectSession, eventCount, subagentCount, sessionUsage, costSettings }: SessionBarProps) {
  const [open, setOpen] = useState(false);
  const selected = sessions.find((session) => session.sessionId === selectedSession) ?? null;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(keyEvent: KeyboardEvent): void {
      if (keyEvent.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function pick(sessionId: string): void {
    onSelectSession(sessionId);
    setOpen(false);
  }

  return (
    <div className="sbar">
      <button className="sbar-trigger" onClick={() => setOpen((wasOpen) => !wasOpen)}>
        {selected ? selected.sessionId.substring(0, 8) : 'sessions'}
        <ChevronDown size={12} />
      </button>
      <span className="sbar-title">{selected?.title || ''}</span>
      <span className="sbar-stats">
        {eventCount} events · {subagentCount} subagent{subagentCount === 1 ? '' : 's'}
        {sessionUsage && (
          <> · {formatTokens(sessionTokens(sessionUsage))} tok · ≈ {formatCost(sessionCost(sessionUsage, costSettings), costSettings.currency)}</>
        )}
      </span>
      {open && (
        <>
          {/* Invisible backdrop: any outside click closes the menu. */}
          <div className="sbar-backdrop" onClick={() => setOpen(false)} />
          <div className="sbar-menu">
            {sessions.length === 0 ? (
              <div className="sbar-menu-hint">
                <History size={14} /> Select an active repo (Files tab)
              </div>
            ) : (
              sessions.slice(0, 50).map((session) => (
                <div
                  key={session.sessionId}
                  className={session.sessionId === selectedSession ? 'sbar-menu-row sbar-menu-row-selected' : 'sbar-menu-row'}
                  onClick={() => pick(session.sessionId)}
                >
                  <span className="sbar-menu-id">{session.sessionId.substring(0, 8)}</span>
                  <span className="sbar-menu-title">{session.title || 'untitled'}</span>
                  <span className="sbar-menu-meta">{formatWhen(session.modified)}</span>
                  <span className="sbar-menu-meta">{(session.size / 1024).toFixed(0)}KB</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
