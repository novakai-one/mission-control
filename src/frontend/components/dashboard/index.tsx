import React, { useState, useEffect } from 'react';
import { Play, Square, Settings, Key, HelpCircle, Terminal } from 'lucide-react';
import { AppConfig, BuildRecord } from '../index.js';

interface AppHeaderProps {
  config: AppConfig | null;
  onSetConfig: (config: AppConfig) => void;
  activeBuild: BuildRecord | null;
  onStartBuild: (prompt: string, llmType: 'claude' | 'gemini') => void;
  onStopBuild: () => void;
}

export function AppHeader({ config, onSetConfig, activeBuild, onStartBuild, onStopBuild }: AppHeaderProps) {
  const [prompt, setPrompt] = useState('');
  const [llmType, setLlmType] = useState<'claude' | 'gemini'>('claude');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [stopConfirm, setStopConfirm] = useState(false);

  useEffect(() => {
    if (config) {
      setApiKey(config.geminiApiKey || '');
      setWorkspace(config.workspacePath || '');
    }
  }, [config]);

  const handleRun = () => {
    if (!prompt.trim()) return;
    onStartBuild(prompt, llmType);
    setPrompt('');
  };

  const handleStopWithConfirm = () => {
    if (!stopConfirm) {
      setStopConfirm(true);
      return;
    }
    onStopBuild();
    setStopConfirm(false);
  };

  const handleBrowse = () => {
    fetch('/api/browse', { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (data.path) {
          setWorkspace(data.path);
        }
      })
      .catch(() => {});
  };

  const handleSaveSettings = () => {
    const updatedConfig = {
      workspacePath: workspace || process.cwd(),
      geminiApiKey: apiKey,
      serverPort: config?.serverPort || 3031
    };
    onSetConfig(updatedConfig);
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedConfig)
    }).catch(() => {});
    setShowSettings(false);
  };

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
        {activeBuild?.status === 'running' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem' }}>
            <div className="blink-dot" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>active run</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 0.6 }}>
        <input
          type="text"
          placeholder="Ask agents to build, edit, or search files..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRun()}
          disabled={activeBuild?.status === 'running'}
          style={{
            flex: 1, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)', borderRadius: '4px',
            padding: '0.45rem 1rem', fontSize: '0.8rem', outline: 'none'
          }}
        />

        <select
          value={llmType}
          onChange={(e) => setLlmType(e.target.value as any)}
          disabled={activeBuild?.status === 'running'}
          style={{
            backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)', borderRadius: '4px',
            padding: '0.45rem 0.8rem', fontSize: '0.8rem', outline: 'none'
          }}
        >
          <option value="claude">Claude Code CLI</option>
          <option value="gemini">Gemini Flash API</option>
        </select>

        {activeBuild?.status === 'running' ? (
          <button
            onClick={handleStopWithConfirm}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              backgroundColor: stopConfirm ? '#7a2d32' : 'var(--status-failed)',
              color: 'var(--text-primary)', border: 'none', borderRadius: '4px',
              padding: '0.45rem 1rem', fontSize: '0.8rem', cursor: 'pointer',
              fontWeight: stopConfirm ? 600 : 500
            }}
          >
            <Square size={12} fill="currentColor" />
            {stopConfirm ? 'Are you sure?' : 'Stop'}
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={!prompt.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              backgroundColor: prompt.trim() ? 'var(--accent-color)' : 'var(--bg-primary)',
              color: prompt.trim() ? 'var(--text-primary)' : 'var(--text-muted)',
              border: prompt.trim() ? 'none' : '1px solid var(--border-color)',
              borderRadius: '4px', padding: '0.45rem 1rem', fontSize: '0.8rem',
              cursor: prompt.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            <Play size={12} fill="currentColor" />
            Run
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center'
          }}
        >
          <Settings size={18} />
        </button>
      </div>

      {showSettings && (
        <div className="glass-panel glow-selected" style={{
          position: 'absolute', top: '74px', right: '1.5rem', zIndex: 100,
          padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem',
          width: '320px', backgroundColor: 'var(--bg-tertiary)'
        }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>System Settings</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Gemini API Key</label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--border-color)', borderRadius: '4px',
                padding: '0.4rem 0.6rem', fontSize: '0.75rem', outline: 'none'
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Target Workspace Path</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="/Users/username/project"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                style={{
                  flex: 1, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: '4px',
                  padding: '0.4rem 0.6rem', fontSize: '0.75rem', outline: 'none'
                }}
              />
              <button
                onClick={handleBrowse}
                style={{
                  backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)', borderRadius: '4px',
                  padding: '0 0.6rem', fontSize: '0.7rem', cursor: 'pointer'
                }}
              >
                Browse...
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.3rem' }}>
            <button
              onClick={() => setShowSettings(false)}
              style={{
                backgroundColor: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)', borderRadius: '4px',
                padding: '0.35rem 0.8rem', fontSize: '0.75rem', cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSettings}
              style={{
                backgroundColor: 'var(--accent-color)', color: 'var(--text-primary)',
                border: 'none', borderRadius: '4px',
                padding: '0.35rem 0.8rem', fontSize: '0.75rem', cursor: 'pointer'
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
