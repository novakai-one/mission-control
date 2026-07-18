// ComposerBar — the storyboard's pinned composer: drag handle, raised box,
// channel line, textarea, footer ("Draft saved" + inverted ↑ send button).
// Send is record-first: POST /api/user/messages (parent owns the fetch), the
// ws echo upserts the row — no optimistic row. Drafts persist per lane
// (lib/composerDraft); server errors (404 roster hint, 502 honest failure)
// render inline above the box.
import React, { useEffect, useRef, useState } from 'react';
import type { Conversation } from '../../../../lib/tunnelModel/index.js';
import { clearDraft, loadDraft, saveDraft } from '../../../../lib/composerDraft/index.js';
import { roomLabelFor } from '../model.js';
import './index.css';

interface ComposerBarProps {
  conversation: Conversation;
  onSend(body: string): Promise<void>;
}

export function ComposerBar({ conversation, onSend }: ComposerBarProps) {
  const [draft, setDraft] = useState(() => loadDraft(conversation.id));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [savedVisible, setSavedVisible] = useState(() => loadDraft(conversation.id).trim() !== '');
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loaded = loadDraft(conversation.id);
    setDraft(loaded);
    setError(null);
    setSavedVisible(loaded.trim() !== '');
  }, [conversation.id]);

  // "Draft saved" appears once the field has sat untouched for 1s.
  useEffect(() => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (!draft.trim()) {
      setSavedVisible(false);
      return;
    }
    savedTimer.current = setTimeout(() => setSavedVisible(true), 1000);
  }, [draft, conversation.id]);

  async function send(): Promise<void> {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setDraft('');
      clearDraft(conversation.id);
      setSavedVisible(false);
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

  const isDm = conversation.kind === 'dm';
  const channelLabel = isDm ? `@ ${conversation.title}` : `# ${roomLabelFor(conversation)}`;
  const hint = isDm ? `Message ${conversation.title}…` : `Message #${roomLabelFor(conversation)}…`;

  return (
    <form
      className="msg-composer"
      onSubmit={(submit) => {
        submit.preventDefault();
        void send();
      }}
    >
      <span className="msg-composer-handle" aria-hidden="true" />
      {error && <div className="msg-composer-error" role="alert">{error}</div>}
      <div className="msg-composer-box">
        <div className="msg-composer-channel">{channelLabel}</div>
        <textarea
          aria-label={`Message ${conversation.title}`}
          placeholder={hint}
          value={draft}
          onChange={(change) => {
            const nextDraft = change.target.value;
            setDraft(nextDraft);
            saveDraft(conversation.id, nextDraft);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="msg-composer-foot">
          <span className="msg-composer-saved">{savedVisible ? 'Draft saved' : ''}</span>
          <button
            type="submit"
            className="msg-send"
            aria-label="Send"
            disabled={!draft.trim() || sending}
          >
            ↑
          </button>
        </div>
      </div>
    </form>
  );
}
