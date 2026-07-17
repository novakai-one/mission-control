// Thin CLI client. Binds a session id (--session or NVK_SESSION) and forwards one
// verb to that session's isolated browser. Fresh process per run — all state
// lives in the broker's registry, so the next run reconnects.
//
//   NVK_SESSION=<id> npx tsx src/backend/browser/cli.ts goto <url>
//   ... click <selector> | type <selector> <text...> | press <key>
//   ... text | shot <path> | release
import { homedir } from 'node:os';
import path from 'node:path';
import { SessionBroker } from './broker.js';
import { ChromePool } from './provider/chrome-pool.js';
import { CdpControl } from './provider/cdp-control.js';
import type { BrowserCommand, CommandKind } from './types.js';

const DEFAULT_REGISTRY_DIR = path.join(homedir(), '.novakai', 'browser', 'sessions');

function parseCommand(verb: string, args: string[]): BrowserCommand {
  switch (verb as CommandKind) {
    case 'goto': return { kind: 'goto', url: args[0] };
    case 'click': return { kind: 'click', selector: args[0] };
    case 'type': return { kind: 'type', selector: args[0], text: args.slice(1).join(' ') };
    case 'press': return { kind: 'press', text: args[0] };
    case 'text': return { kind: 'text' };
    case 'shot': return { kind: 'shot', shotPath: args[0] ?? path.join(process.cwd(), 'browse-shot.png') };
    default:
      throw new Error(`unknown verb "${verb}". Use: goto|click|type|press|text|shot|release`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let sessionId = process.env.NVK_SESSION;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--session') { sessionId = argv[i + 1]; i += 1; }
    else rest.push(argv[i]);
  }
  if (!sessionId) throw new Error('no session id: pass --session <id> or set NVK_SESSION');

  const agentId = process.env.NVK_AGENT ?? 'local';
  const registryDir = process.env.NVK_BROWSER_REGISTRY ?? DEFAULT_REGISTRY_DIR;
  const [verb, ...args] = rest;
  if (!verb) throw new Error('no verb given');

  const broker = new SessionBroker({ provider: new ChromePool(), registryDir });

  if (verb === 'release') {
    await broker.release(sessionId);
    process.stderr.write(`released ${sessionId}\n`);
    return;
  }

  const command = parseCommand(verb, args);
  const handle = await broker.acquire(sessionId, agentId);
  const result = await new CdpControl().act(handle.cdpEndpoint, command);

  if (result.ok && command.kind === 'goto' && result.url) broker.record(sessionId, result.url);
  if (result.text !== undefined) process.stdout.write(result.text + '\n');
  process.stderr.write(`@ ${result.url}  "${result.title ?? ''}"${result.shotPath ? `  -> ${result.shotPath}` : ''}${result.ok ? '' : `  ERROR: ${result.error}`}\n`);
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
