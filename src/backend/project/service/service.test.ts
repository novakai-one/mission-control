import assert from 'node:assert/strict';
import type { ProjectRecord } from '../../../shared/project/schema.js';
import { ProjectService } from './service.js';

class MemoryProjects {
  private readonly projects = new Map<string, ProjectRecord>();

  list(): ProjectRecord[] {
    return [...this.projects.values()];
  }

  load(projectId: string): ProjectRecord | null {
    return this.projects.get(projectId) ?? null;
  }

  save(project: ProjectRecord): ProjectRecord {
    this.projects.set(project.id, structuredClone(project));
    return structuredClone(project);
  }
}

const identifiers = ['one', 'thread'];
const service = new ProjectService(
  new MemoryProjects(),
  () => identifiers.shift()!,
  () => '2026-07-16T00:00:00.000Z',
);

const created = service.create({ name: ' Novakai IDE ', rootPath: '/tmp/novakai' });
assert.equal(created.id, 'project_one');
assert.equal(created.name, 'Novakai IDE');

const withThread = service.createThread(created.id, 'Provider integration');
assert.equal(withThread.activeThreadId, 'thread_thread');

const attached = service.attachSession(created.id, 'thread_thread', {
  provider: 'claude', sessionId: 'claude-session', cwd: '/tmp/novakai',
});
assert.equal(attached.threads[0]?.sessionReferences.length, 1);

const duplicate = service.attachSession(created.id, 'thread_thread', {
  provider: 'claude', sessionId: 'claude-session', cwd: '/tmp/novakai',
});
assert.equal(duplicate.threads[0]?.sessionReferences.length, 1);
assert.throws(() => service.selectThread(created.id, 'missing'), /thread not found/);
console.log('PASS');
