import assert from 'node:assert/strict';
import { discoverAgents, resolveAgent, websocketUrl } from './channel.mjs';

assert.equal(websocketUrl('http://127.0.0.1:3031'), 'ws://127.0.0.1:3031/ws');
assert.equal(websocketUrl('https://command.test/'), 'wss://command.test/ws');

const fetchImpl = async (url) => ({
  ok: true,
  json: async () => ({ agents: [{ agentId: url.includes('3031') ? 'a1' : 'a2', title: url.includes('3031') ? 'Fable Lead' : 'Codex Analytics', status: 'running', sessionId: 'session' }] }),
});
const discovery = await discoverAgents(['http://127.0.0.1:3031', 'http://127.0.0.1:3131'], fetchImpl);
assert.equal(discovery.agents.length, 2);
assert.equal(resolveAgent(discovery.agents, 'fable').agentId, 'a1');
assert.equal(resolveAgent(discovery.agents, 'a2').title, 'Codex Analytics');
assert.throws(() => resolveAgent(discovery.agents, 'missing'), /No running agent/);

console.log('channel tests passed');
