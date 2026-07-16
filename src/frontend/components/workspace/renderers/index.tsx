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

const renderers: Record<CanonicalEventKind, React.ComponentType<EventRendererProps>> = {
  user: DefaultEvent,
  assistant: DefaultEvent,
  tool: DefaultEvent,
  approval: ApprovalEvent,
  system: DefaultEvent,
};

/** Render one canonical event through its lifecycle-owned renderer. */
export function WorkspaceEvent({ event }: EventRendererProps) {
  const Renderer = renderers[event.kind];
  return <Renderer event={event} />;
}
