import React, { useState, useEffect } from 'react';
import { Settings, X, Key, Terminal, FolderOpen, Save, Check } from 'lucide-react';
import './index.css';

interface AppConfig {
  workspacePath: string;
  geminiApiKey?: string;
  claudeCliPath?: string;
  serverPort: number;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [geminiKey, setGeminiKey] = useState('');
  const [claudePath, setClaudePath] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setGeminiKey(data.geminiApiKey || '');
        setClaudePath(data.claudeCliPath || 'claude');
        setWorkspace(data.workspacePath || '');
      })
      .catch(e => setError('Failed to load config: ' + e.message));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          geminiApiKey: geminiKey,
          claudeCliPath: claudePath,
          workspacePath: workspace,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const res = await fetch('/api/browse', { method: 'POST' });
      const data = await res.json();
      if (data.path) setWorkspace(data.path);
    } catch {
      // Folder picker cancelled or failed
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} className="set-backdrop" />
      {/* Panel */}
      <div className="set-panel">
        {/* Header */}
        <div className="set-header">
          <div className="set-header-left">
            <Settings size={18} color="var(--text-secondary)" />
            <span className="set-title">Settings</span>
          </div>
          <button onClick={onClose} className="set-close-btn">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="set-body">
          {error && <div className="set-error">{error}</div>}

          {/* Workspace Path */}
          <SettingField
            icon={<FolderOpen size={14} color="var(--text-secondary)" />}
            label="Workspace Path"
            description="Root directory for agent operations"
          >
            <div className="set-row">
              <input
                type="text"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                className="u-input set-input"
              />
              <button
                onClick={handleBrowse}
                className="u-btn set-btn set-btn-browse"
              >
                Browse
              </button>
            </div>
          </SettingField>

          {/* Gemini API Key */}
          <SettingField
            icon={<Key size={14} color="var(--text-secondary)" />}
            label="Gemini API Key"
            description="Google Gemini API key for AI agent execution"
          >
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza..."
              className="u-input set-input"
            />
            {geminiKey && (
              <span className="set-key-ok">
                <Check size={10} /> Key configured
              </span>
            )}
          </SettingField>

          {/* Claude CLI Path */}
          <SettingField
            icon={<Terminal size={14} color="var(--text-secondary)" />}
            label="Claude CLI Path"
            description="Path to the Claude CLI executable"
          >
            <input
              type="text"
              value={claudePath}
              onChange={(e) => setClaudePath(e.target.value)}
              placeholder="claude"
              className="u-input set-input"
            />
          </SettingField>

          {/* Server info */}
          {config && (
            <div className="set-server-info">
              Backend port: {config.serverPort}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="set-footer">
          <button onClick={onClose} className="u-btn set-btn set-btn-footer">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="u-btn set-btn set-btn-footer set-btn-save"
          >
            {saved ? (
              <span className="set-icon-label">
                <Check size={14} /> Saved
              </span>
            ) : (
              <span className="set-icon-label">
                <Save size={14} /> Save
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function SettingField({ icon, label, description, children }: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="set-field">
      <div className="set-field-label-row">
        {icon}
        <span className="set-field-label">{label}</span>
      </div>
      <span className="set-field-desc set-field-indent">{description}</span>
      <div className="set-field-indent">{children}</div>
    </div>
  );
}
