import { randomUUID } from 'node:crypto';
import type {
  ProjectRecord,
  SessionReference,
  ThreadRecord,
} from '../../../shared/project/schema.js';

interface ProjectRepository {
  list(): ProjectRecord[];
  load(projectId: string): ProjectRecord | null;
  save(project: ProjectRecord): ProjectRecord;
}

interface CreateProjectInput {
  name: string;
  rootPath: string;
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
}

function requireProject(repository: ProjectRepository, projectId: string): ProjectRecord {
  const project = repository.load(projectId);
  if (!project) throw new Error(`project not found: ${projectId}`);
  return project;
}

function requireThread(project: ProjectRecord, threadId: string): ThreadRecord {
  const thread = project.threads.find((entry) => entry.id === threadId);
  if (!thread) throw new Error(`thread not found: ${threadId}`);
  return thread;
}

/** Coordinates validated project and thread mutations. */
export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly createId: () => string = randomUUID,
    private readonly timestampProvider: () => string = () => new Date().toISOString(),
  ) {}

  /** Return persisted projects without provider transcript data. */
  list(): ProjectRecord[] {
    return this.repository.list();
  }

  /** Return one project or fail with an actionable message. */
  getProject(projectId: string): ProjectRecord {
    return requireProject(this.repository, projectId);
  }

  /** Create an empty project anchored to a filesystem root. */
  create(input: CreateProjectInput): ProjectRecord {
    const timestamp = this.timestampProvider();
    return this.repository.save({
      schemaVersion: 1,
      id: `project_${this.createId()}`,
      name: requireText(input.name, 'project name'),
      rootPath: requireText(input.rootPath, 'project root'),
      threads: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  /** Add a durable objective and make it active. */
  createThread(projectId: string, title: string): ProjectRecord {
    const project = this.getProject(projectId);
    const timestamp = this.timestampProvider();
    const thread: ThreadRecord = {
      id: `thread_${this.createId()}`,
      title: requireText(title, 'thread title'),
      sessionReferences: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.repository.save({
      ...project,
      threads: [...project.threads, thread],
      activeThreadId: thread.id,
      updatedAt: timestamp,
    });
  }

  /** Attach one provider-owned session without duplicating it. */
  attachSession(projectId: string, threadId: string, reference: SessionReference): ProjectRecord {
    const project = this.getProject(projectId);
    const thread = requireThread(project, threadId);
    const duplicate = thread.sessionReferences.some((entry) => (
      entry.provider === reference.provider && entry.sessionId === reference.sessionId
    ));
    if (duplicate) return project;
    const timestamp = this.timestampProvider();
    const updatedThread: ThreadRecord = {
      ...thread,
      sessionReferences: [...thread.sessionReferences, reference],
      preferredProvider: thread.preferredProvider || reference.provider,
      updatedAt: timestamp,
    };
    return this.saveThread(project, updatedThread, timestamp);
  }

  /** Select a thread without affecting any running provider process. */
  selectThread(projectId: string, threadId: string): ProjectRecord {
    const project = this.getProject(projectId);
    requireThread(project, threadId);
    const timestamp = this.timestampProvider();
    return this.repository.save({ ...project, activeThreadId: threadId, updatedAt: timestamp });
  }

  private saveThread(project: ProjectRecord, thread: ThreadRecord, timestamp: string): ProjectRecord {
    return this.repository.save({
      ...project,
      threads: project.threads.map((entry) => entry.id === thread.id ? thread : entry),
      updatedAt: timestamp,
    });
  }
}
