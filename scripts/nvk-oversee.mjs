#!/usr/bin/env node
import { deliverMessage, discoverAgents, normalizeBackends, resolveAgent } from './team/channel.mjs';
import { inspectTeam, oversightFingerprint, renderNotification, renderOversight } from './team/oversight.mjs';

const args = process.argv.slice(2);
const command = args.shift() ?? 'once';

function takeOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args.splice(index, 2)[1];
}

function takeAll(name) {
  const values = [];
  while (args.includes(name)) values.push(takeOption(name));
  return values.filter(Boolean);
}

const backends = normalizeBackends(takeAll('--backend'));
const intervalMs = Number(takeOption('--interval') ?? 15) * 1000;
const staleMs = Number(takeOption('--stale') ?? 120) * 1000;
const heartbeatMs = Number(takeOption('--heartbeat') ?? 600) * 1000;
const notify = takeOption('--notify');
const monitor = takeOption('--monitor');
const json = args.includes('--json');
let previous = '';
let lastPublishedAt = 0;

async function run() {
  const inspected = await inspectTeam(backends, { staleMs });
  const snapshot = monitor
    ? {
        ...inspected,
        agents: inspected.agents.filter((agent) => (
          agent.agentId === monitor || agent.title?.toLowerCase().includes(monitor.toLowerCase())
        )),
      }
    : inspected;
  const fingerprint = oversightFingerprint(snapshot);
  const unchanged = fingerprint === previous;
  if (unchanged && Date.now() - lastPublishedAt < heartbeatMs) return;
  previous = fingerprint;
  lastPublishedAt = Date.now();
  const report = renderOversight(snapshot);
  console.log(json ? JSON.stringify(snapshot, null, 2) : report);
  if (!notify) return;
  const discovery = await discoverAgents(backends);
  const agent = resolveAgent(discovery.agents, notify);
  await deliverMessage({ agent, from: 'novakai-oversight', body: renderNotification(snapshot) });
}

await run();
if (command === 'watch') setInterval(() => void run().catch((error) => console.error(error.message)), intervalMs);
else if (command !== 'once') {
  console.error('usage: nvk-oversee <once|watch> [--backend URL] [--monitor agent] [--interval seconds] [--stale seconds] [--heartbeat seconds] [--notify agent] [--json]');
  process.exitCode = 1;
}
