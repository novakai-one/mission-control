import React from 'react';
import { Terminal, Settings, Star, PanelRight } from 'lucide-react';
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
  return (
    <header className="glass-panel dash-header">
      <div className="dash-header-group">
        <Terminal size={18} color="var(--text-secondary)" />
        <span className="dash-title">
          NOVAKAI COMMAND
        </span>
        <span className={activeRepo ? 'dash-repo-label dash-repo-label-active' : 'dash-repo-label'}>
          {activeRepo ? (
            <>active repo: <Star size={11} color="var(--kind-tool)" className="dash-repo-icon" /> {toDisplayPath(activeRepo, homeDir)}</>
          ) : (
            'active repo: — none —'
          )}
        </span>
      </div>

      {/* View mode toggle — quiet buttons, active marked by a dot */}
      <div className="dash-tabs">
        {TABS.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={viewMode === mode ? 'dash-tab dash-tab-active' : 'dash-tab'}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="dash-header-group">
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
