// Workspace timeline — the studio's calm center column. Events group by
// voice (one tiny mono speaker label per run), runs separate with hairlines,
// and nothing carries ornament: ink hierarchy and the amber engine do the
// pointing, never boxes or copy.
import React from 'react';
import type { ProjectRecord, ThreadRecord } from '../../../../shared/project/schema.js';
import type { ThreadProjection } from '../../../../shared/provider/schema.js';
import { WorkspaceEvent } from '../renderers/index.js';
import { groupTimelineEvents, type TimelineGroup } from '../model/index.js';
import './index.css';

interface WorkspaceTimelineProps {
  project: ProjectRecord | null;
  thread: ThreadRecord | null;
  projection: ThreadProjection | null;
  loading: boolean;
  error: string | null;
}

function QuietNote({ children }: { children: React.ReactNode }) {
  return <main className="workspace-timeline wt-quiet">{children}</main>;
}

function GroupBlock({ group }: { group: TimelineGroup }) {
  return (
    <section className="wt-group">
      <div className={group.fromYou ? 'wt-by wt-by-you' : 'wt-by'}>
        <b>{group.author}</b>
        {group.time && <> · {group.time}</>}
      </div>
      {group.events.map((event) => (
        <WorkspaceEvent event={event} key={event.id} />
      ))}
    </section>
  );
}

export function WorkspaceTimeline({ project, thread, projection, loading, error }: WorkspaceTimelineProps) {
  if (loading) return <QuietNote>Loading projects…</QuietNote>;
  if (!project) return <QuietNote>Create a project to begin.</QuietNote>;
  if (!thread) return <QuietNote>Create a thread for this project.</QuietNote>;
  const groups = groupTimelineEvents(projection?.events ?? []);
  return (
    <main className="workspace-timeline">
      <div className="wt-scroll">
        <div className="wt-stack">
          <div className="wt-label">{thread.title}</div>
          {error && <div className="wt-notice">{error}</div>}
          {projection?.issues.map((issue) => (
            <div className="wt-notice" key={`${issue.reference.provider}:${issue.reference.sessionId}`}>
              {issue.reference.provider} · {issue.message}
            </div>
          ))}
          {groups.length === 0 && <div className="wt-empty">Attach a Claude or Codex session.</div>}
          {groups.map((group) => (
            <GroupBlock group={group} key={group.groupKey} />
          ))}
        </div>
      </div>
    </main>
  );
}
