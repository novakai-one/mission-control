import React from 'react';
import { Terminal, Radio, Network, Shield, Settings, Bug, FolderTree, Star, MessageSquare } from 'lucide-react';
import { toDisplayPath } from '../index.js';
import './index.css';

interface AppHeaderProps {
  liveMode: boolean;
  eventCount: number;
  viewMode: 'files' | 'agents' | 'transcript' | 'livechat' | 'ruleset' | 'debug';
  onViewModeChange: (mode: 'files' | 'agents' | 'transcript' | 'livechat' | 'ruleset' | 'debug') => void;
  onOpenSettings: () => void;
  activeRepo: string | null;
  homeDir: string | null;
}

export function AppHeader({ liveMode, eventCount, viewMode, onViewModeChange, onOpenSettings, activeRepo, homeDir }: AppHeaderProps) {
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
          onClick={() => onViewModeChange('agents')}
          className={viewMode === 'agents' ? 'dash-tab dash-tab-active' : 'dash-tab'}
        >
          <Radio size={12} />
          <span>Agents</span>
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
          onClick={() => onViewModeChange('livechat')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.35rem 0.8rem', borderRadius: '4px',
            backgroundColor: viewMode === 'livechat' ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none', color: viewMode === 'livechat' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '0.7rem', fontWeight: viewMode === 'livechat' ? 600 : 400, cursor: 'pointer',
          }}
        >
          <MessageSquare size={12} />
          <span>Live Chat</span>
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
