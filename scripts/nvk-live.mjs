#!/usr/bin/env node
import { deliverMessage, discoverAgents, normalizeBackends, resolveAgent } from './team/channel.mjs';

const args = process.argv.slice(2);
const command = args.shift();

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
const discovery = await discoverAgents(backends);

if (command === 'roster') {
  for (const agent of discovery.agents) {
    console.log(`${agent.status.padEnd(7)} ${agent.provider?.padEnd(6) ?? '      '} ${agent.title} · ${agent.agentId} · ${agent.backend}`);
  }
  for (const entry of discovery.unavailable) console.error(`unavailable ${entry.backend}: ${entry.error}`);
} else if (command === 'send') {
  const recipient = takeOption('--to');
  const from = takeOption('--from') ?? process.env.NVK_AGENT ?? 'human';
  const interruptIndex = args.indexOf('--interrupt');
  const interrupt = interruptIndex >= 0;
  if (interrupt) args.splice(interruptIndex, 1);
  if (!recipient || args.length === 0) {
    throw new Error('usage: nvk-live send --to <agent> [--from name] [--interrupt] "message"');
  }
  const agent = resolveAgent(discovery.agents, recipient);
  const receipt = await deliverMessage({ agent, body: args.join(' '), from, interrupt });
  console.log(`${receipt.messageId} → ${agent.title} (${receipt.status})`);
} else {
  console.error('usage: nvk-live <roster|send> [--backend URL]');
  process.exitCode = 1;
}
