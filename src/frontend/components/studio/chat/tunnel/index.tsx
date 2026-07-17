// Tunnel lens — the live agent↔agent feed (DMs + #team posts) inside the AI
// panel. Rows keep the anti-prose grammar: tiny mono route label ("claude-1 →
// codex-2"), the body, and delivery state in the meta line. No badges, no
// pills. The amber engine may grant ONE row gold (a failed send that needs
// Chris); clicking that row resolves it and the gold releases to sage.
import React, { useEffect, useRef } from 'react';
import type { AgentInfo } from '../../../../lib/agentSocket/index.js';
import { messageItemId, useAttention } from '../../../../lib/attention/index.js';
import { formatRoute, statusMeta, type TunnelEnvelope } from '../../../../lib/tunnelModel/index.js';
import { formatChatTime } from '../../../../lib/chatModel/index.js';
import type { MentionTarget } from '../../../../lib/mentions/index.js';
import { MarkdownText } from '../../../../lib/markdown/index.js';
import { MentionText } from '../mention/index.js';
import './index.css';

interface TunnelFeedProps {
  /** The live feed — owned by the panel so attention works on every lens. */
  feed: TunnelEnvelope[];
  /** Live agents — names feed the failed-delivery roster hint. */
  agents: AgentInfo[];
  /** Mention universe: object names in bodies become linked mentions. */
  targets: MentionTarget[];
  /** Clicking through the gold row resolves its attention item. */
  onResolve(itemId: string): void;
}

interface TunnelRowProps {
  envelope: TunnelEnvelope;
  liveNames: string[];
  targets: MentionTarget[];
  onResolve(itemId: string): void;
}

function RouteMeta({ envelope, liveNames }: { envelope: TunnelEnvelope; liveNames: string[] }) {
  return (
    <>
      <b>{formatRoute(envelope)}</b>
      {' · '}{formatChatTime(envelope.createdAt)}
      {envelope.delivery === 'interrupt' && ' · interrupt'}
      {' · '}
      <span className={`st-tn-status st-tn-${envelope.status}`}>{statusMeta(envelope, liveNames)}</span>
    </>
  );
}

function TunnelRow({ envelope, liveNames, targets, onResolve }: TunnelRowProps) {
  const attention = useAttention();
  const itemId = messageItemId(envelope.id);
  const holdsGold = attention.goldId === itemId;
  const isSettling = attention.settlingId === itemId;
  const rowClass = `st-msg${holdsGold ? ' st-tn-gold' : ''}${isSettling ? ' st-tn-settling' : ''}`;
  // Resolution is an explicit affordance — the gold meta line is a real
  // button. Nothing resolves by bubbling: clicks on the body or a mention
  // inside it can never release the amber.
  return (
    <div className={rowClass}>
      {holdsGold ? (
        <button type="button" className="st-by st-tn-route st-tn-resolve" onClick={() => onResolve(itemId)}>
          <RouteMeta envelope={envelope} liveNames={liveNames} />
        </button>
      ) : (
        <div className="st-by st-tn-route">
          <RouteMeta envelope={envelope} liveNames={liveNames} />
        </div>
      )}
      <div className="st-say st-tn-body">
        <MarkdownText
          text={envelope.body}
          renderText={(plain) => <MentionText text={plain} targets={targets} />}
        />
      </div>
    </div>
  );
}

const BOTTOM_SLACK_PX = 48;

export function TunnelFeed({ feed, agents, targets, onResolve }: TunnelFeedProps) {
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
        <TunnelRow key={envelope.id} envelope={envelope} liveNames={liveNames} targets={targets} onResolve={onResolve} />
      ))}
    </div>
  );
}
