import React from 'react';
import { useProjectWorkspace } from '../../lib/projectWorkspace/index.js';
import { WorkspaceConversation } from './conversation/index.js';
import { WorkspaceNavigation } from './navigation/index.js';
import { WorkspaceTimeline } from './timeline/index.js';
import './index.css';
import type { AgentInfo } from '../../lib/agentSocket/index.js';

interface ProjectWorkspaceProps {
  agents: AgentInfo[];
  onAgentLaunched(agentId: string): void;
  onOpenAgent(agentId: string): void;
}

/** Project-centred workspace joining navigation, timeline, and conversation. */
export function ProjectWorkspace({ agents, onAgentLaunched, onOpenAgent }: ProjectWorkspaceProps) {
  const workspace = useProjectWorkspace(onAgentLaunched);
  const runtimeAgent = agents
    .filter((agent) => agent.projectId === workspace.selectedProject?.id && agent.threadId === workspace.selectedThread?.id)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0] ?? null;
  return (
    <div className="project-workspace shell-main">
      <WorkspaceNavigation
        projects={workspace.projects}
        selectedProject={workspace.selectedProject}
        selectedThread={workspace.selectedThread}
        onSelectProject={workspace.selectProject}
        onSelectThread={workspace.selectThread}
        onCreateProject={workspace.createProject}
        onCreateThread={workspace.createThread}
      />
      <WorkspaceTimeline
        project={workspace.selectedProject}
        thread={workspace.selectedThread}
        projection={workspace.projection}
        loading={workspace.loading}
        error={workspace.error}
      />
      <WorkspaceConversation
        project={workspace.selectedProject}
        thread={workspace.selectedThread}
        projection={workspace.projection}
        runtimeAgent={runtimeAgent}
        onLaunch={workspace.launchProvider}
        onAttach={workspace.attachSession}
        onOpenAgent={onOpenAgent}
      />
    </div>
  );
}
