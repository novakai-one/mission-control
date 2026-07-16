import type { ProjectRecord, ProviderId } from '../../../shared/project/schema.js';
import type { ProjectService } from '../service/service.js';

interface AgentLauncher {
  launch(input: {
    provider: ProviderId;
    cwd: string;
    title: string;
    projectId: string;
    threadId: string;
  }): Promise<{ agentId: string; sessionId?: string }>;
  onSessionResolved(listener: (agent: {
    provider: ProviderId;
    sessionId?: string;
    cwd: string;
    projectId?: string;
    threadId?: string;
  }) => void): void;
}

/** Result of launching and associating one provider runtime. */
export interface ProjectLaunchResult {
  project: ProjectRecord;
  agentId: string;
  sessionId?: string;
}

/** Owns provider launch and durable thread association as one operation. */
export class ProjectRuntime {
  constructor(
    private readonly projects: ProjectService,
    private readonly agents: AgentLauncher,
  ) {
    this.agents.onSessionResolved((agent) => {
      if (!agent.sessionId || !agent.projectId || !agent.threadId) return;
      this.projects.attachSession(agent.projectId, agent.threadId, {
        provider: agent.provider,
        sessionId: agent.sessionId,
        cwd: agent.cwd,
      });
    });
  }

  async launch(projectId: string, threadId: string, provider: ProviderId): Promise<ProjectLaunchResult> {
    const project = this.projects.getProject(projectId);
    const thread = project.threads.find((entry) => entry.id === threadId);
    if (!thread) throw new Error(`thread not found: ${threadId}`);
    const agent = await this.agents.launch({
      provider,
      cwd: project.rootPath,
      title: `${thread.title} · ${provider}`,
      projectId,
      threadId,
    });
    const updated = agent.sessionId
      ? this.projects.attachSession(projectId, threadId, {
        provider, sessionId: agent.sessionId, cwd: project.rootPath,
      })
      : project;
    return { project: updated, agentId: agent.agentId, ...(agent.sessionId ? { sessionId: agent.sessionId } : {}) };
  }
}
