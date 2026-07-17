import type { AgentInfo } from '../../../lib/agentSocket/index.js';

function sameAgent(left: AgentInfo, right: AgentInfo): boolean {
  return left.agentId === right.agentId
    && left.title === right.title
    && left.provider === right.provider
    && left.sessionId === right.sessionId
    && left.sessionError === right.sessionError
    && left.projectDir === right.projectDir
    && left.cwd === right.cwd
    && left.status === right.status
    && left.terminalPid === right.terminalPid
    && left.createdAt === right.createdAt
    && left.projectId === right.projectId
    && left.threadId === right.threadId;
}

/** Preserve identities so unchanged roster broadcasts do not rerender panes. */
export function reconcileAgents(previous: AgentInfo[], incoming: AgentInfo[]): AgentInfo[] {
  const byId = new Map(previous.map((agent) => [agent.agentId, agent]));
  let changed = previous.length !== incoming.length;
  const reconciled = incoming.map((agent, index) => {
    const existing = byId.get(agent.agentId);
    if (existing && sameAgent(existing, agent)) {
      if (previous[index] !== existing) changed = true;
      return existing;
    }
    changed = true;
    return agent;
  });
  return changed ? reconciled : previous;
}
