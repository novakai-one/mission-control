# Desktop app (Mac)

A thin Electron shell (`desktop/main.cjs`) that gives Novakai Command a standalone Dock app.
The window is the **Live lane**: it loads the pinned deploy snapshot served on :3030, so it
never restarts when repo files change. Development happens on the separate dev lane.

## The two lanes

| Lane | App | Backend | Run by |
|------|-----|---------|--------|
| Live | 3030 (snapshot static + same-origin api/ws) | 3031 | `npm run prod` (deploy-snapshot serve) — spawned by this shell if not already up |
| Dev  | 3130 (vite, HMR) | 3131 (tsx watch) | `npm run dev` in any terminal |

The lanes are independent: starting, stopping, or restarting one never kills the other's
backend. `npm run dev`'s pre-hook (`tools/dev-lane.mjs clean`) only ever reclaims dev-lane
processes it can prove belong to this workspace — it fails loud on anything else and never
touches :3031.

## How it works

- On launch it probes `http://127.0.0.1:3030/api/health` and requires a real Live identity
  (`application: "novakai-command"` with `static: true`, i.e. a snapshot serve). If one is running,
  it attaches.
- If the port is free, it spawns `npm run prod` via a login shell (`/bin/zsh -lc`, so a
  Finder/Dock launch finds node/npm despite the bare GUI PATH), shows a splash, and loads
  the app once the serve answers. Server output goes to `~/Library/Logs/NovakaiCommand.log`.
- If :3030 answers but is **not** a Live serve (legacy dev rig, scratch server, anything
  unknown), the shell refuses to load it and shows a fail-loud splash; the conflicting
  listener is recorded in the log.
- Quitting the app kills the server process group it spawned — no orphaned ports. A serve
  that predates the shell is left running.
- The backend (tsx + node-pty) always runs in system Node, never inside Electron, so the
  node-pty native module never needs an Electron ABI rebuild.

## Commands

- `npm run app` — run the shell directly (dev/testing the shell itself).
- `npm run app:build` — package `release/mac-arm64/Novakai Command.app` (unsigned, local use).
  Copy it to `/Applications`. Rebuild only when `desktop/` changes.
- `npm run redeploy` — snapshot HEAD and hot-swap the running Live serve (SIGHUP).

The packaged app resolves the repo at `/Users/christopherdasca/Programming/Novakai-Command`;
override with the `NOVAKAI_REPO` env var if the repo moves.
