#!/usr/bin/env node
// Ownership-aware dev-lane cleanup — the `predev` hook for `npm run dev`.
//
// The old predev (`lsof -ti:3031 | xargs kill`) was owner-blind and shot the
// LIVE backend on every dev start. This tool only ever touches the dev lane's
// ports, and only kills a listener that is provably THIS workspace's own dev
// lane: same working directory AND a dev-lane command (tsx watch backend, or
// vite). Anything else is a STOP — an occupied port with an unproven owner is
// never a cleanup opportunity; report it and exit non-zero so `npm run dev`
// fails loud before vite/tsx ever race the port.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

// Honors the same override the dev backend uses (never hardcoded to one lane).
export const DEV_BACKEND_PORT = Number(process.env.NOVAKAI_SERVER_PORT) || 3131;
// vite.config.ts owns the dev app port; rigs that pass `vite --port` bypass
// `npm run dev` and this hook entirely.
export const DEV_APP_PORT = 3130;

/** True only for a process this workspace may reclaim: our cwd, our commands. */
export function ownsDevLane(info, workspace) {
  if (!info || !info.cwd) return false;
  if (path.resolve(info.cwd) !== path.resolve(workspace)) return false;
  const isDevBackend = info.command.includes('tsx') && info.command.includes('src/backend/index.ts');
  const isDevFrontend = info.command.includes('vite');
  return isDevBackend || isDevFrontend;
}

function listenerPids(port) {
  try {
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    return [...new Set(out.split('\n').filter(Boolean).map(Number))];
  } catch {
    return []; // lsof exits non-zero when nothing listens
  }
}

function processInfo(pid) {
  try {
    const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
    const cwdRecord = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' })
      .split('\n')
      .find((line) => line.startsWith('n'));
    return { pid, command, cwd: cwdRecord ? cwdRecord.slice(1) : '' };
  } catch {
    return null; // process vanished between lsof and ps
  }
}

function cmdClean() {
  const workspace = process.cwd();
  let blocked = false;
  for (const port of [DEV_BACKEND_PORT, DEV_APP_PORT]) {
    for (const pid of listenerPids(port)) {
      const info = processInfo(pid);
      if (!info) continue; // gone already — port is freeing itself
      if (ownsDevLane(info, workspace)) {
        process.kill(pid, 'SIGTERM');
        console.log(`[dev-lane] reclaimed stale own dev process ${pid} on :${port}`);
      } else {
        blocked = true;
        console.error(`[dev-lane] STOP — :${port} is held by a process this workspace does not own:`);
        console.error(`[dev-lane]   pid ${pid}  cwd ${info.cwd || 'unknown'}`);
        console.error(`[dev-lane]   cmd ${info.command || 'unknown'}`);
        console.error('[dev-lane] not killing it. Free the port yourself, or run the dev lane elsewhere via NOVAKAI_SERVER_PORT.');
      }
    }
  }
  if (blocked) process.exit(1);
}

function main() {
  const [verb] = process.argv.slice(2);
  if (verb !== 'clean') {
    console.error('usage: dev-lane.mjs clean');
    process.exit(1);
  }
  cmdClean();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
