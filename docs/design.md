# Design system

Reference for the token set, utility classes, and conventions in
`src/frontend/css/index.css`. Read this before adding new UI.

## 1. Philosophy

Each theme defines exactly **4 base values**:

- `--theme-bg`, `--theme-ink`, `--theme-muted`, `--theme-accent`

Everything structural — surfaces, borders, text tiers, hover states — is
*derived* from those four via `color-mix(in srgb, ...)`. This is why a theme
switch (or dark → light) never needs per-component overrides: `ink` flips
direction and every derived token follows automatically.

Hue-carrying tokens (`--status-*`, `--kind-*`) can't be derived from a
grayscale base, so each is set explicitly per theme *mode* (`[data-mode='light']`
overrides the dark defaults) rather than per theme.

Consequence for component CSS: **never hardcode a color**. Reach for an
existing token, or the new spacing/type tokens below. If a component needs a
hue not covered by `--status-*`/`--kind-*`, that's a sign it belongs in the
taxonomy (§6), not a one-off hex value.

## 2. Token reference

### Colors — base (per theme)

| Token | Meaning |
|---|---|
| `--theme-bg` | Base background |
| `--theme-ink` | Base foreground (text/border generator) |
| `--theme-muted` | Secondary foreground generator |
| `--theme-accent` | Accent generator |

### Colors — derived surfaces & text

| Token | Derivation |
|---|---|
| `--bg-primary` | `= --theme-bg` |
| `--bg-secondary` | `color-mix(ink 4%, bg)` |
| `--bg-tertiary` | `color-mix(ink 9%, bg)` |
| `--border-color` | `color-mix(ink 8%, transparent)` |
| `--border-active` | `color-mix(ink 18%, transparent)` |
| `--text-primary` | `color-mix(ink 94%, bg)` |
| `--text-secondary` | `= --theme-muted` |
| `--text-muted` | `color-mix(muted 62%, bg)` |
| `--accent-color` | `color-mix(accent 55%, bg)` |
| `--accent-active` | `color-mix(accent 45%, bg)` |
| `--hover-bg` | `color-mix(ink 6%, transparent)` |

### Hue tokens (per mode, not per theme)

| Status | Kind |
|---|---|
| `--status-success` | `--kind-assistant` |
| `--status-failed` | `--kind-thinking` |
| `--status-running` | `--kind-tool` |
| | `--kind-result` |
| | `--kind-error` |

Dark values live in `:root`; light overrides live in `:root[data-mode='light']`.

### Spacing scale (new)

| Token | Value |
|---|---|
| `--space-1` | 0.15rem |
| `--space-2` | 0.3rem |
| `--space-3` | 0.5rem |
| `--space-4` | 0.75rem |
| `--space-5` | 1rem |
| `--space-6` | 1.5rem |

### Type scale (new)

| Token | Value |
|---|---|
| `--text-2xs` | 0.6rem |
| `--text-xs` | 0.68rem |
| `--text-sm` | 0.72rem |
| `--text-md` | 0.78rem |
| `--text-lg` | 0.85rem |

### Radii, shadow, fonts, motion

| Token | Value |
|---|---|
| `--radius` | 9px |
| `--radius-sm` | 6px |
| `--radius-xs` | 4px (new) |
| `--shadow` | `0 4px 16px color-mix(ink 8%, transparent)` (new) |
| `--anim` | 240ms ease |
| `--font-sans` | theme-selectable (see `[data-font=...]`) |
| `--font-mono` | JetBrains Mono |

No `z-index` tokens exist; `z-index` stays local and minimal (e.g. `.col-resize-handle`).

## 3. Adding a theme or font

The theme id list is **triple-defined** and must be kept in sync by hand —
each site carries a `KEEP IN SYNC` comment pointing at the other two:

1. `src/frontend/css/index.css` — `:root[data-theme='<id>']` rule (4 base values) +, if light, add the id to the `:root[data-mode='light']` selector logic is driven by #3, not this file.
2. `src/frontend/lib/theme/index.ts` — `THEMES` array entry (`id`, `name`, `mode`, swatch `bg`/`accent`).
3. `src/frontend/index.html` — boot script's light-theme id array (used to set `data-mode` before first paint, avoiding a flash).

Adding a font: add a `@font-face`/`@import` source, a `:root[data-font='<id>']`
rule in `css/index.css`, and an entry in `FONTS` in `lib/theme/index.ts`. Fonts
are not triple-defined — no boot-script list to update.

