import React from 'react';
import { useProjectWorkspace } from '../../lib/projectWorkspace/index.js';
import { WorkspaceConversation } from './conversation/index.js';
import { WorkspaceNavigation } from './navigation/index.js';
import { WorkspaceTimeline } from './timeline/index.js';
import './index.css';

/** Project-centred workspace joining navigation, timeline, and conversation. */
export function ProjectWorkspace() {
  const workspace = useProjectWorkspace();
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
        onAttach={workspace.attachSession}
      />
    </div>
  );
}
