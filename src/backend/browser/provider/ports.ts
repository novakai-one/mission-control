// Small impure helpers shared by the adapters, plus the control port.
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import type { ActionResult, BrowserCommand } from '../types.js';

/** Drives a single already-running target over CDP. */
export interface BrowserControl {
  act(cdpEndpoint: string, cmd: BrowserCommand): Promise<ActionResult>;
}

/** Ask the OS for a free TCP port so instances never collide (never 9222). */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('could not determine a free port')));
      }
    });
  });
}

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Resolve the Chrome binary: CHROME_PATH env wins, else the macOS default. */
export function resolveChromePath(): string {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync(MAC_CHROME)) return MAC_CHROME;
  throw new Error('Chrome not found. Set CHROME_PATH to the Chrome binary.');
}
