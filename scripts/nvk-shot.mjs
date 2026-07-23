#!/usr/bin/env node
// nvk-shot — Screenshot Autopilot for Chris.
// Watches ~/Screenshots; when a new screenshot lands:
//   1. if it's a huge retina capture, makes a paste-friendly downscaled copy
//   2. copies the image to the macOS clipboard (ready for instant Cmd+V)
// The newest file is always readable by Kimi via the "look" magic phrase.
//
// Usage: node scripts/nvk-shot.mjs [--dir ~/Screenshots] [--max-width 2560] [--quiet]
// Zero dependencies. Designed to run under launchd (KeepAlive).

import { watch } from 'node:fs';
import { readdir, stat, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const DIR = path.resolve(opt('dir', path.join(homedir(), 'Screenshots')).replace(/^~/, homedir()));
const MAX_WIDTH = Number(opt('max-width', 2560));
const QUIET = args.includes('--quiet');
const SETTLE_MS = 700; // wait for macOS to finish writing the file

const log = (...a) => { if (!QUIET) console.log('[nvk-shot]', ...a); };

const run = (cmd, argv) => new Promise((resolve) => {
  execFile(cmd, argv, (err, stdout) => resolve(err ? null : stdout));
});

async function widthOf(file) {
  const out = await run('sips', ['-g', 'pixelWidth', file]);
  const m = out && out.match(/pixelWidth:\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

async function toClipboard(file) {
  // «class PNGf» puts real image data on the clipboard (not a file ref).
  const escaped = file.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const r = await run('osascript', ['-e', `set the clipboard to (read (POSIX file "${escaped}") as «class PNGf»)`]);
  return r !== null;
}

async function handleNew(file) {
  const full = path.join(DIR, file);
  const st = await stat(full).catch(() => null);
  if (!st || !st.isFile() || st.size === 0) return;

  let target = full;
  const w = await widthOf(full);
  if (w > MAX_WIDTH) {
    const small = path.join(DIR, '.paste', file);
    await run('mkdir', ['-p', path.join(DIR, '.paste')]);
    await copyFile(full, small).catch(() => null);
    await run('sips', ['-Z', String(MAX_WIDTH), small]);
    target = small;
    log(`downscaled ${w}px → ${MAX_WIDTH}px for paste`);
  }

  const ok = await toClipboard(target);
  log(ok ? `📋 ${file} → clipboard (Cmd+V ready)` : `⚠ clipboard copy failed for ${file}`);
}

// Snapshot existing files so we only react to NEW arrivals.
const known = new Set(await readdir(DIR).catch(() => []));
let timer = null;
const pending = new Set();

watch(DIR, (event, file) => {
  if (!file || known.has(file) || file.startsWith('.')) return;
  if (!/\.(png|jpe?g)$/i.test(file)) return;
  known.add(file);
  pending.add(file);
  clearTimeout(timer);
  timer = setTimeout(async () => {
    // Process the most recent arrival only — rapid-fire shots mean the
    // clipboard should hold the LATEST one.
    const batch = [...pending];
    pending.clear();
    const newest = batch[batch.length - 1];
    await handleNew(newest);
  }, SETTLE_MS);
});

log(`watching ${DIR} · max-width ${MAX_WIDTH} · clipboard auto-copy ON`);
