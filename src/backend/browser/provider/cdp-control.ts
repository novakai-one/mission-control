// CdpControl — drives one session's target over CDP. Scoped to the last page of
// the instance's context; never calls bringToFront / activateTarget, so acting
// on a background/headless target never moves anything on screen. Mirrors the
// proven ~/.claude/browse connect-act-detach cycle.
import { chromium } from 'playwright-core';
import type { ActionResult, BrowserCommand } from '../types.js';
import type { BrowserControl } from './ports.js';

const ACTION_TIMEOUT_MS = 15_000;

export class CdpControl implements BrowserControl {
  async act(cdpEndpoint: string, cmd: BrowserCommand): Promise<ActionResult> {
    // noDefaults avoids Playwright's setDownloadBehavior call, which recent
    // Chrome rejects on a persistent debug context.
    const browser = await chromium.connectOverCDP(cdpEndpoint, { noDefaults: true });
    try {
      const context = browser.contexts()[0];
      // Collapse to ONE canonical page so every reconnecting command drives the
      // same target. Headless Chrome holds stray new-tab/about:blank targets;
      // picking by index across separate CLI connections races between them.
      let pages = context.pages();
      if (pages.length === 0) { await context.newPage(); pages = context.pages(); }
      const isStray = (url: string) => url.startsWith('chrome:') || url === 'about:blank' || url === '';
      const page = pages.find((p) => !isStray(p.url())) ?? pages[0];
      for (const other of pages) {
        if (other !== page) await other.close().catch(() => { /* best effort */ });
      }

      switch (cmd.kind) {
        case 'goto':
          await page.goto(cmd.url ?? 'about:blank', { waitUntil: 'domcontentloaded', timeout: ACTION_TIMEOUT_MS });
          break;
        case 'click':
          await page.click(cmd.selector ?? '', { timeout: ACTION_TIMEOUT_MS });
          break;
        case 'type':
          await page.fill(cmd.selector ?? '', cmd.text ?? '', { timeout: ACTION_TIMEOUT_MS });
          break;
        case 'press':
          await page.keyboard.press(cmd.text ?? 'Enter');
          break;
        case 'text': {
          const text = await page.evaluate(() => document.body.innerText);
          return { ok: true, url: page.url(), title: await safeTitle(page), text };
        }
        case 'shot':
          await page.waitForTimeout(200);
          await page.screenshot({ path: cmd.shotPath });
          return { ok: true, url: page.url(), title: await safeTitle(page), shotPath: cmd.shotPath };
      }
      return { ok: true, url: page.url(), title: await safeTitle(page) };
    } catch (err) {
      return { ok: false, url: '', error: err instanceof Error ? err.message : String(err) };
    } finally {
      // Detaches the CDP client only; the Chrome process stays alive for reuse.
      await browser.close();
    }
  }
}

async function safeTitle(page: { title: () => Promise<string> }): Promise<string> {
  try { return await page.title(); } catch { return ''; }
}
