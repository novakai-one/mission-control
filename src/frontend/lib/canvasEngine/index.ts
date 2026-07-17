import { useSyncExternalStore } from 'react';
import { applyCanvasCommand } from '../../../shared/canvas/commands/index.js';
import { isArchitectureDocument, isCanvasPreferences } from '../../../shared/canvas/validate/index.js';
import { defaultPreferences, emptyArchitecture } from '../../../shared/canvas/model/defaults.js';
import type { ArchitectureDocument, CanvasCommand, CanvasPreferences } from '../../../shared/canvas/model/types.js';

/** Persistence seam. Implementations own transport and storage details. */
export interface CanvasRepository {
  load(): Promise<ArchitectureDocument>;
  save(document: ArchitectureDocument): Promise<void>;
}

/** Small interface hiding canvas state lifecycle — ported from Novakai Canvas. */
export interface CanvasEngine {
  snapshot(): ArchitectureDocument;
  execute(command: CanvasCommand): void;
  replace(document: ArchitectureDocument): void;
  save(): Promise<void>;
  /** Discards in-memory state in favour of what the repository holds now. */
  reload(): Promise<void>;
  /** Revision last known to match the repository — equal to snapshot().revision when clean. */
  persistedRevision(): number;
  subscribe(listener: () => void): () => void;
}

interface EngineState {
  document: ArchitectureDocument;
  persisted: number;
}

function documentOperations(state: EngineState, publish: () => void): Pick<CanvasEngine, 'snapshot' | 'execute' | 'replace'> {
  return {
    snapshot: () => state.document,
    execute(command) {
      state.document = applyCanvasCommand(state.document, command);
      publish();
    },
    replace(next) {
      state.document = next;
      publish();
    },
  };
}

function persistenceOperations(
  state: EngineState,
  repository: CanvasRepository,
  publish: () => void,
): Pick<CanvasEngine, 'save' | 'reload' | 'persistedRevision'> {
  return {
    async save() {
      const snapshot = state.document;
      await repository.save(snapshot);
      state.persisted = snapshot.revision;
    },
    async reload() {
      const next = await repository.load();
      state.document = next;
      state.persisted = next.revision;
      publish();
    },
    persistedRevision: () => state.persisted,
  };
}

/** Deep module hiding mutation, revisioning, subscriptions, and persistence. */
export function createCanvasEngine(
  initial: ArchitectureDocument,
  repository: CanvasRepository,
): CanvasEngine {
  const state: EngineState = { document: initial, persisted: initial.revision };
  const listeners = new Set<() => void>();
  const publish = (): void => listeners.forEach((listener) => listener());

  return {
    ...documentOperations(state, publish),
    ...persistenceOperations(state, repository, publish),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

async function fetchArchitecture(endpoint: string): Promise<ArchitectureDocument> {
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return emptyArchitecture;
    const parsed: unknown = await response.json();
    return isArchitectureDocument(parsed) ? parsed : emptyArchitecture;
  } catch {
    return emptyArchitecture;
  }
}

async function putArchitecture(endpoint: string, document: ArchitectureDocument): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(document),
  });
  if (response.status === 409) throw new Error('stale-revision');
  if (!response.ok) throw new Error(`Unable to save ${endpoint}`);
}

/** HTTP repository against Command's CanvasHub (/api/canvas/architecture). */
export function createHttpCanvasRepository(endpoint = '/api/canvas/architecture'): CanvasRepository {
  return {
    load: () => fetchArchitecture(endpoint),
    save: (document) => putArchitecture(endpoint, document),
  };
}

/** Loads presentation preferences once; falls back to safe defaults. */
export async function fetchCanvasPreferences(endpoint = '/api/canvas/preferences'): Promise<CanvasPreferences> {
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return defaultPreferences;
    const parsed: unknown = await response.json();
    return isCanvasPreferences(parsed) ? parsed : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

/** Subscribes React to the framework-free canvas engine. */
export function useCanvasEngine(engine: CanvasEngine): ArchitectureDocument {
  return useSyncExternalStore(engine.subscribe, engine.snapshot, engine.snapshot);
}
