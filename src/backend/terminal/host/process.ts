import path from 'node:path';
import { TerminalManager } from '../manager.js';
import { watchDesktopOwner } from './owner/index.js';
import { TerminalHostServer } from './server/index.js';

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const workspace = option('--workspace');
const socketPath = option('--socket');
const registryPath = path.join(workspace, '.novakai-command', 'agents.json');
const host = new TerminalHostServer(socketPath, new TerminalManager(registryPath));

await host.listen();
console.log(`[TerminalHost] pid ${process.pid} listening at ${socketPath}`);

async function stop(): Promise<void> {
  await host.close();
  process.exit(0);
}

process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());

const desktopPid = Number.parseInt(process.env.NOVAKAI_DESKTOP_PID ?? '', 10);
watchDesktopOwner(Number.isFinite(desktopPid) ? desktopPid : undefined, () => void stop());
