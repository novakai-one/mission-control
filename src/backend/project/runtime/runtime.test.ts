import assert from 'node:assert/strict';
import type { ProjectRecord } from '../../../shared/project/schema.js';
import { ProjectService } from '../service/service.js';
import { ProjectRuntime } from './runtime.js';

class MemoryProjects {
  private readonly records = new Map<string, ProjectRecord>();
  list(): ProjectRecord[] { return [...this.records.values()]; }
  load(projectId: string): ProjectRecord | null { return this.records.get(projectId) ?? null; }
  save(project: ProjectRecord): ProjectRecord { this.records.set(project.id, project); return project; }
}

const identifiers = ['project', 'thread'];
const projects = new ProjectService(
  new MemoryProjects(),
  () => identifiers.shift()!,
  () => '2026-07-16T00:00:00.000Z',
);
const project = projects.create({ name: 'Novakai', rootPath: '/tmp/novakai' });
const threaded = projects.createThread(project.id, 'One home for AI');
let launchedInput: Record<string, unknown> | undefined;
const runtime = new ProjectRuntime(projects, {
  onSessionResolved() {},
  async launch(input) {
    launchedInput = input;
    return { agentId: 'agent-live', sessionId: 'claude-live' };
  },
});

const launched = await runtime.launch(project.id, threaded.activeThreadId!, 'claude');
assert.equal(launched.agentId, 'agent-live');
assert.equal(launched.project.threads[0]?.sessionReferences[0]?.sessionId, 'claude-live');
assert.deepEqual(launchedInput, {
  provider: 'claude', cwd: '/tmp/novakai', title: 'One home for AI · claude',
  projectId: 'project_project', threadId: 'thread_thread',
});

let notifySession: ((agent: {
  provider: 'codex'; sessionId: string; cwd: string; projectId: string; threadId: string;
}) => void) | undefined;
const deferredRuntime = new ProjectRuntime(projects, {
  onSessionResolved(listener) { notifySession = listener as typeof notifySession; },
  async launch() { return { agentId: 'agent-codex' }; },
});
const deferred = await deferredRuntime.launch(project.id, threaded.activeThreadId!, 'codex');
assert.equal(deferred.sessionId, undefined);
notifySession?.({
  provider: 'codex', sessionId: 'codex-live', cwd: '/tmp/novakai',
  projectId: project.id, threadId: threaded.activeThreadId!,
});
assert.equal(
  projects.getProject(project.id).threads[0]?.sessionReferences[1]?.sessionId,
  'codex-live',
);
console.log('PASS');
