// Addressing (docs/agent-messaging.md §5): names are short, unique,
// human-typeable — provider + ordinal at spawn (claude-1, codex-2). The
// AgentAddress roster maps name → agentId → PTY; only running agents are
// addressable.
import type { AgentInfo } from '../../terminal/manager.js';
import { CHRIS_MEMBER, isChannel, isRoom } from '../types.js';
import type { AgentAddress } from '../types.js';

/** Names no agent may ever take: the human, every channel, every room id. */
export function isReservedName(name: string): boolean {
  return name === CHRIS_MEMBER || isChannel(name) || isRoom(name);
}

/** Live roster: running agents only, addressed by their title. */
export function rosterFromAgents(agents: AgentInfo[]): AgentAddress[] {
  return agents
    .filter((agent) => agent.status === 'running')
    .map((agent) => ({
      agentId: agent.agentId,
      name: agent.title,
      provider: agent.provider === 'codex' ? 'codex' : 'claude',
    }));
}

/** First free `<provider>-<ordinal>` name — counts every non-archived title, not just running. */
export function nextSpawnName(provider: string, takenTitles: Iterable<string>): string {
  const taken = new Set(takenTitles);
  let ordinal = 1;
  while (taken.has(`${provider}-${ordinal}`)) ordinal += 1;
  return `${provider}-${ordinal}`;
}

/** Backend-enforced uniqueness for spawn titles and renames; reserved names are always taken. */
export function isNameTaken(name: string, agents: AgentInfo[], excludeAgentId?: string): boolean {
  if (isReservedName(name)) return true;
  return agents.some((agent) => agent.title === name && agent.agentId !== excludeAgentId);
}
