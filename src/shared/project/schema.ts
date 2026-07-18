/** Supported transcript owners referenced by Novakai threads. */
export type ProviderId = 'claude' | 'codex' | 'kimi';

/** Every spawnable provider, in UI order. */
export const PROVIDER_IDS: ProviderId[] = ['claude', 'codex', 'kimi'];

/** Pointer to an authoritative provider-owned conversation. */
export interface SessionReference {
  provider: ProviderId;
  sessionId: string;
  cwd?: string;
}

/** Durable Novakai objective containing provider session pointers. */
export interface ThreadRecord {
  id: string;
  title: string;
  sessionReferences: SessionReference[];
  preferredProvider?: ProviderId;
  createdAt: string;
  updatedAt: string;
}

/** Small persisted project record; provider transcripts remain external. */
export interface ProjectRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  rootPath: string;
  threads: ThreadRecord[];
  activeThreadId?: string;
  createdAt: string;
  updatedAt: string;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function providerId(value: unknown, field: string): ProviderId {
  if (!PROVIDER_IDS.includes(value as ProviderId)) {
    throw new Error(`${field} must be one of ${PROVIDER_IDS.join(', ')}`);
  }
  return value as ProviderId;
}

function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, field);
}

function sessionReference(value: unknown, field: string): SessionReference {
  if (!value || typeof value !== 'object') throw new Error(`${field} must be an object`);
  const entry = value as Record<string, unknown>;
  const cwd = optionalString(entry.cwd, `${field}.cwd`);
  return {
    provider: providerId(entry.provider, `${field}.provider`),
    sessionId: requiredString(entry.sessionId, `${field}.sessionId`),
    ...(cwd ? { cwd } : {}),
  };
}

function threadRecord(value: unknown, field: string): ThreadRecord {
  if (!value || typeof value !== 'object') throw new Error(`${field} must be an object`);
  const entry = value as Record<string, unknown>;
  if (!Array.isArray(entry.sessionReferences)) {
    throw new Error(`${field}.sessionReferences must be an array`);
  }
  const preferredProvider = entry.preferredProvider === undefined
    ? undefined
    : providerId(entry.preferredProvider, `${field}.preferredProvider`);
  return {
    id: requiredString(entry.id, `${field}.id`),
    title: requiredString(entry.title, `${field}.title`),
    sessionReferences: entry.sessionReferences.map((item, index) => sessionReference(item, `${field}.sessionReferences[${index}]`)),
    ...(preferredProvider ? { preferredProvider } : {}),
    createdAt: requiredString(entry.createdAt, `${field}.createdAt`),
    updatedAt: requiredString(entry.updatedAt, `${field}.updatedAt`),
  };
}

/** Validate untrusted JSON and return the canonical project shape. */
export function parseProjectRecord(value: unknown): ProjectRecord {
  if (!value || typeof value !== 'object') throw new Error('project must be an object');
  const entry = value as Record<string, unknown>;
  if (entry.schemaVersion !== 1) throw new Error('schemaVersion must equal 1');
  if (!Array.isArray(entry.threads)) throw new Error('threads must be an array');
  const activeThreadId = optionalString(entry.activeThreadId, 'activeThreadId');
  return {
    schemaVersion: 1,
    id: requiredString(entry.id, 'id'),
    name: requiredString(entry.name, 'name'),
    rootPath: requiredString(entry.rootPath, 'rootPath'),
    threads: entry.threads.map((item, index) => threadRecord(item, `threads[${index}]`)),
    ...(activeThreadId ? { activeThreadId } : {}),
    createdAt: requiredString(entry.createdAt, 'createdAt'),
    updatedAt: requiredString(entry.updatedAt, 'updatedAt'),
  };
}
