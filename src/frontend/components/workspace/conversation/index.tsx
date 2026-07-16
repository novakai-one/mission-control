import React, { useMemo, useState } from 'react';
import type { ProjectRecord, ProviderId, ThreadRecord } from '../../../../shared/project/schema.js';
import type { ThreadProjection } from '../../../../shared/provider/schema.js';
import type { AgentInfo } from '../../../lib/agentSocket/index.js';
import { sendInput } from '../../../lib/agentSocket/index.js';
import './index.css';

interface WorkspaceConversationProps {
  project: ProjectRecord | null;
  thread: ThreadRecord | null;
  projection: ThreadProjection | null;
  runtimeAgent: AgentInfo | null;
  onLaunch(provider: ProviderId): Promise<unknown>;
  onAttach(provider: ProviderId, sessionId: string, cwd?: string): Promise<void>;
  onOpenAgent(agentId: string): void;
}

export function WorkspaceConversation(props: WorkspaceConversationProps) {
  const [provider, setProvider] = useState<ProviderId>('claude');
  const [sessionId, setSessionId] = useState('');
  const [cwd, setCwd] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [launching, setLaunching] = useState<ProviderId | null>(null);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const conversation = useMemo(
    () => props.projection?.events.filter((event) => event.kind === 'user' || event.kind === 'assistant').slice(-8) ?? [],
    [props.projection],
  );

  async function launch(selected: ProviderId): Promise<void> {
    setLaunching(selected);
    setError(null);
    try {
      await props.onLaunch(selected);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLaunching(null);
    }
  }

  function sendPrompt(): void {
    if (!props.runtimeAgent || !prompt.trim()) return;
    const agentId = props.runtimeAgent.agentId;
    sendInput(agentId, prompt.trim());
    setTimeout(() => sendInput(agentId, '\r'), 20);
    setPrompt('');
  }

  function handlePromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    sendPrompt();
  }

  async function attach(): Promise<void> {
    setAttaching(true);
    try {
      await props.onAttach(provider, sessionId, cwd || props.project?.rootPath);
      setSessionId('');
    } finally {
      setAttaching(false);
    }
  }

  return (
    <aside className="workspace-conversation">
      <header>
        <strong>{props.thread?.title || 'No thread selected'}</strong>
        <span>{props.project?.name || 'Select a project'}</span>
      </header>
      {props.thread && <div className="workspace-provider-choice" aria-label="Start provider session">
        {(['claude', 'codex'] as ProviderId[]).map((entry) => (
          <button key={entry} disabled={launching !== null} onClick={() => launch(entry)}>
            {launching === entry ? `Starting ${entry}…` : `Start ${entry}`}
          </button>
        ))}
      </div>}
      {error && <div className="workspace-runtime-error">{error}</div>}
      {props.runtimeAgent?.sessionError && (
        <div className="workspace-runtime-error">{props.runtimeAgent.sessionError}. Attach the saved session below.</div>
      )}
      {props.runtimeAgent && (
        <div className="workspace-runtime-status">
          <span><i className={props.runtimeAgent.status} /> {props.runtimeAgent.provider} · {props.runtimeAgent.status}</span>
          <button onClick={() => props.onOpenAgent(props.runtimeAgent!.agentId)}>Open terminal</button>
        </div>
      )}
      <section className="workspace-conversation-feed">
        {conversation.map((event) => (
          <article key={event.id}>
            <span>{event.kind === 'user' ? 'You' : event.provider}</span>
            <p>{event.text}</p>
          </article>
        ))}
        {props.thread && conversation.length === 0 && <p className="workspace-conversation-empty">Start a provider or attach a saved session.</p>}
      </section>
      {props.runtimeAgent?.status === 'running' && (
        <div className="workspace-prompt-form">
          <textarea aria-label="Message provider" placeholder={`Message ${props.runtimeAgent.provider}…`} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handlePromptKeyDown} />
          <button disabled={!prompt.trim()} onClick={sendPrompt}>Send</button>
        </div>
      )}
      {props.thread && (
        <details className="workspace-attach-fallback">
          <summary>Attach saved session</summary>
          <div className="workspace-attach-form">
            <select aria-label="Attachment provider" value={provider} onChange={(event) => setProvider(event.target.value as ProviderId)}>
              <option value="claude">Claude</option><option value="codex">Codex</option>
            </select>
            <input aria-label="Provider session ID" placeholder="Session ID" value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
            <input aria-label="Session workspace" placeholder={props.project?.rootPath || 'Workspace path'} value={cwd} onChange={(event) => setCwd(event.target.value)} />
            <button disabled={!sessionId.trim() || attaching} onClick={attach}>{attaching ? 'Attaching…' : 'Attach session'}</button>
          </div>
        </details>
      )}
    </aside>
  );
}
