// Linked mentions — chat text whose object references are live. A mention is
// quiet (hairline underline + ink shift, never a pill): hovering glows its
// workspace object, clicking pins the light. The chip itself barely changes;
// the OBJECT carries the highlight.
import React, { useMemo } from 'react';
import { glowObject, pinObject, useHighlightedObject } from '../../../../lib/highlight/index.js';
import { splitMentions, type MentionTarget } from '../../../../lib/mentions/index.js';
import './index.css';

function MentionChip({ label, objectId }: { label: string; objectId: string }) {
  const isLit = useHighlightedObject() === objectId;
  return (
    <button
      type="button"
      className={isLit ? 'st-mention st-mention-on' : 'st-mention'}
      onMouseEnter={() => glowObject(objectId)}
      onMouseLeave={() => glowObject(null)}
      onClick={() => pinObject(objectId)}
    >
      {label}
    </button>
  );
}

interface MentionTextProps {
  text: string;
  targets: MentionTarget[];
}

/** Text with its object references rendered as live mention chips. */
export function MentionText({ text, targets }: MentionTextProps) {
  const segments = useMemo(() => splitMentions(text, targets), [text, targets]);
  return (
    <>
      {segments.map((segment, index) => segment.target
        ? <MentionChip key={`${segment.target.objectId}:${index}`} label={segment.text} objectId={segment.target.objectId} />
        : <React.Fragment key={`plain:${index}`}>{segment.text}</React.Fragment>)}
    </>
  );
}
