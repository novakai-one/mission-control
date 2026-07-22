// Typed surface of the store engine facade for TypeScript callers
// (objectModel). Kept minimal: only what the application layer consumes —
// the engine's internals stay JS-owned and CLI-tested.

export interface Violation {
  code: string;
  message: string;
  storeFile: string;
  recordId?: string;
  line?: number;
}

export interface StoreRecord {
  line: number;
  raw: string;
  block: Record<string, unknown>;
}

export interface Snapshot {
  files: Record<string, { records: StoreRecord[]; violations: Violation[] }>;
}

export class StoreValidationError extends Error {
  violations: Violation[];
}
export class StoreRefusalError extends Error {}
export class StoreConflictError extends StoreRefusalError {}

export function readStoreDir(storeDir: string): Snapshot;

export function appendLine(
  storeDir: string,
  storeFile: string,
  rawLine: string,
  options?: { lockTimeoutMs?: number; baselinePath?: string },
): { id: string; storeFile: string; bytesAppended: number };

export function replaceLine(
  storeDir: string,
  storeFile: string,
  id: string,
  candidateLine: string,
  options?: {
    expectedRaw: string;
    lockTimeoutMs?: number;
    seams?: {
      afterTempWrite?: (tempPath: string) => void;
      beforeRename?: (tempPath: string) => void;
      afterRename?: (filePath: string) => void;
    };
  },
): { id: string; storeFile: string; line: number };

export function auditDir(
  storeDir: string,
  options?: { attempts?: number; betweenReads?: () => void },
): { audit: { findings: Violation[] }; checksums: Record<string, string>; snapshot: Snapshot };

export function checksumStores(storeDir: string): Record<string, string>;