## 4. Utility class catalog

All defined in the `Utilities` section at the end of `css/index.css`.

| Class | Use for |
|---|---|
| `.u-truncate` | Single-line ellipsis truncation |
| `.u-section-title` | The one canonical uppercase panel/section heading |
| `.u-row` / `.u-row-selected` | Clickable list row + its selected state |
| `.u-btn` / `.u-btn-primary` | Buttons; primary uses the accent tokens |
| `.u-input` | Text inputs |
| `.u-pill` + `.kind-*` / `.status-*` | Badges/chips; pill shape + a hue modifier |
| `.u-panel` / `.u-panel-header` / `.u-panel-body` | Required tab skeleton (§5) |
| `.u-empty` | Centered muted empty-state message |

Pill modifiers, one per hue token currently defined:

- `kind-`: `assistant`, `thinking`, `tool`, `result`, `error`
- `status-`: `success`, `failed`, `running`

Adding a new `--kind-*`/`--status-*` token later means adding its
`.u-pill.kind-*`/`.u-pill.status-*` pair alongside it (§6).

## 5. Component conventions

- **CSS-per-component**: every directory containing a `.tsx` must contain a
  `.css` (enforced by the gate, §7).
- **No inline styles**: `style={{...}}` is gate-forbidden outside pre-existing
  exceptions; use a class.
- **`.u-panel` is the required tab skeleton**: top-level tab content is a
  `.u-panel` with a `.u-panel-header` and a `.u-panel-body` — this is what
  guarantees consistent scroll containment (`min-height: 0`) across tabs.
- **No property collisions**: a component's module class must never set a
  property that a co-applied `.u-*` utility already owns (e.g. don't redeclare
  `overflow-y` on an element carrying `.u-panel-body`). Split the difference:
  layout/spacing that's genuinely one-off stays in the module class; anything
  matching an existing `.u-*` recipe should use the utility instead of
  reinventing it.

## 6. Kind / status taxonomy

Single source of truth: `src/frontend/components/ui/index.tsx` (`KIND_META`)
for the icon/color mapping consumed across timelines (`board`, `agents/calm`,
`ruleset`, etc.), paired with the `.u-pill.kind-*` / `.u-pill.status-*` CSS
modifiers in `css/index.css` for badge styling and the standalone `.kind-*`
color classes in `ui/index.css` for non-pill text/icons. Do not add
per-component kind maps — new hue tokens land in `css/index.css` first, with
the `KIND_META` entry and pill modifier added in the same change.

## 7. Gates

`tools/gates/standards.mjs` is a ratchet: total violations (eslint warnings +
structural checks) must not exceed the count recorded in `lint-baseline.json`
at the repo root. It never blocks improvement, only regression.

Structural checks (not eslint rules):

- max 2 code files (`.ts`/`.tsx`/`.js`) per directory
- every directory with a `.tsx` file must also have a `.css` file

Eslint checks included in the count: `max-lines` (>300, excluding blanks/comments,
`.tsx`/`.ts` only — CSS is exempt), `id-length` (<4, exceptions: `id`, `el`,
`cwd`, `env`), cognitive-complexity (>10), and a rule forbidding `style={{`
inline styles.

Run the gate: `node tools/gates/standards.mjs` (from repo root). It prints
`eslint: N  structural: N  total: N` and exits non-zero on regression.

To ratchet the baseline down after a legitimate cleanup:
`npm run lint -- --update`.

## 8. Migration notes (2026-07 unification)

- Five `style={{}}` remain by design: three drag-resizable column widths in
  the shell (`components/index.tsx`) and two theme-swatch preview colors in
  `viewpanel` — genuinely dynamic values with no class/token representation.
- A `0.55rem` micro-label tier survives (`.vp-group-title`, chip labels,
  etc.): it is a deliberate sub-heading level below `--text-2xs`, kept to
  preserve two-tier hierarchies. Do not fold it into `.u-section-title`.
- When a module class must override a co-imported global class
  (`.glass-panel`, `.u-btn`), use a compound selector
  (`.glass-panel.dash-header`, `.files-btn.u-btn:disabled`) instead of
  relying on stylesheet import order.
- The `u-*` utilities are pixel-calibrated to the pre-migration conventions;
  adopt them bare when values match, add a module modifier class only for
  genuine differences (see `settings/index.css` `.set-btn`).
