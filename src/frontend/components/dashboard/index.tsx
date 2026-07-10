import React from 'react';
import { Terminal, Radio, Network, Shield, Settings, Bug, FolderTree, Star } from 'lucide-react';
import { ProjectInfo, toDisplayPath } from '../index.js';

interface AppHeaderProps {
  projects: ProjectInfo[];
  selectedProject: string | null;
  onSelectProject: (dir: string) => void;
  liveMode: boolean;
  eventCount: number;
  viewMode: 'files' | 'transcript' | 'ruleset' | 'debug';
  onViewModeChange: (mode: 'files' | 'transcript' | 'ruleset' | 'debug') => void;
  onOpenSettings: () => void;
  activeRepo: string | null;
  homeDir: string | null;
}

export function AppHeader({ projects, selectedProject, onSelectProject, liveMode, eventCount, viewMode, onViewModeChange, onOpenSettings, activeRepo, homeDir }: AppHeaderProps) {
  return (
    <header className="glass-panel" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.8rem 1.5rem', borderBottom: '1px solid var(--border-color)',
      backgroundColor: 'var(--bg-secondary)', height: '64px', borderRadius: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Terminal size={18} color="#8a8d96" />
        <span style={{ fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.05rem', color: 'var(--text-primary)' }}>
          MISSION CONTROL
        </span>
        {liveMode && viewMode === 'transcript' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem' }}>
            <div className="blink-dot" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>live</span>
          </div>
        )}
        <span style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem',
          fontSize: '0.7rem', color: activeRepo ? 'var(--text-secondary)' : 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          {activeRepo ? (
            <>active repo: <Star size={11} color="#c9b57a" style={{ display: 'inline' }} /> {toDisplayPath(activeRepo, homeDir)}</>
          ) : (
            'active repo: — none —'
          )}
        </span>
      </div>

      {/* View mode toggle */}
      <div style={{
        display: 'flex', backgroundColor: 'var(--bg-primary)', borderRadius: '6px',
        border: '1px solid var(--border-color)', padding: '2px',
      }}>
        <button
          onClick={() => onViewModeChange('files')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.35rem 0.8rem', borderRadius: '4px',
            backgroundColor: viewMode === 'files' ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none', color: viewMode === 'files' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '0.7rem', fontWeight: viewMode === 'files' ? 600 : 400, cursor: 'pointer',
          }}
        >
          <FolderTree size={12} />
          <span>Files</span>
        </button>
        <button
          onClick={() => onViewModeChange('transcript')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.35rem 0.8rem', borderRadius: '4px',
            backgroundColor: viewMode === 'transcript' ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none', color: viewMode === 'transcript' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '0.7rem', fontWeight: viewMode === 'transcript' ? 600 : 400, cursor: 'pointer',
          }}
        >
          <Network size={12} />
          <span>Transcript</span>
        </button>
        <button
          onClick={() => onViewModeChange('ruleset')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.35rem 0.8rem', borderRadius: '4px',
            backgroundColor: viewMode === 'ruleset' ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none', color: viewMode === 'ruleset' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '0.7rem', fontWeight: viewMode === 'ruleset' ? 600 : 400, cursor: 'pointer',
          }}
        >
          <Shield size={12} />
          <span>Ruleset</span>
        </button>
        <button
          onClick={() => onViewModeChange('debug')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.35rem 0.8rem', borderRadius: '4px',
            backgroundColor: viewMode === 'debug' ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none', color: viewMode === 'debug' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '0.7rem', fontWeight: viewMode === 'debug' ? 600 : 400, cursor: 'pointer',
          }}
        >
          <Bug size={12} />
          <span>Debug</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{eventCount} events</span>
        <select
          value={selectedProject || ''}
          onChange={(e) => onSelectProject(e.target.value)}
          style={{
            backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)', borderRadius: '4px',
            padding: '0.45rem 0.8rem', fontSize: '0.75rem', outline: 'none', minWidth: '300px'
          }}
        >
          <option value="">Select project...</option>
          {projects.map((p) => (
            <option key={p.dirName} value={p.dirName}>
              {p.displayPath}
            </option>
          ))}
        </select>
        <button
          onClick={onOpenSettings}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)', borderRadius: '4px',
            padding: '0.4rem', cursor: 'pointer',
          }}
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  );
}
