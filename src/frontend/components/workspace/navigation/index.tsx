import React, { useState } from 'react';
import type { ProjectRecord, ThreadRecord } from '../../../../shared/project/schema.js';
import './index.css';

interface WorkspaceNavigationProps {
  projects: ProjectRecord[];
  selectedProject: ProjectRecord | null;
  selectedThread: ThreadRecord | null;
  onSelectProject(projectId: string): void;
  onSelectThread(threadId: string): void;
  onCreateProject(name: string, rootPath: string): Promise<void>;
  onCreateThread(title: string): Promise<void>;
}

export function WorkspaceNavigation(props: WorkspaceNavigationProps) {
  const [projectForm, setProjectForm] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectRoot, setProjectRoot] = useState('');
  const [threadTitle, setThreadTitle] = useState('');

  async function createProject(): Promise<void> {
    await props.onCreateProject(projectName, projectRoot);
    setProjectName('');
    setProjectRoot('');
    setProjectForm(false);
  }

  async function createThread(): Promise<void> {
    await props.onCreateThread(threadTitle);
    setThreadTitle('');
  }

  return (
    <aside className="workspace-navigation">
      <div className="workspace-brand"><span>N</span> NOVAKAI</div>
      <section className="workspace-nav-section">
        <div className="workspace-nav-heading"><span>Projects</span><button onClick={() => setProjectForm(!projectForm)}>＋</button></div>
        {projectForm && (
          <div className="workspace-nav-form">
            <input aria-label="Project name" placeholder="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            <input aria-label="Project root" placeholder="/path/to/project" value={projectRoot} onChange={(event) => setProjectRoot(event.target.value)} />
            <button disabled={!projectName.trim() || !projectRoot.trim()} onClick={createProject}>Create project</button>
          </div>
        )}
        {props.projects.map((project) => (
          <button
            key={project.id}
            className={project.id === props.selectedProject?.id ? 'workspace-nav-row workspace-nav-row-active' : 'workspace-nav-row'}
            onClick={() => props.onSelectProject(project.id)}
          >
            <span className="workspace-nav-dot" />
            <span><strong>{project.name}</strong><small>{project.rootPath}</small></span>
          </button>
        ))}
      </section>
      {props.selectedProject && (
        <section className="workspace-nav-section workspace-thread-section">
          <div className="workspace-nav-heading"><span>Threads</span></div>
          {props.selectedProject.threads.map((thread) => (
            <button
              key={thread.id}
              className={thread.id === props.selectedThread?.id ? 'workspace-nav-row workspace-nav-row-active' : 'workspace-nav-row'}
              onClick={() => props.onSelectThread(thread.id)}
            >
              <span className="workspace-nav-dot" />
              <span><strong>{thread.title}</strong><small>{thread.sessionReferences.length} sessions</small></span>
            </button>
          ))}
          <div className="workspace-thread-create">
            <input aria-label="New thread title" placeholder="New thread" value={threadTitle} onChange={(event) => setThreadTitle(event.target.value)} />
            <button disabled={!threadTitle.trim()} onClick={createThread}>＋</button>
          </div>
        </section>
      )}
      <div className="workspace-local-status"><span /> Local workspace</div>
    </aside>
  );
}
