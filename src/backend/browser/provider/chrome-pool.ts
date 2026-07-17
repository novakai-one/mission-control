// ChromePool — the impure BrowserProvider. Each launch is a fully isolated,
// headless Chrome process: its own debug port and its own user-data-dir, with no
// window at all, so it can neither collide with another instance nor steal the
// user's foreground.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserProvider } from '../broker.js';
import type { BrowserInstance, LaunchSpec } from '../types.js';
import { freePort, resolveChromePath } from './ports.js';

const READY_TIMEOUT_MS = 10_000;
const POLL_MS = 100;

async function waitForCdp(port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Chrome CDP endpoint on port ${port} did not become ready`);
}

export class ChromePool implements BrowserProvider {
  async launch(spec: LaunchSpec): Promise<BrowserInstance> {
    const port = await freePort();
    const userDataDir = mkdtempSync(join(tmpdir(), 'nvk-chrome-'));
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ];
    if (spec.headless) args.unshift('--headless=new');

    const child = spawn(resolveChromePath(), args, { detached: true, stdio: 'ignore' });
    child.unref();
    if (child.pid === undefined) throw new Error('failed to spawn Chrome');

    try {
      await waitForCdp(port);
    } catch (err) {
      try { process.kill(child.pid); } catch { /* already gone */ }
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
      throw err;
    }
    return { pid: child.pid, port, userDataDir, cdpEndpoint: `http://127.0.0.1:${port}` };
  }

  async dispose(instance: BrowserInstance): Promise<void> {
    try { process.kill(instance.pid); } catch { /* already gone */ }
    // Give Chrome a moment to release its profile files, then remove with
    // retries — killing and rm-ing in the same tick races (ENOTEMPTY).
    await new Promise((r) => setTimeout(r, 200));
    rmSync(instance.userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
}
