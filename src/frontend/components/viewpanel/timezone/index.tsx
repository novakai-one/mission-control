import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { currentTimeZone, searchZones, setTimeZone, zoneLabel } from '../../../lib/timezone/index.js';
import type { ZoneEntry } from '../../../lib/timezone/index.js';
import './index.css';

/**
 * Type-ahead timezone picker. Input text is local draft state — the applied
 * timezone only changes on select, so typing never re-formats timestamps.
 * The list opens on keystroke only (never focus) and closes on outside
 * click, outside scroll, select, or Escape.
 */
export function TimezonePicker() {
  const [text, setText] = useState(() => zoneLabel(currentTimeZone()));
  const [listOpen, setListOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => (listOpen ? searchZones(text) : []), [listOpen, text]);
  const listMounted = matches.length > 0;

  // The list is position:fixed (the section body clips overflow for its
  // collapse animation), anchored under the input. Positioned imperatively
  // pre-paint; re-runs whenever the list node remounts.
  useLayoutEffect(() => {
    if (!listOpen) return;
    if (inputRef.current && listRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      listRef.current.style.insetBlockStart = `${rect.bottom + 4}px`;
      listRef.current.style.insetInlineStart = `${rect.left}px`;
      listRef.current.style.width = `${rect.width}px`;
    }
    const close = (event: Event): void => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setListOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [listOpen, listMounted]);

  function select(entry: ZoneEntry): void {
    setTimeZone(entry.id);
    setText(entry.label);
    setListOpen(false);
  }

  return (
    <div className="vp-tz" ref={wrapRef}>
      <div className="vp-group-title">Timezone</div>
      <input
        ref={inputRef}
        className="vp-tz-input"
        value={text}
        spellCheck={false}
        onChange={(event) => { setText(event.target.value); setListOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && matches[0]) select(matches[0]);
          if (event.key === 'Escape') setListOpen(false);
        }}
        onFocus={(event) => event.target.select()}
      />
      {listOpen && listMounted && (
        <div className="vp-tz-list" ref={listRef}>
          {matches.map((entry) => (
            <button key={entry.id} type="button" className="vp-tz-item" onClick={() => select(entry)}>
              <span className="vp-tz-name u-truncate">{entry.name}</span>
              <span className="vp-tz-offset">{entry.offset}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
