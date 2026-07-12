# Files Tab Redesign — Implementation Spec

Source of truth: `html-builder/saved-designs/260713-Novakai-Command-Files-Redesign/`
(`files-scenes.html`, `scene6/7/8*.png`, `DESIGNER_LEARNINGS.md`). The Files scenes are
**6, 7, 8** (scenes 1–5 in that design thread were the Transcript inspector, not in scope here).

Branch: `feat/files-redesign`.

The design replaces the current utilitarian Files tab with a premium, layered dark UI:

- **Scene 6 — nothing selected:** rail (path bar + tree) on an elevated panel; empty state
  with a framed `◈` glyph tile: "Select a repo to point your agents at".
- **Scene 7 — repo selected:** other tree rows dim to 0.4 opacity; a **repo detail card**
  (the hero surface) shows eyebrow `REPOSITORY`, repo name + `⎇ branch` chip, description,
  hairline, a real 3-column field grid (PATH / GIT / BRANCH / LANGUAGE / FILES / LAST COMMIT),
  and a white CTA **★ Set as Active Repo** with hint text.
- **Scene 8 — active repo set:** amber (`#d6a54c`) appears for the first time and means exactly
  one thing: *this is the active repo*. Amber dot on the tree row + rail legend (`● active repo`),
  card eyebrow flips to amber `● ACTIVE REPOSITORY`, header right shows mono
  `active repo · <name>`, CTA becomes **Open Agents Tab →**.

---

## 1. Current state (verified in code)

| Area | Where | Fate |
|---|---|---|
| `FilesPanel` (sidebar: path bar input, up/refresh toolbar, tree, sticky footer w/ selected-path + git line + "Set as Active Repo" button, show-hidden toggle; primary area = **"primary view TBD" stub**) | `src/frontend/components/files/index.tsx` (340 lines) | Rewritten & split (§4) |
| `TreeNode` (lucide chevron/Folder/File icons) | same file, lines 294–340 | Rewritten (text glyphs, no lucide) |
| All `.files-*` styles | `src/frontend/components/files/index.css` (187 lines) | Replaced wholesale |
| `activeRepo` state + `GET/POST /api/active-repo` wiring, `homeDir` resolve | shell `components/index.tsx:117–201` | Kept as-is; one new prop threaded (§4.3) |
| `AppHeader` (glass blur, dot-tab nav, active-repo label) | `components/dashboard/index.tsx` + css | Restyled to scene chrome (§5) |
| Backend fs endpoints (`/api/fs`, `/api/fs/resolve-root`, `/api/active-repo`), `clampToHome` sandbox | `backend/server/index.ts:277–316`, `backend/fs/explorer.ts` | Kept unchanged |
| Git metadata (branch, dirty, last commit, tracked count, language %) | **does not exist** — only `.git`-dir presence via `resolveGitRoot` | New endpoint (§3) |
| Repo description | does not exist | New: from `package.json` `description` (§3) |

Files-only surface (safe to replace, zero external importers): everything under
`components/files/`. Shared things we must NOT break: `toDisplayPath` (used by header),
`.u-*` utilities, `.glass-panel` (ruleset/sidepanel/details also use it — header restyle must
be scoped via the `.glass-panel.dash-header` compound), `activeRepo` contract (drives
`/api/sessions` + `/api/ruleset` reloads on Transcript/Ruleset tabs).

---

## 2. Style-guide integration (the load-bearing decisions)

The repo's design system (`docs/design.md`) is: 4 base values per theme
(`--theme-bg/ink/muted/accent`), everything derived via `color-mix`, hue tokens per mode,
no hardcoded colors in component CSS, `.u-*` utilities, gate-enforced structure.

