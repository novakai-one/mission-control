import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ProjectRecord,
  ProviderId,
  SessionReference,
} from '../../../shared/project/schema.js';
import type { ThreadProjection } from '../../../shared/provider/schema.js';

interface LaunchResult {
  project: ProjectRecord;
  agentId: string;
  sessionId?: string;
}

async function requestJson<T>(resource: string, options?: RequestInit): Promise<T> {
  const response = await fetch(resource, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body as T;
}

function jsonRequest(method: string, body: object): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function useProjectRecords() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    requestJson<{ projects: ProjectRecord[] }>('/api/projects')
      .then((result) => {
        setProjects(result.projects);
        setSelectedProjectId(result.projects[0]?.id ?? null);
      })
      .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => setLoading(false));
  }, []);
  return { projects, setProjects, selectedProjectId, setSelectedProjectId, loading, error, setError };
}

function useSelectedProjectPolling(
  projectId: string | null,
  replaceProject: (project: ProjectRecord) => void,
): void {
  useEffect(() => {
    if (!projectId) return;
    const load = () => requestJson<ProjectRecord>(`/api/projects/${projectId}`).then(replaceProject).catch(() => {});
    const interval = setInterval(load, 1_000);
    return () => clearInterval(interval);
  }, [projectId]);
}

function startProjectionPolling(
  resource: string,
  onProjection: (projection: ThreadProjection) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  const load = () => requestJson<ThreadProjection>(resource)
    .then((result) => { if (active) onProjection(result); })
    .catch((failure) => { if (active) onError(failure); });
  void load();
  const interval = setInterval(load, 1_000);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

function useThreadProjection(project: ProjectRecord | null) {
  const thread = project?.threads.find((entry) => entry.id === project.activeThreadId)
    ?? project?.threads[0]
    ?? null;
  const [projection, setProjection] = useState<ThreadProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!project || !thread) {
      setProjection(null);
      return;
    }
    setError(null);
    const resource = `/api/projects/${project.id}/threads/${thread.id}/events`;
    return startProjectionPolling(resource, setProjection, (failure) => {
      setError(failure instanceof Error ? failure.message : String(failure));
    });
  }, [project?.id, thread?.id, thread?.sessionReferences.length]);
  return { thread, projection, error };
}

function createWorkspaceOperations(
  project: ProjectRecord | null,
  threadId: string | undefined,
  replaceProject: (project: ProjectRecord) => void,
  onAgentLaunched: (agentId: string) => void,
) {
  return {
    ...createWorkspaceActions(project, replaceProject),
    attachSession: createSessionAttacher(project, threadId, replaceProject),
    launchProvider: createProviderLauncher(project, threadId, replaceProject, onAgentLaunched),
  };
}

function createProjectReplacer(
  setProjects: Dispatch<SetStateAction<ProjectRecord[]>>,
  selectProject: (projectId: string) => void,
) {
  function replaceProject(project: ProjectRecord): void {
    setProjects((current) => {
      const exists = current.some((entry) => entry.id === project.id);
      return exists
        ? current.map((entry) => entry.id === project.id ? project : entry)
        : [...current, project];
    });
    selectProject(project.id);
  }
  return replaceProject;
}

function createWorkspaceActions(project: ProjectRecord | null, replaceProject: (project: ProjectRecord) => void) {
  const createProject = async (name: string, rootPath: string) => {
    const request = jsonRequest('POST', { name, rootPath });
    replaceProject(await requestJson<ProjectRecord>('/api/projects', request));
  };
  const createThread = async (title: string) => {
    if (!project) return;
    const resource = `/api/projects/${project.id}/threads`;
    const updatedProject = await requestJson<ProjectRecord>(resource, jsonRequest('POST', { title }));
    replaceProject(updatedProject);
  };
  const selectThread = async (threadId: string) => {
    if (!project) return;
    const resource = `/api/projects/${project.id}/threads/${threadId}/select`;
    replaceProject(await requestJson<ProjectRecord>(resource, jsonRequest('POST', {})));
  };
  return { createProject, createThread, selectThread };
}

function createSessionAttacher(
  project: ProjectRecord | null,
  threadId: string | undefined,
  replaceProject: (project: ProjectRecord) => void,
) {
  return async (provider: ProviderId, sessionId: string, cwd?: string) => {
    if (!project || !threadId) return;
    const reference: SessionReference = { provider, sessionId, ...(cwd ? { cwd } : {}) };
    const resource = `/api/projects/${project.id}/threads/${threadId}/sessions`;
    replaceProject(await requestJson<ProjectRecord>(resource, jsonRequest('POST', reference)));
  };
}

function createProviderLauncher(
  project: ProjectRecord | null,
  threadId: string | undefined,
  replaceProject: (project: ProjectRecord) => void,
  onAgentLaunched: (agentId: string) => void,
) {
  return async (provider: ProviderId) => {
    if (!project || !threadId) throw new Error('Select a project thread first');
    const resource = `/api/projects/${project.id}/threads/${threadId}/launch`;
    const result = await requestJson<LaunchResult>(resource, jsonRequest('POST', { provider }));
    replaceProject(result.project);
    onAgentLaunched(result.agentId);
    return result;
  };
}

/** Stateful project workspace interface consumed by the Projects view. */
export function useProjectWorkspace(onAgentLaunched: (agentId: string) => void = () => {}) {
  const records = useProjectRecords();
  const selectedProject = useMemo(() => records.projects.find((project) => project.id === records.selectedProjectId) ?? null, [records.projects, records.selectedProjectId]);
  const threadState = useThreadProjection(selectedProject);
  const replaceProject = createProjectReplacer(records.setProjects, records.setSelectedProjectId);
  useSelectedProjectPolling(records.selectedProjectId, replaceProject);
  const operations = createWorkspaceOperations(
    selectedProject, threadState.thread?.id, replaceProject, onAgentLaunched,
  );
  return {
    projects: records.projects,
    selectedProject,
    selectedThread: threadState.thread,
    projection: threadState.projection,
    loading: records.loading,
    error: records.error ?? threadState.error,
    selectProject: records.setSelectedProjectId,
    ...operations,
  };
}
