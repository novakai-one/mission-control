// MessageFeed — the storyboard's center column: day pills, message rows
// (avatar square, name + role, body, timestamp), reply context when a parent
// exists, "Agent working…" on the lane's live edge. Scroll seat + ReadCursor
// advance are PORTED from studio/chat/tunnel/transcript (that shared
// component can't change — C21 rules preserved exactly: open ≠ read, the
// cursor moves only on genuine visibility at the live edge).
import React, { useEffect, useRef } from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import { anchorFor, saveAnchor } from '../../../../lib/readCursor/index.js';
import type { MentionTarget } from '../../../../lib/mentions/index.js';
import { MarkdownText } from '../../../../lib/markdown/index.js';
import { MentionText } from '../../../studio/chat/mention/index.js';
import type {
  Conversation,
  TunnelEnvelope,
} from '../../../../lib/tunnelModel/index.js';
import {
  displayNameFor,
  formatClockTime,
  groupByDay,
  initialFor,
  replyLabelFor,
  roleFor,
  workingAgentFor,
} from '../model.js';
import './index.css';

const BOTTOM_SLACK_PX = 48;

export function messageRowId(envelopeId: string): string {
  return `msg-row-${envelopeId}`;
}

interface MessageRowProps {
  envelope: TunnelEnvelope;
  agents: AgentInfo[];
  targets: MentionTarget[];
  replyLabel: string | null;
  showWorking: boolean;
}

function MessageRow({ envelope, agents, targets, replyLabel, showWorking }: MessageRowProps) {
  const name = displayNameFor(envelope.from);
  return (
    <article className="msg-row" id={messageRowId(envelope.id)}>
      <span className="msg-row-av" aria-hidden="true">{initialFor(envelope.from)}</span>
      <div className="msg-row-body">
        <div className="msg-row-head">
          <strong>{name}</strong>
          <span className="msg-row-role">{roleFor(envelope.from, agents)}</span>
        </div>
        {replyLabel && (
          <span className="msg-row-reply">
            <span className="msg-row-reply-glyph" aria-hidden="true">↳</span>
            {replyLabel}
          </span>
        )}
        <p className="msg-row-text">
          <MarkdownText
            text={envelope.body}
            renderText={(plain) => <MentionText text={plain} targets={targets} />}
          />
        </p>
        {envelope.status === 'failed' && <span className="msg-row-failed">Delivery failed</span>}
        {envelope.status === 'queued' && <span className="msg-row-queued">Sending…</span>}
        {showWorking && <span className="msg-row-working">Agent working…</span>}
      </div>
      <span className="msg-row-time">{formatClockTime(envelope.createdAt)}</span>
    </article>
  );
}

interface MessageFeedProps {
  conversation: Conversation;
  messages: TunnelEnvelope[];
  /** Full feed — reply parents may live outside the loaded lane window. */
  feed: TunnelEnvelope[];
  agents: AgentInfo[];
  targets: MentionTarget[];
  /** Reports the newest envelope createdAt genuinely shown in the foreground. */
  onSeen(seenCreatedAt: string): void;
}

export function MessageFeed({ conversation, messages, feed, agents, targets, onSeen }: MessageFeedProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const restoreRef = useRef<{ lane: string; done: boolean }>({ lane: '', done: false });
  const anchorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEnvelope = messages[messages.length - 1];
  const feedEdge = `${conversation.id}:${lastEnvelope?.id ?? ''}:${lastEnvelope?.status ?? ''}:${messages.length}`;
  const working = workingAgentFor(messages, agents, Date.now());
  const groups = groupByDay(messages, new Date());

  function reportSeen(): void {
    if (atBottomRef.current && lastEnvelope && document.visibilityState === 'visible') {
      onSeen(lastEnvelope.createdAt);
    }
  }

  function trackScroll(): void {
    const body = bodyRef.current;
    if (!body) return;
    atBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < BOTTOM_SLACK_PX;
    reportSeen();
    // The seat persists (debounced) so a reload restores this exact scroll.
    if (anchorTimer.current) clearTimeout(anchorTimer.current);
    const lane = conversation.id;
    const seatTop = body.scrollTop;
    anchorTimer.current = setTimeout(() => saveAnchor(lane, seatTop), 250);
  }

  // Opening a lane restores the saved seat; a lane never visited lands on the
  // newest word. Within a lane, follow the live edge only when already there.
  useEffect(() => {
    if (restoreRef.current.lane !== conversation.id) {
      restoreRef.current = { lane: conversation.id, done: false };
    }
  }, [conversation.id]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (!restoreRef.current.done && messages.length > 0) {
      restoreRef.current.done = true;
      const anchor = anchorFor(conversation.id);
      body.scrollTop = anchor ?? body.scrollHeight;
      atBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < BOTTOM_SLACK_PX;
      reportSeen();
      return;
    }
    if (atBottomRef.current) {
      body.scrollTop = body.scrollHeight;
      reportSeen();
    }
  }, [feedEdge]);

  if (messages.length === 0) {
    return (
      <div className="msg-feed" ref={bodyRef}>
        <div className="msg-feed-quiet">Nothing said yet — say the first word below.</div>
      </div>
    );
  }

  return (
    <div className="msg-feed" ref={bodyRef} onScroll={trackScroll}>
      {groups.map((group) => (
        <React.Fragment key={group.dayKey}>
          <div className="msg-day">
            <span className="msg-day-pill">{group.label}</span>
          </div>
          {group.messages.map((envelope) => (
            <MessageRow
              key={envelope.id}
              envelope={envelope}
              agents={agents}
              targets={targets}
              replyLabel={replyLabelFor(envelope, feed)}
              showWorking={working !== null && envelope.id === lastEnvelope?.id}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
