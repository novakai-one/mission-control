// Messenger left rail: live presence roster (quiet dot for online — the one
// ornament the spec grants) and the unified chats list. Picking agents grows
// a Start Chat affordance; naming stays inline — no modal, nothing covers the
// page. Rows are plain text: the amber engine may tint ONE chat row gold, and
// resolving it exhales through sage.
import React, { useState } from 'react';
import type {
  Conversation,
  ConversationId,
  RosterEntry,
} from '../../../../../lib/tunnelModel/index.js';
import './index.css';

interface MessengerRailProps {
  roster: RosterEntry[];
  conversations: Conversation[];
  selectedId: ConversationId | null;
  /** The lane whose latest word holds the app's single amber right now. */
  goldId: ConversationId | null;
  settlingId: ConversationId | null;
  onSelect(conversation: Conversation): void;
  onStartChat(members: string[], name: string): Promise<void>;
}

export function MessengerRail(props: MessengerRailProps) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(agentName: string): void {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
    setNaming(false);
  }

  function beginNaming(): void {
    setName([...picked].join(' + '));
    setError(null);
    setNaming(true);
  }

  async function create(): Promise<void> {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await props.onStartChat([...picked], name.trim());
      setPicked(new Set());
      setNaming(false);
      setName('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setCreating(false);
    }
  }

  function handleNameKey(press: React.KeyboardEvent<HTMLInputElement>): void {
    if (press.key === 'Enter') void create();
    if (press.key === 'Escape') setNaming(false);
  }

  function chatClass(conversation: Conversation): string {
    let names = 'st-ms-chat';
    if (conversation.id === props.selectedId) names += ' st-ms-chat-on';
    if (conversation.id === props.goldId) names += ' st-ms-chat-gold';
    if (conversation.id === props.settlingId) names += ' st-ms-chat-settling';
    return names;
  }

  return (
    <div className="st-ms-rail">
      <div className="st-ms-label">Agents</div>
      <div className="st-ms-list">
        {props.roster.map((agent) => (
          <button
            key={agent.name}
            type="button"
            className={picked.has(agent.name) ? 'st-ms-agent st-ms-agent-on' : 'st-ms-agent'}
            onClick={() => toggle(agent.name)}
          >
            <span className="st-ms-dot" />
            <span className="st-ms-agent-name">{agent.name}</span>
          </button>
        ))}
        {props.roster.length === 0 && <div className="st-ms-quiet">No live agents</div>}
      </div>
      {picked.size > 0 && !naming && (
        <button type="button" className="st-ms-start" onClick={beginNaming}>Start Chat</button>
      )}
      {naming && (
        <div className="st-ms-name">
          <input
            aria-label="Chat name"
            value={name}
            autoFocus
            onChange={(change) => setName(change.target.value)}
            onKeyDown={handleNameKey}
          />
          <button type="button" disabled={!name.trim() || creating} onClick={() => void create()}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}
      {error && <div className="st-ms-error">{error}</div>}
      <div className="st-ms-label">Chats</div>
      <div className="st-ms-list">
        {props.conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            className={chatClass(conversation)}
            onClick={() => props.onSelect(conversation)}
          >
            <span className="st-ms-chat-title">{conversation.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
