import React from 'react';
import { Settings, PanelRight } from 'lucide-react';
import './index.css';

export type ViewMode = 'workspace' | 'files' | 'agents' | 'transcript' | 'ruleset' | 'debug';

interface AppHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenSettings: () => void;
  viewPanelOpen: boolean;
  onToggleViewPanel: () => void;
}

const TABS: { mode: ViewMode; label: string }[] = [
  { mode: 'workspace', label: 'Projects' },
  { mode: 'files', label: 'Files' },
  { mode: 'agents', label: 'Agents' },
  { mode: 'transcript', label: 'Transcript' },
  { mode: 'ruleset', label: 'Ruleset' },
  { mode: 'debug', label: 'Debug' },
];

export function AppHeader({ viewMode, onViewModeChange, onOpenSettings, viewPanelOpen, onToggleViewPanel }: AppHeaderProps) {
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
        <button
          onClick={onOpenSettings}
          className="viewpanel-toggle"
          title="Settings"
        >
          <Settings size={15} />
        </button>
        <button
          onClick={onToggleViewPanel}
          className={viewPanelOpen ? 'viewpanel-toggle viewpanel-toggle-active' : 'viewpanel-toggle'}
          title="View panel"
        >
          <PanelRight size={15} />
        </button>
      </div>
    </header>
  );
}
