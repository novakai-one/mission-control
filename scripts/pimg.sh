#!/bin/bash
# pimg — write the clipboard image to a file and print its path.
# Pairs with nvk-shot autopilot: Cmd+Shift+4 → pimg → path ready for
# terminal sessions (kimi CLI, scripts, anywhere that wants a file).
set -e
OUT_DIR="$HOME/Screenshots"
OUT="$OUT_DIR/clip-$(date +%H%M%S).png"
LATEST="$OUT_DIR/clip-latest.png"
mkdir -p "$OUT_DIR"
osascript - "$OUT" <<'OSA'
on run argv
  set outPath to item 1 of argv
  try
    set imgData to the clipboard as «class PNGf»
  on error
    do shell script "echo 'NO_IMAGE_ON_CLIPBOARD' >&2; exit 1"
  end try
  set f to open for access (POSIX file outPath) with write permission
  write imgData to f
  close access f
end run
OSA
cp "$OUT" "$LATEST"
echo "$OUT"
