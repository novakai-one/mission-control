import { WebSocket } from 'ws';

const DEFAULT_BACKENDS = ['http://127.0.0.1:3031'];

export function normalizeBackends(values = []) {
  const configured = values.length > 0
    ? values
    : (process.env.NVK_BACKENDS?.split(',') ?? DEFAULT_BACKENDS);
  return [...new Set(configured.map((value) => value.trim().replace(/\/$/, '')).filter(Boolean))];
}

export function websocketUrl(backend) {
  const url = new URL(backend);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  return url.toString();
}

export async function discoverAgents(backends, fetchImpl = fetch) {
  const results = await Promise.all(normalizeBackends(backends).map(async (backend) => {
    try {
      const response = await fetchImpl(`${backend}/api/agents`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const agents = Array.isArray(body.agents) ? body.agents : [];
      return { backend, agents: agents.map((agent) => ({ ...agent, backend })) };
    } catch (error) {
      return { backend, agents: [], error: error instanceof Error ? error.message : String(error) };
    }
  }));
  return {
    agents: results.flatMap((result) => result.agents),
    unavailable: results.filter((result) => result.error).map(({ backend, error }) => ({ backend, error })),
  };
}

export function resolveAgent(agents, query) {
  const wanted = query.toLowerCase();
  const running = agents.filter((agent) => agent.status === 'running');
  const exact = running.filter((agent) => (
    agent.agentId.toLowerCase() === wanted
    || agent.title?.toLowerCase() === wanted
    || agent.sessionId?.toLowerCase() === wanted
  ));
  if (exact.length === 1) return exact[0];
  const partial = running.filter((agent) => (
    agent.agentId.toLowerCase().startsWith(wanted)
    || agent.sessionId?.toLowerCase().startsWith(wanted)
    || agent.title?.toLowerCase().includes(wanted)
  ));
  if (partial.length === 1) return partial[0];
  if (partial.length === 0) throw new Error(`No running agent matches "${query}"`);
  throw new Error(`Agent "${query}" is ambiguous: ${partial.map((agent) => agent.title).join(', ')}`);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** The inbound line format agents see in their prompt (shared with confirm.mjs). */
export function composeLiveLine(from, messageId, body) {
  return `[nvk-live from ${from} id ${messageId}] ${body.trim()}`;
}

export async function deliverMessage({
  agent,
  body,
  from = 'novakai-team',
  interrupt = false,
  WebSocketCtor = WebSocket,
}) {
  if (!body.trim()) throw new Error('Message body is required');
  const messageId = `live_${crypto.randomUUID()}`;
  const text = composeLiveLine(from, messageId, body);
  await new Promise((resolve, reject) => {
    const socket = new WebSocketCtor(websocketUrl(agent.backend));
    socket.addEventListener('open', async () => {
      if (interrupt) {
        socket.send(JSON.stringify({ type: 'agent-input', agentId: agent.agentId, data: '\u001b' }));
        await wait(250);
      }
      socket.send(JSON.stringify({ type: 'agent-input', agentId: agent.agentId, data: text }));
      await wait(60);
      socket.send(JSON.stringify({ type: 'agent-input', agentId: agent.agentId, data: '\r' }));
      await wait(250);
      socket.close();
      resolve();
    });
    socket.addEventListener('error', () => reject(new Error(`WebSocket delivery failed: ${agent.backend}`)));
  });
  return { messageId, status: 'delivered', recipientId: agent.agentId, backend: agent.backend };
}
