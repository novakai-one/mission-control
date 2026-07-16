import React, { useMemo, useState } from 'react';
import type { ProjectRecord, ProviderId, ThreadRecord } from '../../../../shared/project/schema.js';
import type { ThreadProjection } from '../../../../shared/provider/schema.js';
import './index.css';

interface WorkspaceConversationProps {
  project: ProjectRecord | null;
  thread: ThreadRecord | null;
  projection: ThreadProjection | null;
  onAttach(provider: ProviderId, sessionId: string, cwd?: string): Promise<void>;
}

export function WorkspaceConversation({ project, thread, projection, onAttach }: WorkspaceConversationProps) {
  const [provider, setProvider] = useState<ProviderId>('claude');
  const [sessionId, setSessionId] = useState('');
  const [cwd, setCwd] = useState('');
  const [attaching, setAttaching] = useState(false);
  const conversation = useMemo(
    () => projection?.events.filter((event) => event.kind === 'user' || event.kind === 'assistant').slice(-8) ?? [],
    [projection],
  );

  async function attach(): Promise<void> {
    setAttaching(true);
    try {
      await onAttach(provider, sessionId, cwd || project?.rootPath);
      setSessionId('');
    } finally {
      setAttaching(false);
    }
  }

  return (
    <aside className="workspace-conversation">
      <header>
        <strong>{thread?.title || 'No thread selected'}</strong>
        <span>{project?.name || 'Select a project'}</span>
      </header>
      <div className="workspace-provider-choice" aria-label="Provider selection">
        {(['claude', 'codex'] as ProviderId[]).map((entry) => (
          <button key={entry} className={provider === entry ? 'active' : ''} onClick={() => setProvider(entry)}>{entry}</button>
        ))}
      </div>
      <section className="workspace-conversation-feed">
        {conversation.map((event) => (
          <article key={event.id}>
            <span>{event.kind === 'user' ? 'You' : event.provider}</span>
            <p>{event.text}</p>
          </article>
        ))}
        {thread && conversation.length === 0 && <p className="workspace-conversation-empty">Attach a saved provider session.</p>}
      </section>
      {thread && (
        <div className="workspace-attach-form">
          <label>Attach {provider} session</label>
          <input aria-label="Provider session ID" placeholder="Session ID" value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
          <input aria-label="Session workspace" placeholder={project?.rootPath || 'Workspace path'} value={cwd} onChange={(event) => setCwd(event.target.value)} />
          <button disabled={!sessionId.trim() || attaching} onClick={attach}>{attaching ? 'Attaching…' : 'Attach session'}</button>
        </div>
      )}
    </aside>
  );
}
