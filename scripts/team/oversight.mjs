import { discoverAgents } from './channel.mjs';

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

export function inferSubagentState(parentEvents, subagent, now = Date.now(), staleMs = 120_000) {
  const launchResult = parentEvents.find((event) => (
    event.kind === 'tool_result' && event.toolUseId === subagent.toolUseId
  ));
  const asyncMatch = launchResult?.content?.match(/Async agent launched successfully[\s\S]*?agentId:\s*([\w-]+)/);
  const done = asyncMatch
    ? parentEvents.some((event) => {
      const payload = event.content ?? event.text ?? '';
      const matchesTask = payload.includes(`<task_id>${asyncMatch[1]}</task_id>`)
        || payload.includes(`<task-id>${asyncMatch[1]}</task-id>`);
      return matchesTask
        && payload.includes('<status>completed</status>');
    })
    : Boolean(launchResult);
  if (done) return 'done';
  return now - subagent.modified > staleMs ? 'stale' : 'running';
}

function latestTimestamp(events) {
  return events.reduce((latest, event) => (
    typeof event.ts === 'string' && event.ts > latest ? event.ts : latest
  ), '');
}

async function inspectAgent(agent, fetchImpl, now, staleMs) {
  if (!agent.projectDir || !agent.sessionId) return { ...agent, activity: 'unconfigured', subagents: [] };
  const query = new URLSearchParams({ project: agent.projectDir, session: agent.sessionId });
  try {
    const [subagents, events] = await Promise.all([
      fetchJson(`${agent.backend}/api/subagents?${query}`, fetchImpl),
      fetchJson(`${agent.backend}/api/transcript?${query}`, fetchImpl),
    ]);
    const inspected = subagents.map((subagent) => ({
      ...subagent,
      state: inferSubagentState(events, subagent, now, staleMs),
      quietSeconds: Math.max(0, Math.round((now - subagent.modified) / 1000)),
    }));
    return {
      ...agent,
      activity: latestTimestamp(events) || agent.createdAt,
      subagents: inspected,
    };
  } catch (error) {
    return {
      ...agent,
      activity: 'unavailable',
      subagents: [],
      inspectionError: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function inspectTeam(backends, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now();
  const staleMs = options.staleMs ?? 120_000;
  const discovery = await discoverAgents(backends, fetchImpl);
  const agents = await Promise.all(discovery.agents.map((agent) => (
    inspectAgent(agent, fetchImpl, now, staleMs)
  )));
  return { generatedAt: new Date(now).toISOString(), agents, unavailable: discovery.unavailable };
}

function stateCounts(subagents) {
  return subagents.reduce((counts, subagent) => ({
    ...counts,
    [subagent.state]: (counts[subagent.state] ?? 0) + 1,
  }), {});
}

export function renderOversight(snapshot) {
  const running = snapshot.agents.filter((agent) => agent.status === 'running');
  const lines = [`Novakai oversight · ${running.length}/${snapshot.agents.length} agents running`];
  for (const agent of running) {
    const counts = stateCounts(agent.subagents);
    const summary = agent.subagents.length === 0
      ? 'no subagents'
      : `${counts.running ?? 0} running, ${counts.done ?? 0} done, ${counts.stale ?? 0} stale`;
    lines.push(`- ${agent.title} · ${agent.provider ?? 'unknown'} · ${summary}`);
    for (const subagent of agent.subagents.filter((entry) => entry.state === 'stale')) {
      lines.push(`  ! ${subagent.description || subagent.agentId} quiet ${subagent.quietSeconds}s`);
    }
    if (agent.inspectionError) lines.push(`  ! inspection unavailable: ${agent.inspectionError}`);
  }
  for (const entry of snapshot.unavailable) lines.push(`! backend unavailable: ${entry.backend}`);
  return lines.join('\n');
}

export function renderNotification(snapshot) {
  const running = snapshot.agents.filter((agent) => agent.status === 'running');
  const subagents = running.flatMap((agent) => agent.subagents.map((subagent) => ({
    ...subagent,
    owner: agent.title,
  })));
  const stale = subagents.filter((subagent) => subagent.state === 'stale');
  const done = subagents.filter((subagent) => subagent.state === 'done');
  const lines = [
    `Oversight: ${running.length} agents running; ${subagents.length} subagents; ${done.length} done; ${stale.length} stale.`,
  ];
  for (const subagent of stale) {
    lines.push(`Attention: ${subagent.owner} / ${subagent.description || subagent.agentId} quiet ${subagent.quietSeconds}s.`);
  }
  return lines.join('\n');
}

export function oversightFingerprint(snapshot) {
  const agents = [...snapshot.agents].sort((first, second) => first.agentId.localeCompare(second.agentId));
  return JSON.stringify(agents.map((agent) => ({
    id: agent.agentId,
    status: agent.status,
    subagents: [...agent.subagents]
      .sort((first, second) => first.agentId.localeCompare(second.agentId))
      .map((subagent) => ({ id: subagent.agentId, state: subagent.state })),
    error: agent.inspectionError ?? null,
  })));
}
