import React from 'react';
import type { ProjectRecord, ThreadRecord } from '../../../../shared/project/schema.js';
import type { ThreadProjection } from '../../../../shared/provider/schema.js';
import { WorkspaceEvent } from '../renderers/index.js';
import './index.css';

interface WorkspaceTimelineProps {
  project: ProjectRecord | null;
  thread: ThreadRecord | null;
  projection: ThreadProjection | null;
  loading: boolean;
  error: string | null;
}

export function WorkspaceTimeline({ project, thread, projection, loading, error }: WorkspaceTimelineProps) {
  if (loading) return <main className="workspace-timeline workspace-empty">Loading projects…</main>;
  if (!project) return <main className="workspace-timeline workspace-empty">Create a project to begin.</main>;
  if (!thread) return <main className="workspace-timeline workspace-empty">Create a thread for this project.</main>;
  return (
    <main className="workspace-timeline">
      <header className="workspace-timeline-header">
        <span>{project.name}</span>
        <span className="workspace-state"><i /> {projection ? 'ready' : 'loading'}</span>
      </header>
      <section className="workspace-thread-summary">
        <span>Conversation</span>
        <h1>{thread.title}</h1>
        <p>One objective. Provider-owned sessions. Shared Novakai context.</p>
        <div className="workspace-provider-strip">
          {thread.sessionReferences.map((reference) => (
            <span key={`${reference.provider}:${reference.sessionId}`}>{reference.provider} · {reference.sessionId.slice(0, 8)}</span>
          ))}
        </div>
      </section>
      {error && <div className="workspace-notice workspace-notice-error">{error}</div>}
      {projection?.issues.map((issue) => (
        <div className="workspace-notice" key={`${issue.reference.provider}:${issue.reference.sessionId}`}>
          <strong>{issue.reference.provider}</strong> {issue.message}
        </div>
      ))}
      <section className="workspace-event-stream" aria-label="Unified thread events">
        {projection?.events.length === 0 && (
          <div className="workspace-event-empty">Attach a Claude or Codex session.</div>
        )}
        {projection?.events.map((event) => (
          <WorkspaceEvent event={event} key={event.id} />
        ))}
      </section>
    </main>
  );
}