The new design is a different visual language: near-black layered surfaces
(#08080a → #0d0d0f → #0f0f11 → #141416 → #1b1b1e), hairline borders, soft large shadows,
IBM Plex Sans/Mono, one semantic amber, **no glassmorphism**. We adopt it *through* the token
system, not around it:

### 2.1 New theme `command` (becomes the default)

- Bases: `--theme-bg: #0d0d0f`, `--theme-ink: #ececee`, `--theme-muted: #8a8a90`,
  `--theme-accent: #ededef` (the near-white CTA color — accent stays neutral on purpose).
- The design uses **5 surface steps**; the derived system has 3. Two additions, made
  **globally** (all themes inherit sensible values):
  - `--bg-canvas: color-mix(in srgb, black 30%, var(--theme-bg))` — the darkest app
    backdrop behind panels (design #08080a). For light themes this derives toward a
    slightly deeper paper tone; verify visually.
  - `--bg-inset: color-mix(in srgb, var(--theme-ink) 3%, var(--theme-bg))` — input/path-bar
    inset surface (design #141416 relative to panel).
  - If `color-mix` percentages can't hit the design values acceptably, the `command`
    theme block may override individual *derived* tokens with exact hex — scoped to that
    block only, documented in `design.md` §8. Component CSS still only references tokens.
- Register in all three KEEP-IN-SYNC sites: `css/index.css`, `lib/theme/index.ts`
  (`THEMES`, swatch `bg #0d0d0f`, `accent #d6a54c`), `index.html` boot script (dark → no
  light-list change, but confirm default handling). Default theme changes
  `carbon → command` (`currentTheme()` fallback + boot script default).

### 2.2 Semantic amber token

- New hue token `--status-active: #d6a54c` (dark) + light-mode override (e.g. `#9a7325`)
  in `:root[data-mode='light']`. Per `design.md` §6 add the matching `.u-pill.status-active`
  modifier alongside it (even though the Files tab itself uses dots, not pills).
- **Scarcity rule (from DESIGNER_LEARNINGS §4):** amber marks *active repo* state and the
  header `>_` brand glyph, nothing else. It must NOT be used for selection, hover, CTAs, or
  focus rings. Selection stays greyscale. The CTA is near-white (`--theme-accent`).

### 2.3 Fonts

- Default `data-font` becomes `plex` (IBM Plex Sans — already imported and registered).
- `--font-mono` default switches JetBrains Mono → **IBM Plex Mono** (add to the Google Fonts
  `@import`, weights 400/500/600). App-wide, all themes; JetBrains stays in the fallback stack.
- Mono usage in Files follows the design's casing discipline: mono for paths, branch, counts,
  eyebrows, header meta; sans for prose (description, GIT status, LAST COMMIT subject, hints).

### 2.4 Structural conventions honored

- Files tab adopts the required `.u-panel` skeleton (`design.md` §5) — it currently violates
  it. **Deliberate deviation:** no `.u-panel-header`; the design has no in-tab header (the
  app tab bar is the chrome). Note this in `design.md` §8.
- No inline `style={{}}`; no hardcoded colors in `files/*.css` — tokens only.
- Gate constraints shape the file layout (§4): ≤2 code files/dir, `.css` beside every `.tsx`
  dir, `max-lines` 300, cognitive complexity ≤10, `id-length` ≥4.
- Ratchet: `npm run lint` total must stay ≤ 208 (`lint-baseline.json`); expect a decrease
  (the 340-line `files/index.tsx` split removes at least one warning) → finish with
  `npm run lint -- --update`.

---

## 3. Backend — new `GET /api/repo-info?path=`

All git-derived logic lives in a new **version-control module**: `src/backend/versionControl/`
(`index.ts` + colocated test). This is deliberate scoping (owner decision): everything here is
"version control"-level information, and a proper VersionControl class with real design intent
will replace it one day — so the module exposes a narrow surface (`getRepoInfo(path): Promise<RepoInfo>`
plus the exported `RepoInfo` type) and keeps every git invocation inside it. Nothing outside the
module shells out to git for repo metadata. The route in `server/index.ts` sits beside the fs
routes, uses the same `clampToHome` + error mapping as `/api/fs`, and is a thin adapter over the
module. Never shells out for non-git dirs.

Response shape:

```ts
interface RepoInfo {
  name: string;               // basename(gitRoot ?? path)
  path: string;               // absolute, clamped
  gitRoot: string | null;
  isGitRepo: boolean;
  branch: string | null;      // git rev-parse --abbrev-ref HEAD
  dirty: boolean | null;      // git status --porcelain (any output ⇒ true)
  lastCommit: string | null;  // git log -1 --format=%s
  trackedFiles: number | null;   // git ls-files count
  language: { name: string; pct: number } | null; // dominant ext from ls-files
  description: string | null; // package.json "description", else null
}
```

Implementation notes:

- `execFile('git', [...], { cwd: gitRoot, timeout: 3000 })`; one `ls-files` call feeds both
  `trackedFiles` and `language` (extension → language map: ts/tsx→TypeScript, js/jsx→JavaScript,
  py, rs, go, css, html, md, json, …; pct = dominant / total, by file count).
- Each git field degrades independently to `null` on failure (empty repo, no HEAD, timeout);
  the endpoint never 500s for a valid in-sandbox dir.
- Card render contract: `null` field ⇒ that grid cell is omitted (grid reflows); non-git dir ⇒
  GIT cell reads "not a git repository", BRANCH/LANGUAGE/FILES/LAST COMMIT omitted, CTA still
  enabled (backend allows any dir as active repo — unchanged).
- Unit tests for the pure parts (extension map, porcelain→dirty, degradation), colocated in
  `versionControl/` per gate rules. No test for the route itself (no existing route-test harness).

Existing endpoints untouched. `resolveGitRoot` stays the fast pre-check; `repo-info` is
fetched only for the selected entry.

---

## 4. Frontend — Files tab rebuild

### 4.1 New file layout (gate-compliant)

```
components/files/
  index.tsx    — FilesPanel: state, fetches (fs, resolve-root, repo-info), layout shell
  index.css    — tab layout: .u-panel wrapper, two-column body (24px pad, 22px gap)
  tree/
    index.tsx  — Rail: path bar (input + ↑ + subtle refresh), Tree/TreeNode, active legend
    index.css
  detail/
    index.tsx  — EmptyState (scene 6) + RepoDetailCard (scenes 7/8)
    index.css
```

Kept exactly as today: `STORAGE_KEY 'mc.files.root'`, `DEFAULT_ROOT '~/Programming'`,
latest-request guard (`rootReqId`), stale-gitRoot cancellation, up-at-$HOME disable,
show-hidden reload behavior, `FsEntry`/`FsListing` types, error surfacing.

New state: `repoInfo: RepoInfo | null` + loading flag, fetched on selection change
(cancel-on-change like the gitRoot effect).

### 4.2 Rail (left, 264px — was 320px)

- Elevated panel: `--bg-secondary`-tier surface, 1px hairline border, `radius 12px`, 12px pad.
- Path bar: inset surface (`--bg-inset`), mono 12px display value, `↑` up-glyph button at the
  right (replaces the toolbar's lucide `ArrowUp`); refresh survives as a small `↻` glyph next
  to it (functionality kept, visual weight near-zero). Path bar remains an editable input
  (Enter navigates) — design shows the resting state.
- Tree rows: text glyphs replace lucide — dirs `›` (rotates/becomes `⌄` when expanded), files
  `·`; **no Folder/File icons**. 13px, 6px 9px pad, radius 7px. Row click = select; chevron
  click = expand (unchanged semantics). Children indent survives.
- Selected row: `--bg-tertiary`-tier bg + `--border-active` 1px + primary text, weight 500.
- **Dim cue:** when a selection exists, non-selected rows drop to `opacity: .4`
  (transition `--anim`; hover restores full opacity for scanability).
- Active-repo row: warm-tinted bg/border (token-mixed with `--status-active`), amber `●`
  right-aligned. Shown for the row whose path equals `activeRepo` (independent of selection).
- Rail footer legend (only when `activeRepo` is set): hairline-top row, amber `●` +
  `active repo` 10.5px muted.
- Show-hidden toggle: kept, restyled as a quiet muted control at the rail bottom.

### 4.3 Detail area (right, flex)

- **Scene 6 (no selection):** centered empty state — framed glyph tile (`◈`, inset surface,
  radius 14) + "Select a repo to point your agents at" (14px/500, secondary) + "Choose a
  folder from the tree to inspect it and set it active" (12px muted). Use/extend `EmptyState`
  from `ui/` only if it fits without property collisions; otherwise a local `.fd-empty`.
- **Scenes 7/8 (selection):** the hero card — highest surface (panel bg + hairline +
  `0 18px 44px` soft shadow, radius 14, pad 28/30, 20px gap):
  - Eyebrow: mono 10px, 600, `letter-spacing .14em`, muted — `REPOSITORY`; when the shown
    repo IS the active repo: amber `●` + amber `ACTIVE REPOSITORY`.
  - Hero row: repo `name` h2 22px/600 `-0.01em` + `⎇ <branch>` mono chip (omit chip when
    branch is null).
  - Description 13px secondary (omit when null).
  - Hairline, then **real CSS grid** `repeat(3, minmax(0,1fr))`, gap 22px 40px; labels
    9.5px/600/.1em muted uppercase; values mono 12.5px (PATH/BRANCH/LANGUAGE/FILES) or sans
    13px (GIT, LAST COMMIT). Cells render only when data exists.
  - Action block: white CTA (`--theme-accent` bg, dark text, radius 9, 11px 20px pad,
    13px/600) + 12px muted hint.
    - Not active: `★ Set as Active Repo` → existing POST flow (`gitRoot ?? selected.path`),
      hint "Sets the repo your agents will run in.", disabled+spinner state while POSTing,
      error line below on failure.
    - Active (shown repo == activeRepo): `Open Agents Tab →` → switches the shell to the
      Agents tab, hint "<name> is now the active repo for all agents."
      **Shell change:** thread `onOpenAgents` (i.e. `setViewMode('agents')`) into
      `FilesPanel` props from `components/index.tsx`.
- Selecting a *file* or non-repo dir: card shows the enclosing repo (via `gitRoot`) when one
  exists; otherwise the degraded folder card (§3). CTA disabled for plain files outside any
  repo (matches current `canSetActive`).

### 4.4 Explicit deletions (frontend)

- `files/index.tsx`: the sticky footer block (selected-path line, git-status line,
  footer "Set as Active Repo" button, footer error), the two-button lucide toolbar, the
  `.files-primary` "primary view TBD" stub, all lucide imports in `files/`
  (`ChevronRight, ChevronDown, Folder, File, ArrowUp, RefreshCw, Star, GitBranch`).
- `files/index.css`: all 187 lines (every `.files-*` class) — replaced by the new
  `files/`, `files/tree/`, `files/detail/` stylesheets with new class prefixes.
- Nothing outside `components/files/` and the header is deleted. No backend deletions.

---

## 5. Header restyle (`components/dashboard/`)

Scoped via the `.glass-panel.dash-header` compound — `.glass-panel` itself is untouched
(ruleset/sidepanel/details depend on it).

- Flat bar: `--bg-secondary`-tier, hairline bottom border, **no backdrop blur** on the header.
- Left: amber mono `>_` glyph (new; uses `--status-active` as brand mark — the one sanctioned
  non-state amber) + `NOVAKAI COMMAND` 12px/600/.12em (the mock's plural "COMMANDS" is a typo).
- Tabs: pill style — active tab gets `--bg-tertiary` bg + hairline + primary text; inactive
  are borderless muted text. Replaces the `::before` dot indicator.
- Right: when `activeRepo` set, mono 12px `active repo · <basename>` (replaces the current
  path label; still `toDisplayPath`-derived basename). Event count + Settings + ViewPanel
  buttons keep their slots, restyled to match.

Other tabs are NOT reworked in this pass; they inherit the command tokens and Plex fonts
(acceptable — their layouts are token-driven) and keep their current structure. Full-app
convergence to the scene 1–5 language is a later project.

---

## 6. Work order (phases; each is an independent, verifiable commit)

1. **Tokens & theme** — `--bg-canvas`, `--bg-inset`, `--status-active` (+light override,
   +`.u-pill.status-active`), `command` theme in all 3 sync sites, default theme/font flip,
   IBM Plex Mono import + `--font-mono` swap. Update `docs/design.md` (§2 tables, §3 list,
   §8 notes). *Verify:* app boots in command, all tabs legible, theme picker round-trips.
2. **Backend repo-info** — `versionControl/` module, route, tests. *Verify:* curl a git repo,
   a non-git dir, a path outside `$HOME` (403), an empty repo.
3. **Files tab rebuild** — new `files/` structure per §4, shell prop for `onOpenAgents`.
   *Verify:* full flow — browse, expand, select (dimming), card data correct vs `git` CLI,
   set active (header meta + amber dot + legend appear, Transcript/Ruleset reload fires),
   Open Agents Tab switches view; hidden toggle, path-bar nav, up-at-home disable, error
   states all still work.
4. **Header restyle** — §5. *Verify:* all 5 tabs + settings/viewpanel toggles.
5. **Polish + gate** — side-by-side vs scene PNGs at ~1160px, `npm run lint` ≤ baseline then
   `--update`, `npm run build`.

Each phase lands as its own commit on `feat/files-redesign`; phases 3–4 are the bulk and can
be parallelized only after phase 1 merges into the branch (both depend on the tokens).

---

## 7. Decisions (resolved by Chris, 2026-07-13)

1. **Default theme flip** — yes, flip now. Theme is named `command` (not "obsidian" — that
   name belongs to another app).
2. **Exact-hex overrides** inside the `command` block — approved (scoped + documented).
3. **Language stat** — by tracked-file count.
4. **Description source** — `package.json` only for now.
5. **Refresh + show-hidden** — kept as quiet controls (existing functionality preserved,
   restyled to near-zero visual weight).
6. Scene numbering: Files scenes are 6–8; nothing from scene 5 is in scope.
7. **Version-control scoping** — all git-level info lives in `src/backend/versionControl/`
   (§3) as the seed for a future, properly designed VersionControl class.
8. **Reuse mandate** — build with/extend shared primitives (`components/ui/`, `.u-*`
   utilities, tokens) wherever possible so the theme stays consistent app-wide; adding fonts
   is fine. New visual patterns with cross-tab potential should land as shared styles, not
   one-off component CSS.
