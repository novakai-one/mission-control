# Desktop app (Mac)

A thin Electron shell (`desktop/main.cjs`) that gives Novakai Command a standalone Dock app
without changing the dev workflow. The window loads the **live Vite dev server**, so repo
edits hot-reload as usual and the .app never needs rebuilding for app-code changes.

## How it works

- On launch it probes `http://127.0.0.1:3030`. If a dev server is already running
  (you ran `npm run dev` in a terminal), it just attaches.
- Otherwise it spawns `npm run dev` itself via a login shell (`/bin/zsh -lc`, so a
  Finder/Dock launch finds node/npm despite the bare GUI PATH), shows a splash, and loads
  the app once Vite answers. Server output goes to `~/Library/Logs/NovakaiCommand.log`.
- Quitting the app kills the dev-server process group — no orphaned ports.
- The backend (tsx + node-pty) always runs in system Node, never inside Electron, so the
  node-pty native module never needs an Electron ABI rebuild.

## Commands

- `npm run app` — run the shell directly (dev/testing the shell itself).
- `npm run app:build` — package `release/mac-arm64/Novakai Command.app` (unsigned, local use).
  Copy it to `/Applications`. Rebuild only when `desktop/` changes.

The packaged app resolves the repo at `/Users/christopherdasca/Programming/Novakai-Command`;
override with the `NOVAKAI_REPO` env var if the repo moves.
