import React, { useState, useEffect } from 'react';
import { Settings, X, Key, Terminal, FolderOpen, Save, Check } from 'lucide-react';

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
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          backdropFilter: 'blur(2px)',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '520px', maxHeight: '80vh', overflowY: 'auto',
        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-active)',
        borderRadius: 'var(--radius)', zIndex: 1001,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Settings size={18} color="var(--text-secondary)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Settings
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '0.2rem',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {error && (
            <div style={{
              padding: '0.6rem 0.8rem', backgroundColor: 'var(--status-failed)',
              border: '1px solid color-mix(in srgb, var(--kind-error) 27%, transparent)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.7rem', color: 'var(--kind-error)',
            }}>
              {error}
            </div>
          )}

          {/* Workspace Path */}
          <SettingField
            icon={<FolderOpen size={14} color="var(--text-secondary)" />}
            label="Workspace Path"
            description="Root directory for agent operations"
          >
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                style={inputStyle}
              />
              <button
                className="mc-btn"
                onClick={handleBrowse}
                style={{
                  ...btnStyle, flexShrink: 0, padding: '0.4rem 0.6rem',
                }}
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
              style={inputStyle}
            />
            {geminiKey && (
              <span style={{ fontSize: '0.55rem', color: 'var(--kind-result)', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
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
              style={inputStyle}
            />
          </SettingField>

          {/* Server info */}
          {config && (
            <div style={{
              padding: '0.6rem 0.8rem', backgroundColor: 'var(--bg-primary)',
              borderRadius: 'var(--radius-sm)', fontSize: '0.6rem', color: 'var(--text-muted)',
            }}>
              Backend port: {config.serverPort}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'flex-end', gap: '0.6rem',
        }}>
          <button className="mc-btn" onClick={onClose} style={{ ...btnStyle, padding: '0.5rem 1rem' }}>
            Cancel
          </button>
          <button
            className="mc-btn"
            onClick={handleSave}
            disabled={saving}
            style={{
              ...btnStyle, padding: '0.5rem 1rem',
              backgroundColor: 'var(--status-running)', color: 'var(--kind-assistant)',
              borderColor: 'var(--border-active)',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saved ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Check size={14} /> Saved
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Save size={14} /> Save
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
  padding: '0.45rem 0.7rem', fontSize: '0.72rem', outline: 'none',
};

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
  fontSize: '0.68rem', cursor: 'pointer',
};

function SettingField({ icon, label, description, children }: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {icon}
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: '1.1rem' }}>{description}</span>
      <div style={{ marginLeft: '1.1rem' }}>{children}</div>
    </div>
  );
}
