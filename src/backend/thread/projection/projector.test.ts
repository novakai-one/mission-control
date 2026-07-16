import assert from 'node:assert/strict';
import type { ProjectRecord, ProviderId, SessionReference } from '../../../shared/project/schema.js';
import type { CanonicalEvent, SessionSnapshot } from '../../../shared/provider/schema.js';
import type { ProviderSessionSource } from '../../provider/source/index.js';
import { ThreadProjector } from './projector.js';

class FixtureSource implements ProviderSessionSource {
  constructor(
    readonly provider: ProviderId,
    private readonly events: CanonicalEvent[],
    private readonly failure?: string,
  ) {}

  read(reference: SessionReference): SessionSnapshot {
    if (this.failure) throw new Error(this.failure);
    return { provider: this.provider, sessionId: reference.sessionId, events: this.events };
  }
}

const event = (id: string, provider: ProviderId, timestamp: string): CanonicalEvent => ({
  id, provider, sessionId: `${provider}-session`, kind: 'assistant', timestamp,
  text: id, rawType: 'assistant',
});

const project: ProjectRecord = {
  schemaVersion: 1,
  id: 'project',
  name: 'Project',
  rootPath: '/tmp/project',
  activeThreadId: 'thread',
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  threads: [{
    id: 'thread', title: 'Thread', createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    sessionReferences: [
      { provider: 'claude', sessionId: 'claude-session' },
      { provider: 'codex', sessionId: 'codex-session' },
    ],
  }],
};

const duplicate = event('shared', 'claude', '2026-07-16T00:00:02.000Z');
const projector = new ThreadProjector({
  claude: new FixtureSource('claude', [duplicate, duplicate]),
  codex: new FixtureSource('codex', [event('first', 'codex', '2026-07-16T00:00:01.000Z')]),
});
const projection = projector.build(project, 'thread');
assert.deepEqual(projection.events.map((entry) => entry.id), ['first', 'shared']);

const degraded = new ThreadProjector({
  claude: new FixtureSource('claude', [], 'Claude file missing'),
  codex: new FixtureSource('codex', []),
}).build(project, 'thread');
assert.equal(degraded.issues[0]?.message, 'Claude file missing');
assert.throws(() => projector.build(project, 'missing'), /thread not found/);
console.log('PASS');
