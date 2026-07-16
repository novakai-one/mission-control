import React from 'react';
import type { CanonicalEvent, CanonicalEventKind } from '../../../../shared/provider/schema.js';
import './index.css';

interface EventRendererProps {
  event: CanonicalEvent;
}

function EventFrame({ event, children }: EventRendererProps & { children?: React.ReactNode }) {
  return (
    <article className={`workspace-event workspace-event-${event.kind}`}>
      <div><span>{event.provider}</span><time>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</time></div>
      {children ?? <p>{event.text || event.rawType}</p>}
    </article>
  );
}

function DefaultEvent({ event }: EventRendererProps) {
  return <EventFrame event={event} />;
}

function ApprovalEvent({ event }: EventRendererProps) {
  const approval = event.approval;
  return (
    <EventFrame event={event}>
      <span className="workspace-event-label">Permission</span>
      <h2>{event.text || 'Provider approval requested'}</h2>
      {approval?.command && <code>{approval.command}</code>}
      <dl>
        <dt>Writes</dt>
        <dd>{approval?.writes.length ? approval.writes.join(' · ') : 'No declared workspace writes'}</dd>
        <dt>Does not</dt>
        <dd>Publish, message, or leave this workspace</dd>
      </dl>
      <p>Review and decide in the active provider terminal.</p>
    </EventFrame>
  );
}

function TaskEvent({ event }: EventRendererProps) {
  const tasks = event.tasks ?? [];
  return (
    <EventFrame event={event}>
      <span className="workspace-event-label">Tasks</span>
      <ul className="workspace-task-list">
        {tasks.map((task) => (
          <li key={task.id} data-status={task.status}>
            <i />{task.status === 'in_progress' ? (task.activeForm || task.subject) : task.subject}
          </li>
        ))}
      </ul>
    </EventFrame>
  );
}

const renderers: Record<CanonicalEventKind, React.ComponentType<EventRendererProps>> = {
  user: DefaultEvent,
  assistant: DefaultEvent,
  tool: DefaultEvent,
  approval: ApprovalEvent,
  task: TaskEvent,
  system: DefaultEvent,
};

// One malformed event must cost one timeline row, never the whole app —
// providers own the transcript format and can change it without notice.
class EventBoundary extends React.Component<EventRendererProps & { children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error(`workspace event ${this.props.event.id} failed to render`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { event } = this.props;
    return (
      <article className="workspace-event workspace-event-failed">
        <div><span>{event.provider}</span></div>
        <p>Unrenderable {event.rawType} event</p>
      </article>
    );
  }
}

/** Render one canonical event through its lifecycle-owned renderer. */
export function WorkspaceEvent({ event }: EventRendererProps) {
  const Renderer = renderers[event.kind] ?? DefaultEvent; // unknown kinds degrade, not crash
  return (
    <EventBoundary event={event}>
      <Renderer event={event} />
    </EventBoundary>
  );
}
