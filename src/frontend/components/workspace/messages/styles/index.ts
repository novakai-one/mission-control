// Messages tab style blocks — doctrine §B (typed-block Style doctrine).
// Every structural STATE the tab renders is a frozen StyleBlock; components
// hold attachments (never style objects) and combine them through the single
// resolveStyle seam below. State changes swap attachments — nothing mutates
// CSS ad hoc. The values themselves stay in tokens.css; these blocks only
// name which authored class is attached.

export interface StyleBlock {
  /** Stable id, unique within the tab. */
  readonly id: string;
  /** PascalCase -Style display name (html-builder convention). */
  readonly name: string;
  /** One line: what attaching this block means. */
  readonly purpose: string;
  /** The authored CSS class(es) this block attaches. */
  readonly className: string;
}

function defineStyle(block: StyleBlock): StyleBlock {
  return Object.freeze(block);
}

/** Shell grid states (messages/index.tsx). */
export const SHELL_STYLE = {
  base: defineStyle({
    id: 'shell-base',
    name: 'MsgShellBase-Style',
    purpose: 'Three-column grid: rail / thread / context.',
    className: 'msg-view',
  }),
  contextClosed: defineStyle({
    id: 'shell-context-closed',
    name: 'MsgShellContextClosed-Style',
    purpose: 'Context column folded to zero width; animates on --msg-t-struct.',
    className: 'msg-context-closed',
  }),
  railCollapsed: defineStyle({
    id: 'shell-rail-collapsed',
    name: 'MsgShellRailCollapsed-Style',
    purpose: 'Rail column folded to its glyph strip; animates on --msg-t-struct.',
    className: 'msg-rail-collapsed',
  }),
  railOverlayOpen: defineStyle({
    id: 'shell-rail-overlay-open',
    name: 'MsgShellRailOverlayOpen-Style',
    purpose: 'Phone layout: the rail floats over the thread.',
    className: 'msg-rail-open',
  }),
  resizing: defineStyle({
    id: 'shell-resizing',
    name: 'MsgShellResizing-Style',
    purpose: 'Column drag in flight; structural transitions pause so the drag tracks the pointer.',
    className: 'msg-resizing',
  }),
};

/** Rail entry points + pickers (round 3 M5 — New room / New DM flows). */
export const NEW_ACTION_STYLE = {
  base: defineStyle({
    id: 'new-action',
    name: 'MsgNewAction-Style',
    purpose: 'Labeled rail entry point; toggles its new-lane picker.',
    className: 'msg-new-action',
  }),
  active: defineStyle({
    id: 'new-action-active',
    name: 'MsgNewActionActive-Style',
    purpose: 'Entry point whose picker is currently open.',
    className: 'is-active',
  }),
};

export const PICKER_STYLE = {
  base: defineStyle({
    id: 'picker',
    name: 'MsgPicker-Style',
    purpose: 'Bordered picker card under a rail entry point.',
    className: 'msg-picker',
  }),
  agent: defineStyle({
    id: 'picker-agent',
    name: 'MsgPickerAgent-Style',
    purpose: 'One selectable known-agent row.',
    className: 'msg-picker-agent',
  }),
  agentPicked: defineStyle({
    id: 'picker-agent-picked',
    name: 'MsgPickerAgentPicked-Style',
    purpose: 'Row selected for room membership.',
    className: 'is-picked',
  }),
};

/** Send-and-know dock (round 3 M7 — thread/index.tsx). */
export const NEW_MESSAGE_STYLE = {
  dock: defineStyle({
    id: 'new-message-dock',
    name: 'MsgNewMessageDock-Style',
    purpose: 'Sticky zero-height anchor pinning the pill to the feed viewport bottom.',
    className: 'msg-new-dock',
  }),
  pill: defineStyle({
    id: 'new-message-pill',
    name: 'MsgNewMessagePill-Style',
    purpose: 'Jump affordance offered when a send lands during active scrolling.',
    className: 'msg-new-pill',
  }),
};

/** Message-row fold states (thread/index.tsx — Show more/less). */
export const FOLD_STYLE = {
  fold: defineStyle({
    id: 'row-fold',
    name: 'MsgRowFold-Style',
    purpose: 'Collapsible height track; glides 0fr/1fr on --msg-t-struct.',
    className: 'msg-row-fold',
  }),
  open: defineStyle({
    id: 'row-fold-open',
    name: 'MsgRowFoldOpen-Style',
    purpose: 'Fold attachment for the visible (open) state.',
    className: 'is-open',
  }),
};

/** The single resolver seam: render and tests both combine blocks through
 *  here — no scattered class-string math, no inline-style escape hatches. */
export function resolveStyle(
  ...attachments: ReadonlyArray<StyleBlock | false | null | undefined>
): string {
  return attachments
    .filter((block): block is StyleBlock => Boolean(block))
    .map((block) => block.className)
    .join(' ');
}
