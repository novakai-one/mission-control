// Studio shell chrome — the left rail (brand + projects + threads) and the
// workspace head (view tabs + live session chips). Ported from the approved
// prototype in docs/messaging-studio.html; brand tokens live in index.css.
import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import type { ProjectRecord, ThreadRecord } from '../../../shared/project/schema.js';
import type { AgentInfo } from '../../lib/agentSocket/index.js';
import { useHighlightedObject } from '../../lib/highlight/index.js';
import { useAttention } from '../../lib/attention/index.js';
import { agentObjectId, threadObjectId } from '../../lib/mentions/index.js';
import './index.css';

export type ViewMode = 'workspace' | 'organization' | 'files' | 'canvas' | 'analytics' | 'design' | 'agents' | 'transcript' | 'ruleset' | 'debug';

const VIEW_TABS: { mode: ViewMode; label: string }[] = [
  { mode: 'workspace', label: 'Workspace' },
  { mode: 'organization', label: 'Organization' },
  { mode: 'files', label: 'Files' },
  { mode: 'canvas', label: 'Canvas' },
  { mode: 'analytics', label: 'Analytics' },
  { mode: 'design', label: 'Design' },
  { mode: 'agents', label: 'Agents' },
  { mode: 'transcript', label: 'Transcript' },
  { mode: 'ruleset', label: 'Ruleset' },
  { mode: 'debug', label: 'Debug' },
];

interface StudioRailProps {
  projects: ProjectRecord[];
  selectedProject: ProjectRecord | null;
  selectedThread: ThreadRecord | null;
  onSelectProject(projectId: string): void;
  onSelectThread(threadId: string): void;
  onCreateProject(name: string, rootPath: string): Promise<void>;
  onCreateThread(title: string): Promise<void>;
}

function ProjectForm({ onCreateProject }: { onCreateProject(name: string, rootPath: string): Promise<void> }) {
  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');

  async function create(): Promise<void> {
    await onCreateProject(name.trim(), rootPath.trim());
    setName('');
    setRootPath('');
  }

  return (
    <div className="studio-rail-form">
      <input aria-label="Project name" placeholder="Project name" value={name} onChange={(change) => setName(change.target.value)} />
      <input aria-label="Project root" placeholder="/path/to/project" value={rootPath} onChange={(change) => setRootPath(change.target.value)} />
      <button type="button" disabled={!name.trim() || !rootPath.trim()} onClick={create}>Create Project</button>
    </div>
  );
}

function ProjectRow({ project, here, onSelect }: { project: ProjectRecord; here: boolean; onSelect(): void }) {
  return (
    <button type="button" className={here ? 'studio-thread studio-here' : 'studio-thread'} onClick={onSelect}>
      <span className="studio-dot" />
      <span className="studio-thread-name">
        {project.name}
        <small>{project.rootPath}</small>
      </span>
    </button>
  );
}

function ThreadRow({ thread, here, onSelect }: { thread: ThreadRecord; here: boolean; onSelect(): void }) {
  // A chat mention pointing at this thread lights the row — the chip stays
  // quiet, the object glows. The amber engine may additionally grant this
  // row the app's one gold dot (its thread holds the item needing Chris),
  // which releases to sage as the item settles.
  const isLit = useHighlightedObject() === threadObjectId(thread.id);
  const attention = useAttention();
  const needsYou = attention.goldThreadId === thread.id;
  const settlingHere = !needsYou && attention.settlingThreadId === thread.id;
  const rowClass = `studio-thread${here ? ' studio-here' : ''}${isLit ? ' studio-lit' : ''}`
    + `${needsYou ? ' studio-needs' : ''}${settlingHere ? ' studio-settling' : ''}`;
  return (
    <button type="button" className={rowClass} onClick={onSelect}>
      <span className="studio-dot" />
      <span className="studio-thread-name">{thread.title}</span>
      {thread.sessionReferences.length > 0 && <span className="studio-count">{thread.sessionReferences.length}</span>}
    </button>
  );
}

