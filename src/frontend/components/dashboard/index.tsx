import React from 'react';
import { Settings, PanelRight } from 'lucide-react';
import { toDisplayPath } from '../index.js';
import './index.css';

type ViewMode = 'files' | 'agents' | 'transcript' | 'ruleset' | 'debug';

interface AppHeaderProps {
  eventCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenSettings: () => void;
  activeRepo: string | null;
  homeDir: string | null;
  viewPanelOpen: boolean;
  onToggleViewPanel: () => void;
}

const TABS: { mode: ViewMode; label: string }[] = [
  { mode: 'files', label: 'Files' },
  { mode: 'agents', label: 'Agents' },
  { mode: 'transcript', label: 'Transcript' },
  { mode: 'ruleset', label: 'Ruleset' },
  { mode: 'debug', label: 'Debug' },
];

export function AppHeader({ eventCount, viewMode, onViewModeChange, onOpenSettings, activeRepo, homeDir, viewPanelOpen, onToggleViewPanel }: AppHeaderProps) {
  const repoName = activeRepo ? toDisplayPath(activeRepo, homeDir).split('/').pop() : null;
  return (
    <header className="glass-panel dash-header">
      <div className="dash-header-group">
        <span className="dash-glyph">&gt;_</span>
        <span className="dash-title">NOVAKAI COMMAND</span>
      </div>

      {/* View mode toggle — pill tabs, active is a filled hairline pill */}
      <div className="dash-tabs">
        {TABS.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={viewMode === mode ? 'dash-tab dash-tab-active' : 'dash-tab'}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="dash-header-group">
        {repoName && (
          <span className="dash-repo-meta">active repo · {repoName}</span>
        )}
        <span className="dash-event-count">{eventCount} events</span>
        <button
          onClick={onOpenSettings}
          className="viewpanel-toggle"
          title="Settings"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={onToggleViewPanel}
          className={viewPanelOpen ? 'viewpanel-toggle viewpanel-toggle-active' : 'viewpanel-toggle'}
          title="View panel"
        >
          <PanelRight size={14} />
        </button>
      </div>
    </header>
  );
}
