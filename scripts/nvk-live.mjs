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

if (command === 'roster') {
  const discovery = await discoverAgents(backends);
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
  if (recipient.startsWith('room_')) {
    const backend = await resolveRoomBackend(recipient, backends);
    const result = await requestJson(backend, '/api/messages', {
      method: 'POST',
      body: { from, to: recipient, delivery: interrupt ? 'interrupt' : 'normal', body: args.join(' ') },
    });
    console.log(`${result.envelope.id} → ${recipient} (${result.envelope.status})`);
  } else {
    const discovery = await discoverAgents(backends);
    const agent = resolveAgent(discovery.agents, recipient);
    const receipt = await deliverMessage({ agent, body: args.join(' '), from, interrupt });
    console.log(`${receipt.messageId} → ${agent.title} (${receipt.status})`);
  }
} else if (command === 'room') {
  const roomCommand = args.shift();
  if (roomCommand === 'create') {
    const name = takeOption('--name');
    const members = takeAll('--member');
    const from = takeOption('--from') ?? process.env.NVK_AGENT ?? 'chris';
    if (!name) {
      throw new Error('usage: nvk-live room create --name <name> --member <agent> [--member <agent>] [--from name]');
    }
    if (backends.length !== 1) {
      throw new Error('room create requires exactly one --backend');
    }
    const result = await requestJson(backends[0], '/api/rooms', {
      method: 'POST',
      body: { name, members, from },
    });
    console.log(`${result.room.roomId} ${result.room.name} · ${result.room.members.join(', ')}`);
  } else if (roomCommand === 'list') {
    for (const backend of backends) {
      const result = await requestJson(backend, '/api/rooms');
      for (const room of result.rooms) {
        console.log(`${room.roomId} ${room.name} · ${room.members.join(', ')} · ${backend}`);
      }
    }
  } else {
    throw new Error('usage: nvk-live room <create|list> [--backend URL]');
  }
} else {
  console.error('usage: nvk-live <roster|send|room> [--backend URL]');
  process.exitCode = 1;
}

async function requestJson(backend, pathname, options = {}) {
  const response = await fetch(`${backend}${pathname}`, {
    method: options.method ?? 'GET',
    ...(options.body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(options.body) }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status} from ${backend}${pathname}`);
  }
  return payload;
}

async function resolveRoomBackend(roomId, candidates) {
  if (candidates.length === 1) return candidates[0];
  const matches = [];
  for (const backend of candidates) {
    const result = await requestJson(backend, '/api/rooms');
    if (result.rooms.some((room) => room.roomId === roomId)) matches.push(backend);
  }
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new Error(`No room matches "${roomId}"`);
  throw new Error(`Room "${roomId}" exists on multiple backends; pass one --backend`);
}
