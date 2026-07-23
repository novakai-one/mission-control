# Slack Mirror (`scripts/nvk-slack-mirror.mjs`)

A read-only, one-way mirror of the team messaging journal
(`.novakai-command/messages.jsonl`) into a Slack channel. It only reads the
journal file and posts to a Slack Incoming Webhook — it never writes to the
journal, the backend, or any agent state.

## What it does

- Tails the journal (polls every 2 s, tracks byte offset, survives
  truncation/rotation).
- Posts one Slack message per new envelope:
  `*from* → *to* · 11:42 · body` (bodies truncated at ~500 chars).
- Status amendments (same message id, later line) post as a short follow-up
  line: `↳ msg_… → delivered`, `✗ msg_… → failed` — never a repost of the
  body. Failed/partial amendments are color-coded red; other status lines are
  grey.
- On Slack HTTP failure: retries once after 5 s, then logs and continues. The
  mirror never crashes because Slack hiccuped.
- Posts are spaced ~1.1 s apart (Slack webhooks allow ~1 msg/sec).

## Setup

1. Create a Slack channel (e.g. `#novakai-journal`).
2. Create an Incoming Webhook: https://api.slack.com/apps → your app →
   **Incoming Webhooks** → **Add New Webhook to Workspace** → pick the
   channel → copy the `https://hooks.slack.com/services/…` URL.
3. Give the mirror the URL — either:
   - env var (wins): `export NVK_SLACK_WEBHOOK_URL="https://hooks.slack.com/services/…"`
   - or config file: `cp .novakai-command/slack-mirror.example.json
     .novakai-command/slack-mirror.json` and paste the URL in.
     (`slack-mirror.json` is gitignored.)

## Run

```sh
node scripts/nvk-slack-mirror.mjs --backlog 20     # post last 20 lines, then follow live
node scripts/nvk-slack-mirror.mjs --backlog 0      # live only, no backlog
node scripts/nvk-slack-mirror.mjs --verbose        # log each post
```

Plain foreground process; Ctrl-C stops it.

## Test without a webhook

```sh
node scripts/nvk-slack-mirror.mjs --dry-run --backlog 5
```

`--dry-run` prints formatted messages to stdout instead of posting.
`--file <path>` overrides the journal path for fixture testing.

## Visual language

- **New messages** lead with an **inline emoji pair in the text header** —
  `🦊 *Fable* → 👤 *chris* · 12:47` — sender emoji + recipient emoji. This is
  the primary visual channel: it always renders, even when the Slack app
  overrides webhook username/avatar. Secondary channels: Slack `username` is
  the sender name, `icon_emoji` the sender emoji, and the attachment sidebar
  uses a muted per-sender color (deterministic FNV-1a hash of the sender name
  over a 12-color muted palette — stable across restarts).
- **Known-actor emoji** (loose case-insensitive substring match):
  fable 🦊 · scribe 📜 · watchdog 🐶 · chief 🎖️ · chris 👤 · manager 🧭 ·
  kimi 🌙 · claude 🎻. Unknown senders get a stable pick from
  🤖🛰️📡🧪🦉🐙🌿🔧📐🧵 via the same name hash. Recipients use the same
  mapping, with two special cases: channels (`#team`) 📣 and rooms 🏠.
- **Status semantics win over sender color:** failed/partial amendments are
  muted red `#B05A5A`, other amendments are grey `#9E9E9E`. Sender colors
  apply to new messages only.

## Known limitations

- Mirror lags by the poll interval (2 s) plus the ~1.1 s per-post spacing —
  a burst of messages trickles into Slack over seconds.
- Status amendments are follow-up messages, not edits of the original Slack
  post (Incoming Webhooks can't edit).
- No history backfill beyond `--backlog N`; restarting with a large backlog
  re-posts those lines (seen-id tracking is in-memory only).
- One-way: nothing typed in Slack reaches the journal.
