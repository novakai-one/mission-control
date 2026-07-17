// One conversation's transcript + composer. Rows keep the anti-prose grammar:
// tiny mono speaker label, the body, delivery state in the meta line. No
// badges, no pills. The amber engine may grant ONE row gold (a failed send
// that needs Chris); clicking that row's meta line resolves it and the gold
// releases to sage.
import React, { useEffect, useRef, useState } from 'react';
import { messageItemId, useAttention } from '../../../../../lib/attention/index.js';
import {
  CHRIS,
  formatRoute,
  statusMeta,
  type Conversation,
  type TunnelEnvelope,
} from '../../../../../lib/tunnelModel/index.js';
import { formatChatTime } from '../../../../../lib/chatModel/index.js';
import type { MentionTarget } from '../../../../../lib/mentions/index.js';
import { MarkdownText } from '../../../../../lib/markdown/index.js';
import { MentionText } from '../../mention/index.js';
import './index.css';

/** Chris reads as You; an agent↔agent DM surfacing in a lane keeps its full
 * route so the lane never misattributes a sidebar between two agents. */
function authorLabel(envelope: TunnelEnvelope, kind: Conversation['kind']): string {
  if (envelope.from === CHRIS) return 'You';
  if (kind === 'dm' && envelope.to !== CHRIS) return formatRoute(envelope);
  return envelope.from;
}

interface RowMetaProps {
  envelope: TunnelEnvelope;
  kind: Conversation['kind'];
  liveNames: string[];
}

function RowMeta({ envelope, kind, liveNames }: RowMetaProps) {
  return (
    <>
      <b>{authorLabel(envelope, kind)}</b>
      {' · '}{formatChatTime(envelope.createdAt)}
      {envelope.delivery === 'interrupt' && ' · interrupt'}
      {' · '}
      <span className={`st-tn-status st-tn-${envelope.status}`}>{statusMeta(envelope, liveNames)}</span>
    </>
  );
}

interface TranscriptRowProps extends RowMetaProps {
  targets: MentionTarget[];
  onResolve(itemId: string): void;
}

function TranscriptRow({ envelope, kind, liveNames, targets, onResolve }: TranscriptRowProps) {
  const attention = useAttention();
  const itemId = messageItemId(envelope.id);
  const holdsGold = attention.goldId === itemId;
  const isSettling = attention.settlingId === itemId;
  const fromYou = envelope.from === CHRIS;
  const rowClass = `st-msg${holdsGold ? ' st-tn-gold' : ''}${isSettling ? ' st-tn-settling' : ''}`;
  const metaClass = `st-by st-tn-route${fromYou ? ' st-by-you' : ''}`;
  // Resolution is an explicit affordance — the gold meta line is a real
  // button. Nothing resolves by bubbling: clicks on the body or a mention
  // inside it can never release the amber.
  return (
    <div className={rowClass}>
      {holdsGold ? (
        <button type="button" className={`${metaClass} st-tn-resolve`} onClick={() => onResolve(itemId)}>
          <RowMeta envelope={envelope} kind={kind} liveNames={liveNames} />
        </button>
      ) : (
        <div className={metaClass}>
          <RowMeta envelope={envelope} kind={kind} liveNames={liveNames} />
        </div>
      )}
      <div className={`st-say st-tn-body${fromYou ? ' st-say-you' : ''}`}>
        <MarkdownText
          text={envelope.body}
          renderText={(plain) => <MentionText text={plain} targets={targets} />}
        />
      </div>
    </div>
  );
}

const BOTTOM_SLACK_PX = 48;

interface TranscriptProps {
  conversation: Conversation;
  messages: TunnelEnvelope[];
  liveNames: string[];
  targets: MentionTarget[];
  onResolve(itemId: string): void;
}

export function Transcript({ conversation, messages, liveNames, targets, onResolve }: TranscriptProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const lastEnvelope = messages[messages.length - 1];
  const feedEdge = `${conversation.id}:${lastEnvelope?.id ?? ''}:${lastEnvelope?.status ?? ''}:${messages.length}`;

  function trackScroll(): void {
    const body = bodyRef.current;
    if (body) atBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < BOTTOM_SLACK_PX;
  }

  // A lane switch always lands on the newest word; within a lane, follow the
  // live edge only when already reading it — scrolled-up history reading is
  // never yanked to the bottom by an arriving envelope.
  useEffect(() => {
    atBottomRef.current = true;
  }, [conversation.id]);

  useEffect(() => {
    const body = bodyRef.current;
    if (body && atBottomRef.current) body.scrollTop = body.scrollHeight;
  }, [feedEdge]);

  if (messages.length === 0) return <div className="st-ai-quiet">Nothing said yet</div>;
  return (
    <div className="st-ai-body st-tunnel" ref={bodyRef} onScroll={trackScroll}>
      {messages.map((envelope) => (
        <TranscriptRow
          key={envelope.id}
          envelope={envelope}
          kind={conversation.kind}
          liveNames={liveNames}
          targets={targets}
          onResolve={onResolve}
        />
      ))}
    </div>
  );
}

interface MessengerComposerProps {
  conversation: Conversation;
  onSend(body: string): Promise<void>;
}

export function MessengerComposer({ conversation, onSend }: MessengerComposerProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send(): Promise<void> {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setDraft('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(press: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (press.key !== 'Enter' || press.shiftKey) return;
    press.preventDefault();
    void send();
  }

  return (
    <div className="st-ai-foot">
      {error && <div className="st-ai-error">{error}</div>}
      <div className="st-composer">
        <div className="st-ms-to">To {conversation.title}</div>
        <textarea
          aria-label={`Message ${conversation.title}`}
          placeholder="Say it in your own words…"
          value={draft}
          onChange={(change) => setDraft(change.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="st-composer-foot">
          <span className="st-composer-hint">⏎ send</span>
          <button type="button" className="st-send" aria-label="Send" disabled={!draft.trim() || sending} onClick={() => void send()}>↑</button>
        </div>
      </div>
    </div>
  );
}
