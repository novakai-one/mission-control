#!/usr/bin/env node
// Deploy-snapshot supervisor for Novakai Command's production backend.
//
// The desktop shell used to run `tsx watch src/backend/index.ts` straight out
// of the shared checkout, so every main merge that touched the backend module
// graph restarted prod (dropping ws/chat; PTYs survived only because the
// detached TerminalHost already runs from its own snapshot). This tool extends
// that snapshot pattern to the whole backend + built frontend:
//
//   snapshot [sha]  git archive <sha> -> .novakai-command/deploy/<sha>/, build
//                   the frontend inside it, record a manifest, flip `current`.
//   serve           run the pinned snapshot's backend with NO watch, serving
//                   the built frontend on the app port (same-origin api/ws),
//                   respawning on SIGHUP so `redeploy` swaps snapshots live.
//   redeploy        snapshot HEAD, flip `current`, SIGHUP the running serve.
//
// Scratch dev is untouched: `npm run dev` still uses tsx watch + vite.
import { execFileSync } from 'node:child_process';
import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const WORKSPACE = process.cwd();
const DEPLOY_DIR = path.join(WORKSPACE, '.novakai-command', 'deploy');
const CURRENT_FILE = path.join(DEPLOY_DIR, 'current.json');
const PID_FILE = path.join(DEPLOY_DIR, 'serve.pid');
const APP_PORT = Number(process.env.NOVAKAI_APP_PORT) || 3030;
const BACKEND_PORT = Number(process.env.NOVAKAI_SERVER_PORT) || 3031;
const KEEP_SNAPSHOTS = 5;
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json'];

// ---- pure helpers (exported for tools/deploy.test.mjs) --------------------

export function shortSha(sha) {
  return sha.slice(0, 12);
}

/** Hash of the workspace lockfile so a snapshot can detect dependency skew. */
export function lockfileHash(workspace = WORKSPACE) {
  for (const name of LOCKFILES) {
    const file = path.join(workspace, name);
    if (existsSync(file)) {
      return { name, hash: createHash('sha256').update(readFileSync(file)).digest('hex') };
    }
  }
  const fallback = path.join(workspace, 'package.json');
  return { name: 'package.json', hash: createHash('sha256').update(readFileSync(fallback)).digest('hex') };
}

/** True when a snapshot's recorded deps still match the workspace lockfile. */
export function depsMatch(manifest, workspace = WORKSPACE) {
  const current = lockfileHash(workspace);
  return manifest.lockfile === current.name && manifest.lockfileHash === current.hash;
}

export function snapshotDir(short) {
  return path.join(DEPLOY_DIR, short);
}

export function readCurrent() {
  if (!existsSync(CURRENT_FILE)) return null;
  return JSON.parse(readFileSync(CURRENT_FILE, 'utf8'));
}

export function writeCurrent(short) {
  mkdirSync(DEPLOY_DIR, { recursive: true });
  writeFileSync(CURRENT_FILE, `${JSON.stringify({ shortSha: short }, null, 2)}\n`);
}

// ---- git / build ----------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { cwd: WORKSPACE, encoding: 'utf8' }).trim();
}

function portInUse(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (error) => resolve(error.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, '127.0.0.1');
  });
}

function pruneOldSnapshots(keepShort) {
  if (!existsSync(DEPLOY_DIR)) return;
  const dirs = readdirSync(DEPLOY_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const stale = dirs.filter((name) => name !== keepShort);
  // Keep the newest KEEP_SNAPSHOTS by mtime; drop the rest.
  const doomed = stale
    .map((name) => ({ name, dir: snapshotDir(name) }))
    .sort((a, b) => statMtime(b.dir) - statMtime(a.dir))
    .slice(KEEP_SNAPSHOTS - 1);
  for (const { dir } of doomed) rmSync(dir, { recursive: true, force: true });
}

function statMtime(dir) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    return new Date(manifest.builtAt).getTime();
  } catch {
    return 0;
  }
}

