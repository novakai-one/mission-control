import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Square, ChevronRight } from 'lucide-react';

export interface BuildStep {
  id: string;
  agentId: string;
  timestamp: string;
  type: 'thought' | 'action' | 'command' | 'stdout' | 'spawn';
  content: string;
}

export interface BuildMessage {
  event: string;
  payload: any;
}

interface TerminalPanelProps {
  selectedProject: string | null;
  onBuildMessage: (msg: BuildMessage) => void;
  buildMessages: BuildMessage[];
  wsReady: boolean;
}

export function TerminalPanel({ selectedProject, onBuildMessage, buildMessages, wsReady }: TerminalPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [llmType, setLlmType] = useState<'claude' | 'gemini'>('claude');
  const [buildId, setBuildId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const outputRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [buildMessages]);

  // Load saved API key from config
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(config => {
        if (config.geminiApiKey) setApiKey(config.geminiApiKey);
        if (config.claudeCliPath === undefined && !config.geminiApiKey) {
          setShowKeyInput(true);
        }
      })
      .catch(() => setShowKeyInput(true));
  }, []);

  // Re-enable the input when this build finishes. Nothing else listened for completion, so it stayed stuck.
  useEffect(() => {
    if (!buildId) return;
    const last = buildMessages[buildMessages.length - 1];
    if (last && (last.event === 'build-completed' || last.event === 'build-stopped') && last.payload?.build?.id === buildId) {
      setIsRunning(false);
    }
  }, [buildMessages, buildId]);

  const handleStartBuild = async () => {
    if (!prompt.trim()) return;

    try {
      const res = await fetch('/api/builds/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          llmType,
          geminiApiKey: llmType === 'gemini' ? apiKey : undefined,
        }),
      });
      const data = await res.json();
      setBuildId(data.buildId);
      setIsRunning(true);
      setPrompt('');
    } catch (e) {
      console.error('Failed to start build:', e);
    }
  };

  const handleStopBuild = async () => {
    if (!buildId) return;
    try {
      await fetch('/api/builds/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildId }),
      });
      setIsRunning(false);
      setBuildId(null);
    } catch (e) {
      console.error('Failed to stop build:', e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isRunning) return;
      handleStartBuild();
    }
  };

  // Filter build-related messages
  const buildOutput = buildMessages.filter(m =>
    m.event === 'agent-stdout' ||
    m.event === 'agent-step' ||
    m.event === 'build-started' ||
    m.event === 'build-stopped' ||
    m.event === 'build-completed' ||
    m.event === 'agent-spawned'
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '420px',
      backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 1rem', borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={14} color={isRunning ? '#5d7c9a' : 'var(--text-muted)'} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            COMMAND CENTER
          </span>
          {isRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div className="blink-dot" style={{ width: '6px', height: '6px' }} />
              <span style={{ fontSize: '0.6rem', color: '#5d7c9a' }}>running</span>
            </div>
          )}
        </div>
        <select
          value={llmType}
          onChange={(e) => {
            const v = e.target.value as 'claude' | 'gemini';
            setLlmType(v);
            if (v === 'gemini' && !apiKey) setShowKeyInput(true);
          }}
          style={{
            backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)', borderRadius: '4px',
            padding: '0.2rem 0.4rem', fontSize: '0.65rem', outline: 'none',
          }}
        >
          <option value="claude">Claude CLI</option>
          <option value="gemini">Gemini API</option>
        </select>
      </div>

      {/* API Key input for Gemini */}
      {showKeyInput && llmType === 'gemini' && (
        <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Gemini API Key"
            style={{
              width: '100%', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              border: '1px solid var(--border-color)', borderRadius: '4px',
              padding: '0.35rem 0.6rem', fontSize: '0.65rem', outline: 'none', fontFamily: 'var(--font-mono)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
              Key is sent to the backend and used for this session only.
            </span>
            <button
              onClick={() => setShowKeyInput(false)}
              style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              done
            </button>
          </div>
        </div>
      )}

      {/* Output area */}
      <div ref={outputRef} style={{
        flex: 1, overflowY: 'auto', padding: '0.6rem',
        fontFamily: 'var(--font-mono)', fontSize: '0.65rem', lineHeight: '1.4rem',
      }}>
        {buildOutput.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '0.6rem',
          }}>
            <Terminal size={24} strokeWidth={1.5} />
            <span style={{ fontSize: '0.7rem' }}>Enter a prompt below to start a build</span>
            {selectedProject && (
              <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
                Workspace: {selectedProject.replace(/-/g, '/')}
              </span>
            )}
          </div>
        ) : (
          buildOutput.map((msg, i) => <BuildMessageRow key={i} msg={msg} />)
        )}
      </div>

      {/* Input area */}
      <div style={{
        borderTop: '1px solid var(--border-color)', padding: '0.5rem',
        backgroundColor: 'var(--bg-tertiary)',
      }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-end' }}>
          <ChevronRight size={14} color={isRunning ? 'var(--text-muted)' : '#5d7c9a'} style={{ marginBottom: '0.4rem', flexShrink: 0 }} />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder={isRunning ? 'Build in progress...' : 'Enter build prompt...'}
            rows={2}
            style={{
              flex: 1, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
              border: '1px solid var(--border-color)', borderRadius: '4px',
              padding: '0.35rem 0.5rem', fontSize: '0.68rem', outline: 'none',
              fontFamily: 'var(--font-mono)', resize: 'none',
              opacity: isRunning ? 0.5 : 1,
            }}
          />
          {isRunning ? (
            <button
              onClick={handleStopBuild}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                backgroundColor: 'var(--status-failed)', border: '1px solid var(--border-active)',
                color: '#c97a7a', borderRadius: '4px', padding: '0.4rem 0.6rem',
                fontSize: '0.65rem', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <Square size={12} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStartBuild}
              disabled={!prompt.trim() || (llmType === 'gemini' && !apiKey)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                backgroundColor: (!prompt.trim() || (llmType === 'gemini' && !apiKey)) ? 'var(--bg-primary)' : 'var(--status-running)',
                border: '1px solid var(--border-color)',
                color: (!prompt.trim() || (llmType === 'gemini' && !apiKey)) ? 'var(--text-muted)' : '#7a9ec9',
                borderRadius: '4px', padding: '0.4rem 0.6rem',
                fontSize: '0.65rem', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <Send size={12} />
              Run
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BuildMessageRow({ msg }: { msg: BuildMessage }) {
  const { event, payload } = msg;

  if (event === 'build-started') {
    return (
      <div style={{ color: '#7a9ec9', marginBottom: '0.3rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>[{new Date().toLocaleTimeString()}]</span>{' '}
        ▸ Build started: <span style={{ color: 'var(--text-secondary)' }}>{payload.build?.id}</span>
      </div>
    );
  }

  if (event === 'build-completed') {
    const status = payload.build?.status;
    const color = status === 'success' ? '#7ac98f' : '#c97a7a';
    return (
      <div style={{ color, marginBottom: '0.3rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>[{new Date().toLocaleTimeString()}]</span>{' '}
        ▸ Build {status}: <span style={{ color: 'var(--text-secondary)' }}>{payload.build?.id}</span>
      </div>
    );
  }

  if (event === 'build-stopped') {
    return (
      <div style={{ color: '#c97a7a', marginBottom: '0.3rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>[{new Date().toLocaleTimeString()}]</span>{' '}
        ▸ Build stopped
      </div>
    );
  }

  if (event === 'agent-spawned') {
    return (
      <div style={{ color: '#c9b57a', marginBottom: '0.3rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>[{new Date().toLocaleTimeString()}]</span>{' '}
        ⎇ Spawned subagent: <span style={{ color: 'var(--text-secondary)' }}>{payload.subagent?.role}</span>
      </div>
    );
  }

  if (event === 'agent-step') {
    const step = payload.step;
    const icon = step?.type === 'thought' ? '◇' : step?.type === 'action' ? '▸' : step?.type === 'stdout' ? '│' : '·';
    const color = step?.type === 'thought' ? '#9a7ac9' : step?.type === 'action' ? '#c9b57a' : 'var(--text-secondary)';
    return (
      <div style={{ color, marginBottom: '0.2rem', paddingLeft: '0.5rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>{icon}</span>{' '}
        <span style={{ color: 'var(--text-muted)' }}>[{step?.agentId?.substring(0, 12)}]</span>{' '}
        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{step?.content?.substring(0, 500)}</span>
      </div>
    );
  }

  if (event === 'agent-stdout') {
    return (
      <div style={{ color: 'var(--text-secondary)', marginBottom: '0.2rem', paddingLeft: '0.5rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>│</span>{' '}
        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{payload.content?.substring(0, 500)}</span>
      </div>
    );
  }

  return null;
}
