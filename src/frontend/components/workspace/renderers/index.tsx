// Per-kind renderers for canonical workspace events, in the studio's calm
// grammar: speech is plain ink, tool/system rows are quiet mono one-liners
// that reveal their payload on click (~700ms), tasks are a dotted list, and
// an approval is the one bordered object — gold only while the amber engine
// says it is THE thing needing Chris, sage for a breath once it resolves.
import React, { useState } from 'react';
import type { CanonicalEvent, CanonicalEventKind } from '../../../../shared/provider/schema.js';
import { approvalItemId, useAttention } from '../../../lib/attention/index.js';
import { eventKindLabel, isDense, summaryLine } from '../model/index.js';
import './index.css';

interface EventRendererProps {
  event: CanonicalEvent;
}

function SpeechEvent({ event }: EventRendererProps) {
  return <p className={event.kind === 'user' ? 'wt-say wt-say-you' : 'wt-say'}>{event.text || event.rawType}</p>;
}

/** Tool and system rows: one quiet mono line; dense payloads expand on click. */
function QuietEvent({ event }: EventRendererProps) {
  const [open, setOpen] = useState(false);
  const text = event.text || event.rawType;
  const dense = isDense(text);
  return (
    <div className={open ? 'wt-row wt-row-open' : 'wt-row'}>
      <button type="button" className="wt-row-line" disabled={!dense} onClick={() => setOpen(!open)}>
        <span className="wt-kind">{eventKindLabel(event)}</span>
        <span className="wt-line">{summaryLine(text)}</span>
        {dense && <span className="wt-more">{open ? '−' : '+'}</span>}
      </button>
      {dense && (
        <div className="wt-reveal">
          <div className="wt-reveal-clip">
            <pre>{text}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function approvalStateLabel(holdsGold: boolean, settling: boolean): string {
  if (holdsGold) return 'Needs you';
  return settling ? 'Done' : 'Permission';
}

function ApprovalEvent({ event }: EventRendererProps) {
  // Gold is granted by the amber engine, never claimed locally.
  const attention = useAttention();
  const holdsGold = attention.goldId === approvalItemId(event.id);
  const settling = attention.settlingId === approvalItemId(event.id);
  const writes = event.approval?.writes ?? [];
  const blockClass = `wt-decide${holdsGold ? ' wt-decide-needs' : ''}${settling ? ' wt-decide-settling' : ''}`;
  return (
    <div className={blockClass}>
      <div className="wt-decide-head">
        <span className="wt-decide-k">{approvalStateLabel(holdsGold, settling)}</span>
        {writes.length > 0 && <span className="wt-decide-g">writes {writes.length} {writes.length === 1 ? 'file' : 'files'}</span>}
      </div>
      <div className="wt-decide-cmd">
        {event.approval?.command || event.text || 'Provider approval requested'}
        {event.approval?.reason && <span> — {event.approval.reason}</span>}
      </div>
    </div>
  );
}

function TaskEvent({ event }: EventRendererProps) {
  return (
    <div className="wt-tasks">
      {(event.tasks ?? []).map((task) => (
        <div key={task.id} className="wt-task" data-status={task.status}>
          <i />
          {task.status === 'in_progress' ? (task.activeForm || task.subject) : task.subject}
        </div>
      ))}
    </div>
  );
}

const renderers: Record<CanonicalEventKind, React.ComponentType<EventRendererProps>> = {
  user: SpeechEvent,
  assistant: SpeechEvent,
  tool: QuietEvent,
  approval: ApprovalEvent,
  task: TaskEvent,
  system: QuietEvent,
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
    return <p className="wt-failed">Unrenderable {this.props.event.rawType} event</p>;
  }
}

/** Render one canonical event through its lifecycle-owned renderer. */
export function WorkspaceEvent({ event }: EventRendererProps) {
  const Renderer = renderers[event.kind] ?? SpeechEvent; // unknown kinds degrade, not crash
  return (
    <EventBoundary event={event}>
      <Renderer event={event} />
    </EventBoundary>
  );
}
