// Electron thin shell for Novakai Command — the LIVE lane (3030 app / 3031 api).
// Attaches only to a verified Live snapshot serve on :3030 (identity-checked
// via /api/health), or spawns `npm run prod` itself — a no-watch deploy
// snapshot (tools/deploy.mjs) so main merges never restart prod. The dev lane
// (`npm run dev`, 3130/3131) is a separate stack this shell never attaches to;
// an unknown 3030 responder fails loud instead of being loaded as Live.
// The backend (tsx + node-pty) always runs in system Node, never inside Electron.
const { app, BrowserWindow, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const APP_URL = 'http://localhost:3030';
const PROBE_URL = 'http://127.0.0.1:3030';
const STARTUP_TIMEOUT_MS = 90_000;
const LOG_FILE = path.join(os.homedir(), 'Library', 'Logs', 'NovakaiCommand.log');
const REPO_DIR = app.isPackaged
  ? (process.env.NOVAKAI_REPO || '/Users/christopherdasca/Programming/Novakai-Command')
  : path.resolve(__dirname, '..');

let devServer = null;
let win = null;
let quitting = false;
let recovery = null;

// Identity probe — only a real Live snapshot serve counts:
//   'live'    /api/health answered with our app id in static (snapshot) mode
//   'foreign' something answered but it is NOT a Live serve (legacy dev rig,
//             scratch server, unrelated listener) — never load it
//   'free'    nothing usable on the port
function probe() {
  return new Promise((resolve) => {
    const req = http.get(`${PROBE_URL}/api/health`, { timeout: 1000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const health = JSON.parse(body);
          resolve(health.application === 'novakai-command' && health.static === true ? 'live' : 'foreign');
        } catch {
          resolve('foreign');
        }
      });
    });
    req.on('error', () => resolve('free'));
    req.on('timeout', () => { req.destroy(); resolve('free'); });
  });
}

/** Record who holds 3030 so the fail-loud splash has evidence in the log. */
function logConflict() {
  try {
    const owners = execSync('lsof -nP -iTCP:3030 -sTCP:LISTEN', { encoding: 'utf8' });
    fs.appendFileSync(LOG_FILE, `\n--- foreign :3030 responder ${new Date().toISOString()} ---\n${owners}`);
  } catch { /* lsof empty or unavailable — nothing to record */ }
}

function startDevServer() {
  const log = fs.openSync(LOG_FILE, 'a');
  fs.writeSync(log, `\n--- Novakai Command shell: starting prod server ${new Date().toISOString()} ---\n`);
  // Login shell so a Finder/Dock launch (bare PATH) still finds node/npm.
  devServer = spawn('/bin/zsh', ['-lc', 'exec npm run prod'], {
    cwd: REPO_DIR,
    detached: true, // own process group, so quit can tree-kill it
    env: { ...process.env, NOVAKAI_DESKTOP_PID: String(process.pid) },
    stdio: ['ignore', log, log],
  });
  devServer.on('exit', () => {
    devServer = null;
    if (!quitting) void recover();
  });
}

function stopDevServer() {
  if (!devServer) return;
  try { process.kill(-devServer.pid, 'SIGTERM'); } catch { /* already gone */ }
  devServer = null;
}

function splashHtml(message) {
  const body = `
    <body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0e14;
                 color:#8b93a7;font:14px -apple-system,system-ui">
      <div style="text-align:center">
        <div style="font-size:20px;color:#e6e9f0;margin-bottom:8px">Novakai Command</div>
        <div>${message}</div>
      </div>
    </body>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(body);
}

async function waitForServer() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await probe();
    if (status !== 'free') return status; // 'live' or a foreign responder appeared
    if (win?.isDestroyed() !== false) return 'timeout'; // window closed while waiting
    await new Promise((r) => setTimeout(r, 500));
  }
  return 'timeout';
}

async function recover() {
  if (quitting || recovery) return recovery;
  recovery = (async () => {
    if (win && !win.isDestroyed()) await win.loadURL(splashHtml('Reconnecting&hellip;'));
    let status = await probe();
    if (status === 'free') {
      if (!devServer) startDevServer();
      status = await waitForServer();
    }
    if (win?.isDestroyed() !== false) return;
    if (status === 'live') {
      await win.loadURL(APP_URL);
    } else if (status === 'foreign') {
      logConflict();
      await win.loadURL(splashHtml(
        `Port 3030 is held by a server that is not Novakai Command Live — not loading it. Details in ${LOG_FILE}`,
      ));
    } else {
      await win.loadURL(splashHtml(`Servers did not recover. See ${LOG_FILE}`));
    }
  })().finally(() => { recovery = null; });
  return recovery;
}

async function launch() {
  win = new BrowserWindow({
    width: 1512,
    height: 945,
    backgroundColor: '#0b0e14',
    title: 'Novakai Command',
  });
  // External links open in the default browser, not in this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-fail-load', (_event, _code, _description, url, mainFrame) => {
    if (mainFrame && url.startsWith(APP_URL)) void recover();
  });
  win.webContents.on('render-process-gone', () => void recover());

  if (await probe() === 'live') {
    try {
      await win.loadURL(APP_URL); // attach to the already-running Live serve
    } catch {
      await recover();
    }
    return;
  }

  await recover(); // 'free' → spawn prod; 'foreign' → fail-loud splash
}

app.whenReady().then(launch);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) launch();
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  quitting = true;
  stopDevServer();
});
