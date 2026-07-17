// Composer foot of the AI panel. With a live agent it sends straight into the
// agent's PTY over the existing socket; without one it offers the two provider
// launch actions. The solid-gold send button is the brand's primary-action
// signature (dark glyph on gold).
import React, { useState } from 'react';
import type { ProviderId, ThreadRecord } from '../../../../shared/project/schema.js';
import type { AgentInfo } from '../../../lib/agentSocket/index.js';
import { sendInput } from '../../../lib/agentSocket/index.js';
import './index.css';

interface ChatComposerProps {
  thread: ThreadRecord | null;
  runtimeAgent: AgentInfo | null;
  onLaunch(provider: ProviderId): Promise<unknown>;
  /** Fires with the sent text so the panel can render its optimistic row. */
  onSent(text: string): void;
}

const PROVIDERS: ProviderId[] = ['claude', 'codex'];
const LAUNCH_LABELS: Record<ProviderId, string> = { claude: 'Start Claude', codex: 'Start Codex' };

function LaunchRow({ onLaunch, onError }: { onLaunch(provider: ProviderId): Promise<unknown>; onError(message: string | null): void }) {
  const [launching, setLaunching] = useState<ProviderId | null>(null);

  async function launch(provider: ProviderId): Promise<void> {
    setLaunching(provider);
    onError(null);
    try {
      await onLaunch(provider);
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="st-launch">
      {PROVIDERS.map((provider) => (
        <button key={provider} type="button" disabled={launching !== null} onClick={() => launch(provider)}>
          {launching === provider ? 'Starting…' : LAUNCH_LABELS[provider]}
        </button>
      ))}
    </div>
  );
}

export function ChatComposer({ thread, runtimeAgent, onLaunch, onSent }: ChatComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const live = runtimeAgent?.status === 'running';

  function send(): void {
    if (!runtimeAgent || !prompt.trim()) return;
    const agentId = runtimeAgent.agentId;
    const text = prompt.trim();
    sendInput(agentId, text);
    // The PTY needs the carriage return as its own write, after the text lands.
    setTimeout(() => sendInput(agentId, '\r'), 20);
    setPrompt('');
    onSent(text);
  }

  function handleKeyDown(press: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (press.key !== 'Enter' || press.shiftKey) return;
    press.preventDefault();
    send();
  }

  if (!thread) return null;

  return (
    <div className="st-ai-foot">
      {error && <div className="st-ai-error">{error}</div>}
      {runtimeAgent?.sessionError && <div className="st-ai-error">{runtimeAgent.sessionError}</div>}
      {live ? (
        <div className="st-composer">
          <div className="st-composer-ctx">to {runtimeAgent!.provider}</div>
          <textarea
            aria-label={`Message ${runtimeAgent!.provider}`}
            placeholder="Say it in your own words…"
            value={prompt}
            onChange={(change) => setPrompt(change.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="st-composer-foot">
            <span className="st-composer-hint">⏎ send</span>
            <button type="button" className="st-send" aria-label="Send" disabled={!prompt.trim()} onClick={send}>↑</button>
          </div>
        </div>
      ) : (
        <LaunchRow onLaunch={onLaunch} onError={setError} />
      )}
    </div>
  );
}
