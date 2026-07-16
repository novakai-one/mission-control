import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseProjectRecord, type ProjectRecord } from '../../../shared/project/schema.js';

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function assertProjectId(projectId: string): void {
  if (!PROJECT_ID.test(projectId)) throw new Error('project id contains unsupported characters');
}

/** JSON-backed project persistence with atomic replacement writes. */
export class ProjectStore {
  constructor(
    private readonly projectsRoot = path.join(homedir(), '.novakai-command', 'projects'),
  ) {}

  /** List every persisted project ordered by name. */
  list(): ProjectRecord[] {
    if (!existsSync(this.projectsRoot)) return [];
    return readdirSync(this.projectsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.loadRequired(entry.name))
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  /** Load one project, returning null when it does not exist. */
  load(projectId: string): ProjectRecord | null {
    assertProjectId(projectId);
    const projectPath = this.projectPath(projectId);
    if (!existsSync(projectPath)) return null;
    return this.read(projectPath);
  }

  /** Validate and atomically persist one project record. */
  save(project: ProjectRecord): ProjectRecord {
    const validated = parseProjectRecord(project);
    assertProjectId(validated.id);
    const targetPath = this.projectPath(validated.id);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, targetPath);
    return validated;
  }

  private loadRequired(projectId: string): ProjectRecord {
    const project = this.load(projectId);
    if (!project) throw new Error(`project disappeared while listing: ${projectId}`);
    return project;
  }

  private projectPath(projectId: string): string {
    return path.join(this.projectsRoot, projectId, 'project.json');
  }

  private read(projectPath: string): ProjectRecord {
    try {
      return parseProjectRecord(JSON.parse(readFileSync(projectPath, 'utf8')));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid project file ${projectPath}: ${reason}`);
    }
  }
}
