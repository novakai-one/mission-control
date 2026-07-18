import type { ProjectRecord, ProviderId, ThreadRecord } from '../../../shared/project/schema.js';
import {
  orderCanonicalEvents,
  type CanonicalEvent,
  type SessionIssue,
  type ThreadProjection,
} from '../../../shared/provider/schema.js';
import type { ProviderSessionSource } from '../../provider/source/index.js';

type SessionSources = Partial<Record<ProviderId, ProviderSessionSource>>;

function requireThread(project: ProjectRecord, threadId: string): ThreadRecord {
  const thread = project.threads.find((entry) => entry.id === threadId);
  if (!thread) throw new Error(`thread not found: ${threadId}`);
  return thread;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Builds one deterministic thread timeline from provider session pointers. */
export class ThreadProjector {
  constructor(private readonly sources: SessionSources) {}

  /** Read every attached session while preserving recoverable failures. */
  build(project: ProjectRecord, threadId: string): ThreadProjection {
    const thread = requireThread(project, threadId);
    const events: CanonicalEvent[] = [];
    const issues: SessionIssue[] = [];
    for (const reference of thread.sessionReferences) {
      try {
        const source = this.sources[reference.provider];
        if (!source) throw new Error(`no session source for provider ${reference.provider}`);
        events.push(...source.read(reference).events);
      } catch (error) {
        issues.push({ reference, message: errorMessage(error) });
      }
    }
    return { thread, events: this.deduplicate(events), issues };
  }

  private deduplicate(events: CanonicalEvent[]): CanonicalEvent[] {
    return orderCanonicalEvents([...new Map(events.map((event) => [event.id, event])).values()]);
  }
}