export function StudioRail(props: StudioRailProps) {
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState('');

  async function createThread(): Promise<void> {
    if (!threadTitle.trim()) return;
    await props.onCreateThread(threadTitle.trim());
    setThreadTitle('');
  }

  function handleThreadKeyDown(press: React.KeyboardEvent<HTMLInputElement>): void {
    if (press.key === 'Enter') void createThread();
  }

  return (
    <aside className="studio-rail">
      <div className="studio-brand">
        <span className="studio-glyph">&gt;_</span>
        <b>novakai<span>&nbsp;command</span></b>
      </div>

      <div className="studio-group">
        Projects
        <button type="button" className="studio-group-add" aria-label="New project" onClick={() => setProjectFormOpen(!projectFormOpen)}>+</button>
      </div>
      {projectFormOpen && <ProjectForm onCreateProject={async (name, rootPath) => { await props.onCreateProject(name, rootPath); setProjectFormOpen(false); }} />}
      {props.projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          here={project.id === props.selectedProject?.id}
          onSelect={() => props.onSelectProject(project.id)}
        />
      ))}

      {props.selectedProject && (
        <>
          <div className="studio-group">Threads</div>
          {props.selectedProject.threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              here={thread.id === props.selectedThread?.id}
              onSelect={() => props.onSelectThread(thread.id)}
            />
          ))}
        </>
      )}

      <div className="studio-rail-foot">
        <div className="studio-newthread">
          <input
            aria-label="New thread"
            placeholder="New thread"
            value={threadTitle}
            disabled={!props.selectedProject}
            onChange={(change) => setThreadTitle(change.target.value)}
            onKeyDown={handleThreadKeyDown}
          />
          <button type="button" aria-label="Create thread" disabled={!props.selectedProject || !threadTitle.trim()} onClick={createThread}>+</button>
        </div>
      </div>
    </aside>
  );
}

interface StudioWorkHeadProps {
  viewMode: ViewMode;
  onViewModeChange(mode: ViewMode): void;
  /** Live agents tied to the selected thread — rendered as session chips. */
  sessionAgents: AgentInfo[];
  /** The whole fleet — the hero's presence cluster. */
  agents: AgentInfo[];
  project: ProjectRecord | null;
  thread: ThreadRecord | null;
  onOpenSettings(): void;
}

const initialsOf = (title: string): string =>
  title.split(/[\s·]+/).filter(Boolean).slice(0, 2).map((word) => word[0]!).join('').toUpperCase();

/** Variant B's hero grammar on live data: kicker · big title · fact line on
 * the left, the running fleet as quiet avatar squares on the right. No gold
 * — hierarchy is scale and weight (codex ruling: no permanent CTA gold). */
function WorkHero({ project, thread, agents }: { project: ProjectRecord | null; thread: ThreadRecord | null; agents: AgentInfo[] }) {
  const running = agents.filter((agent) => agent.status === 'running');
  const shown = running.slice(0, 8);
  const title = thread?.title ?? project?.name ?? 'Novakai Command';
  const facts: string[] = [];
  if (thread) facts.push(`${thread.sessionReferences.length} session${thread.sessionReferences.length === 1 ? '' : 's'} attached`);
  if (project) facts.push(project.rootPath);
  return (
    <div className="studio-hero">
      <div className="studio-hero-main">
        <span className="studio-kicker">
          {project && project.name.toLowerCase() !== 'novakai command'
            ? `Novakai Command · ${project.name}`
            : 'Novakai Command'}
        </span>
        <h1>{title}</h1>
        {facts.length > 0 && <p>{facts.join(' · ')}</p>}
      </div>
      <div className="studio-hero-presence" title={running.map((agent) => agent.title).join(', ')}>
        <span className="studio-hero-avatars">
          {shown.map((agent) => (
            <span key={agent.agentId} className="studio-hero-avatar">{initialsOf(agent.title)}</span>
          ))}
        </span>
        <span className="studio-hero-live">
          {running.length > shown.length ? `+${running.length - shown.length} · ` : ''}{running.length} live
        </span>
      </div>
    </div>
  );
}

function SessionChip({ agent }: { agent: AgentInfo }) {
  // Lights when a chat mention names this agent (its title, e.g. claude-1).
  const isLit = useHighlightedObject() === agentObjectId(agent.title);
  return (
    <span className={isLit ? 'studio-sess studio-lit' : 'studio-sess'}>
      <span className={agent.status === 'running' ? 'studio-sess-dot studio-live' : 'studio-sess-dot'} />
      {agent.title} · {agent.sessionId.slice(0, 8)}
    </span>
  );
}

export function StudioWorkHead(props: StudioWorkHeadProps) {
  return (
    <>
      <div className="studio-work-head">
        <nav className="studio-view-tabs" aria-label="Views">
          {VIEW_TABS.map((entry) => (
            <button
              key={entry.mode}
              type="button"
              className={entry.mode === props.viewMode ? 'studio-tab studio-tab-on' : 'studio-tab'}
              onClick={() => props.onViewModeChange(entry.mode)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <span className="studio-head-spacer" />
        {props.sessionAgents.map((agent) => (
          <SessionChip key={agent.agentId} agent={agent} />
        ))}
        <button type="button" className="studio-head-glyph" title="Settings" aria-label="Settings" onClick={props.onOpenSettings}>
          <Settings size={14} />
        </button>
      </div>
      {props.viewMode === 'workspace' && (
        <WorkHero project={props.project} thread={props.thread} agents={props.agents} />
      )}
    </>
  );
}
