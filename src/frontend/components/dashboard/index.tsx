import React from 'react';
import { Terminal, Radio, Network, Shield, Settings, Bug, FolderTree, Star, PanelRight } from 'lucide-react';
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

const TABS: { mode: ViewMode; label: string; icon: React.ComponentType<{ size?: number | string }> }[] = [
  { mode: 'files', label: 'Files', icon: FolderTree },
  { mode: 'agents', label: 'Agents', icon: Radio },
  { mode: 'transcript', label: 'Transcript', icon: Network },
  { mode: 'ruleset', label: 'Ruleset', icon: Shield },
  { mode: 'debug', label: 'Debug', icon: Bug },
];

export function AppHeader({ eventCount, viewMode, onViewModeChange, onOpenSettings, activeRepo, homeDir, viewPanelOpen, onToggleViewPanel }: AppHeaderProps) {
  return (
    <header className="glass-panel" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.8rem 1.5rem', borderBottom: '1px solid var(--border-color)',
      backgroundColor: 'var(--bg-secondary)', height: '64px', borderRadius: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Terminal size={18} color="var(--text-secondary)" />
        <span style={{ fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.05rem', color: 'var(--text-primary)' }}>
          MISSION CONTROL
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem',
          fontSize: '0.7rem', color: activeRepo ? 'var(--text-secondary)' : 'var(--text-muted)',
        }}>
          {activeRepo ? (
            <>active repo: <Star size={11} color="var(--kind-tool)" style={{ display: 'inline' }} /> {toDisplayPath(activeRepo, homeDir)}</>
          ) : (
            'active repo: — none —'
          )}
        </span>
      </div>

      {/* View mode toggle */}
      <div style={{
        display: 'flex', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-color)', padding: '2px',
      }}>
        {TABS.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={viewMode === mode ? 'dash-tab dash-tab-active' : 'dash-tab'}
          >
            <Icon size={12} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{eventCount} events</span>
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
