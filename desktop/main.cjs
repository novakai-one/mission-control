// Electron thin shell for Novakai Command.
// Attaches to a running server on :3030, or spawns `npm run prod` itself —
// a no-watch deploy snapshot (tools/deploy.mjs) so main merges no longer
// restart prod. A manual `npm run dev` still wins the :3030 attach for HMR work.
// The backend (tsx + node-pty) always runs in system Node, never inside Electron.
const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
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

function probe() {
  return new Promise((resolve) => {
    const req = http.get(PROBE_URL, { timeout: 1000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
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
    if (await probe()) return true;
    if (win?.isDestroyed() !== false) return false; // window closed while waiting
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function recover() {
  if (quitting || recovery) return recovery;
  recovery = (async () => {
    if (win && !win.isDestroyed()) await win.loadURL(splashHtml('Reconnecting&hellip;'));
    if (!devServer) startDevServer();
    if (await waitForServer()) {
      if (win && !win.isDestroyed()) await win.loadURL(APP_URL);
    } else if (win && !win.isDestroyed()) {
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

  if (await probe()) {
    try {
      await win.loadURL(APP_URL); // attach to an already-running `npm run dev`
    } catch {
      await recover();
    }
    return;
  }

  await recover();
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