function buildSnapshot(ref) {
  const sha = git(['rev-parse', ref]);
  const short = shortSha(sha);
  const dir = snapshotDir(short);
  const manifestPath = path.join(dir, 'manifest.json');

  if (existsSync(manifestPath) && existsSync(path.join(dir, 'dist', 'frontend', 'index.html'))) {
    console.log(`[deploy] snapshot ${short} already built — reusing`);
    return { sha, short, dir };
  }

  console.log(`[deploy] building snapshot ${short} (${ref})`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  // Source at the pinned sha only — no uncommitted working-tree drift.
  execSync(`git archive ${sha} | tar -x -C "${dir}"`, { cwd: WORKSPACE, stdio: 'inherit' });

  // Build the frontend inside the snapshot. node_modules is gitignored, so it
  // resolves from the workspace by walking up — dep skew is guarded at serve.
  console.log('[deploy] vite build (frontend)…');
  execFileSync('npx', ['vite', 'build'], { cwd: dir, stdio: 'inherit' });

  const lock = lockfileHash();
  const manifest = {
    sha,
    short,
    builtAt: new Date().toISOString(),
    lockfile: lock.name,
    lockfileHash: lock.hash,
    appPort: APP_PORT,
    backendPort: BACKEND_PORT,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[deploy] snapshot ${short} ready at ${path.relative(WORKSPACE, dir)}`);
  return { sha, short, dir };
}

function resolveCurrentSnapshot() {
  const current = readCurrent();
  if (!current) return null;
  const dir = snapshotDir(current.shortSha);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail(`current snapshot ${current.shortSha} is missing its manifest — run 'npm run redeploy'.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return { dir, manifest };
}

function fail(message) {
  console.error(`\n[deploy] ✗ ${message}\n`);
  process.exit(1);
}

// ---- verbs ----------------------------------------------------------------

function cmdSnapshot(ref = 'HEAD') {
  const { short } = buildSnapshot(ref);
  writeCurrent(short);
  pruneOldSnapshots(short);
  console.log(`[deploy] current -> ${short}`);
}

async function cmdServe() {
  // First run with no snapshot: pin HEAD so prod comes up clean.
  if (!readCurrent()) {
    console.log('[deploy] no current snapshot — pinning HEAD');
    cmdSnapshot('HEAD');
  }

  // Fail loud on port clashes instead of a crash loop.
  if (await portInUse(APP_PORT)) {
    fail(`app port ${APP_PORT} is in use — vite dev is probably holding it. Stop it (or use a scratch port) then retry.`);
  }
  if (await portInUse(BACKEND_PORT)) {
    fail(`backend port ${BACKEND_PORT} is in use — a stale backend is running. Free it: lsof -ti:${BACKEND_PORT} | xargs kill`);
  }

  mkdirSync(DEPLOY_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));

  let child = null;
  let restarting = false;
  let shuttingDown = false;

  const startChild = () => {
    const resolved = resolveCurrentSnapshot();
    if (!resolved) fail("no current snapshot to serve — run 'npm run redeploy'.");
    const { dir, manifest } = resolved;

    // Dep-skew guard: a snapshot built against different deps than the
    // workspace lockfile can boot against wrong node_modules. Refuse loudly.
    if (!depsMatch(manifest)) {
      fail(
        `dependency skew — snapshot ${manifest.short} was built against ${manifest.lockfile} ` +
        `${manifest.lockfileHash.slice(0, 12)}, workspace is ${lockfileHash().hash.slice(0, 12)}. ` +
        `Run 'npm install' if needed, then 'npm run redeploy'.`,
      );
    }

    const entry = path.join(dir, 'src', 'backend', 'index.ts');
    const tsxCli = path.join(WORKSPACE, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const staticDir = path.join(dir, 'dist', 'frontend');
    console.log(`[deploy] serving snapshot ${manifest.short} — api ${BACKEND_PORT}, app ${APP_PORT}`);
    child = spawn(process.execPath, [tsxCli, entry], {
      cwd: WORKSPACE, // config/PTY/registry paths stay workspace-relative
      env: {
        ...process.env,
        NOVAKAI_STATIC_DIR: staticDir,
        NOVAKAI_APP_PORT: String(APP_PORT),
      },
      stdio: 'inherit',
    });
    child.on('exit', (code, signal) => {
      child = null;
      if (shuttingDown) return;
      if (restarting) {
        restarting = false;
        startChild();
        return;
      }
      console.error(`[deploy] backend exited (code ${code}, signal ${signal}) — respawning in 1s`);
      setTimeout(startChild, 1000);
    });
  };

  process.on('SIGHUP', () => {
    console.log('[deploy] SIGHUP — swapping to current snapshot');
    if (child) {
      restarting = true;
      child.kill('SIGTERM');
    } else {
      startChild();
    }
  });

  const shutdown = () => {
    shuttingDown = true;
    if (child) child.kill('SIGTERM');
    try { rmSync(PID_FILE, { force: true }); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  startChild();
}

function cmdRedeploy(ref = 'HEAD') {
  const { short } = buildSnapshot(ref);
  writeCurrent(short);
  pruneOldSnapshots(short);
  console.log(`[deploy] current -> ${short}`);

  if (!existsSync(PID_FILE)) {
    console.log("[deploy] no running 'serve' — start it with 'npm run prod'");
    return;
  }
  const pid = Number(readFileSync(PID_FILE, 'utf8'));
  try {
    process.kill(pid, 'SIGHUP');
    console.log(`[deploy] signalled serve (pid ${pid}) to swap snapshots`);
  } catch {
    console.log(`[deploy] stale pidfile (pid ${pid} gone) — start with 'npm run prod'`);
  }
}

async function main() {
  const [verb, arg] = process.argv.slice(2);
  switch (verb) {
    case 'snapshot':
      cmdSnapshot(arg);
      break;
    case 'serve':
      await cmdServe();
      break;
    case 'redeploy':
      cmdRedeploy(arg);
      break;
    default:
      console.error('usage: deploy.mjs <snapshot [sha] | serve | redeploy [sha]>');
      process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[deploy] fatal:', error);
    process.exit(1);
  });
}
