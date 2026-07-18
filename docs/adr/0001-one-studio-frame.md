---
status: accepted
---

# Use one studio frame for every page

Novakai Command has one persistent application frame: one header, one collapsible left panel, one main workspace, and one collapsible right panel. Pages supply contextual content for those four slots; they do not implement their own outer grids, headers, rails, resize handles, persistence, or panel motion. This keeps navigation spatially stable, makes the proven Agents drawer behaviour universal, and prevents A/B/C layouts from becoming nested application shells.

The frame also owns the single root font family and scale, horizontal panel resizing, and the persisted vertical feed/composer split where a conversation is present. Both side panels use the proven Agents-style clipping-mask movement: contents remain mounted, collapse/reopen takes 700ms unless reduced motion is requested, and widths survive page changes and reloads.

## Considered options

- **One shared frame with contextual contents — accepted.** Geometry and interaction remain stable while the contents change.
- **A separate composition for every page — rejected.** This created duplicate panels, incompatible toggles, layout jumps, and uncertainty about which surface owned messaging.
- **Wrap page-owned shells inside another shared shell — rejected.** This preserves the duplication and produces nested rails rather than removing them.

## Consequences

- Panel width, open state, horizontal resizing, vertical conversation resizing, animation, accessibility, and reduced-motion behaviour are owned by the shared frame.
- One root typography token controls the application font family and scale.
- A collapsed side panel follows Agents-drawer parity: a 32px reopen gutter is acceptable; it does not need to retain a second icon rail.
- Page modules own content and page-specific selection only.
- A quiet or temporarily empty slot remains part of the frame; it does not justify a new layout.
- Migration must delete superseded page-level shell code rather than retain compatibility layers.
