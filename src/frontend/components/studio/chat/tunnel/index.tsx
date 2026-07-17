// Tunnel lens — the live agent↔agent feed (DMs + #team posts) inside the AI
// panel. Rows keep the anti-prose grammar: tiny mono route label ("claude-1 →
// codex-2"), the body, and delivery state in the meta line. No badges, no
// pills — a failed send reads as muted meta text carrying the roster hint.
import React, { useEffect, useRef } from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import {
  formatRoute,
  statusMeta,
  useTunnelFeed,
  type TunnelEnvelope,
} from '../../../../lib/tunnelModel/index.js';
import { formatChatTime } from '../../../../lib/chatModel/index.js';
import type { MentionTarget } from '../../../../lib/mentions/index.js';
import { MentionText } from '../mention/index.js';
import './index.css';

interface TunnelFeedProps {
  /** Live agents — names feed the failed-delivery roster hint. */
  agents: AgentInfo[];
  /** Mention universe: object names in bodies become linked mentions. */
  targets: MentionTarget[];
}

interface TunnelRowProps {
  envelope: TunnelEnvelope;
  liveNames: string[];
  targets: MentionTarget[];
}

function TunnelRow({ envelope, liveNames, targets }: TunnelRowProps) {
  return (
    <div className="st-msg">
      <div className="st-by st-tn-route">
        <b>{formatRoute(envelope)}</b>
        {' · '}{formatChatTime(envelope.createdAt)}
        {envelope.delivery === 'interrupt' && ' · interrupt'}
        {' · '}
        <span className={`st-tn-status st-tn-${envelope.status}`}>{statusMeta(envelope, liveNames)}</span>
      </div>
      <div className="st-say st-tn-body">
        <MentionText text={envelope.body} targets={targets} />
      </div>
    </div>
  );
}

const BOTTOM_SLACK_PX = 48;

export function TunnelFeed({ agents, targets }: TunnelFeedProps) {
  const feed = useTunnelFeed();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const liveNames = agents.filter((agent) => agent.status === 'running').map((agent) => agent.title);
  const lastEnvelope = feed[feed.length - 1];
  const feedEdge = lastEnvelope ? `${lastEnvelope.id}:${lastEnvelope.status}:${feed.length}` : '';

  function trackScroll(): void {
    const body = bodyRef.current;
    if (body) atBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < BOTTOM_SLACK_PX;
  }

  // Follow the live edge only when already reading it — scrolled-up history
  // reading is never yanked to the bottom by an arriving envelope.
  useEffect(() => {
    const body = bodyRef.current;
    if (body && atBottomRef.current) body.scrollTop = body.scrollHeight;
  }, [feedEdge]);

  if (feed.length === 0) return <div className="st-ai-quiet">No agent messages yet</div>;
  return (
    <div className="st-ai-body st-tunnel" ref={bodyRef} onScroll={trackScroll}>
      {feed.map((envelope) => (
        <TunnelRow key={envelope.id} envelope={envelope} liveNames={liveNames} targets={targets} />
      ))}
    </div>
  );
}
