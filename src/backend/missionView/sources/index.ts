// Mission Room V1 — impure read adapters (mission_mission-room-v1, plan Delta v2 S1/S5).
// Thin read-only edge over the four data roots: .novakai/stores JSONL, the message
// journal, the agent registry, and mission packet directories. Every root is injected
// as an absolute path by the hub (S1 — no process.cwd() defaults inside the module);
// nothing here opens a write handle. Read problems surface as `problems` strings and
// render as visible issues — never thrown away, never fatal (MessageStore tolerance).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { MessageStore } from '../../messaging/store/index.js';
import type { MessageEnvelope } from '../../messaging/types.js';
import type { AgentInfo } from '../../terminal/manager.js';

/** Absolute read roots injected at hub construction (S1). */
export interface MissionViewRoots {
  storesDir: string;
  workDir: string;
  journalPath: string;
  registryPath: string;
}

/** The six .novakai stores the snapshot joins over. */
export type StoreName = 'missions' | 'tasks' | 'okrs' | 'requests' | 'issues' | 'captains-log';

/** One parsed-but-unvalidated store block with its provenance (store, file, line). */
export interface RawRecord {
  store: StoreName;
  path: string;
  line: number;
  block: Record<string, unknown>;
}

/** Result of one coherent read of the stores (S5 checksum bracket). */
export interface StoresRead {
  records: Record<StoreName, RawRecord[]>;
  problems: string[];
}

/** A registry entry — AgentInfo plus the registry-only archived flag. */
export type RegistryEntry = AgentInfo & { archived?: boolean };

/** Result of reading the live agent registry. */
export interface RegistryRead {
  entries: RegistryEntry[];
  /** Registry file mtime — observation time, not production time (L2). */
  observedAt: string | null;
  problems: string[];
}

/** One file observed inside a mission packet directory (L2: mtime = observation). */
export interface PacketFile {
  name: string;
  path: string;
  observedModifiedAt: string;
}

const STORE_FILES: ReadonlyArray<{ name: StoreName; file: string }> = [
  { name: 'missions', file: 'missions.jsonl' },
  { name: 'tasks', file: 'tasks.jsonl' },
  { name: 'okrs', file: 'okrs.jsonl' },
  { name: 'requests', file: 'requests.jsonl' },
  { name: 'issues', file: 'issues.jsonl' },
  { name: 'captains-log', file: 'captains-log.jsonl' },
];

/**
 * Test seam fired between the pre-read hash and the read of each attempt —
 * lets a test rewrite a store file mid-read to exercise the S5 bracket retry.
 */
export type ReadAttemptHook = (attempt: number, storesDir: string) => void;

/**
 * One coherent read of all six stores (S5): sha256 every file before reading,
 * re-hash after; on any mismatch retry the whole read ONCE; a second mismatch
 * adds a visible problem entry and still serves the final read honestly.
 */
export function readStores(storesDir: string, onAttempt?: ReadAttemptHook): StoresRead {
  let attempt = readStoresAttempt(storesDir, 0, onAttempt);
  if (attempt.stable) return attempt;
  attempt = readStoresAttempt(storesDir, 1, onAttempt);
  if (!attempt.stable) {
    attempt.problems.push('store file changed during read twice; snapshot reflects the final read');
  }
  return attempt;
}

interface StoresAttempt extends StoresRead {
  stable: boolean;
}

function readStoresAttempt(storesDir: string, attempt: number, onAttempt?: ReadAttemptHook): StoresAttempt {
  const before = hashStores(storesDir);
  onAttempt?.(attempt, storesDir);
  const records = {} as Record<StoreName, RawRecord[]>;
  const problems: string[] = [];
  for (const { name, file } of STORE_FILES) {
    const result = readStoreFile(storesDir, name, file);
    records[name] = result.records;
    problems.push(...result.problems);
  }
  const after = hashStores(storesDir);
  const stable = STORE_FILES.every(({ file }) => before.get(file) === after.get(file));
  return { records, problems, stable };
}

function hashStores(storesDir: string): Map<string, string | null> {
  const hashes = new Map<string, string | null>();
  for (const { file } of STORE_FILES) hashes.set(file, hashFile(path.join(storesDir, file)));
  return hashes;
}

function hashFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readStoreFile(storesDir: string, name: StoreName, file: string): { records: RawRecord[]; problems: string[] } {
  const filePath = path.join(storesDir, file);
  if (!existsSync(filePath)) return { records: [], problems: [`store file missing: ${file}`] };
  const records: RawRecord[] = [];
  const problems: string[] = [];
  readFileSync(filePath, 'utf8').split('\n').forEach((entry, index) => {
    if (entry.trim() === '') return;
    const parsed = parseStoreLine(entry);
    if (parsed === null) {
      problems.push(`corrupt line skipped: ${file}:${index + 1}`);
      return;
    }
    records.push({ store: name, path: filePath, line: index + 1, block: parsed });
  });
  return { records, problems };
}

function parseStoreLine(entry: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(entry);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    // a torn/corrupt line never blocks the rest of the store (MessageStore tolerance)
    return null;
  }
}

/** Read-only journal fold — history() only; never append/updateStatus (R3). */
export function readJournal(journalPath: string): { envelopes: MessageEnvelope[]; problems: string[] } {
  if (!existsSync(journalPath)) return { envelopes: [], problems: [`journal missing: ${journalPath}`] };
  return { envelopes: new MessageStore(journalPath).history(), problems: [] };
}

/** Live registry read: archived entries filtered, observedAt = file mtime (L2). */
export function readRegistry(registryPath: string): RegistryRead {
  if (!existsSync(registryPath)) {
    return { entries: [], observedAt: null, problems: [`registry missing: ${registryPath}`] };
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(registryPath, 'utf8'));
    const entries = Array.isArray(parsed) ? (parsed as RegistryEntry[]).filter((entry) => !entry.archived) : [];
    return { entries, observedAt: statSync(registryPath).mtime.toISOString(), problems: [] };
  } catch {
    return { entries: [], observedAt: null, problems: [`registry unreadable: ${registryPath}`] };
  }
}

/**
 * Packet listing for one mission: file names + mtimes as observation times (L2).
 * The mission id is containment-checked before any fs touch (S1); a missing
 * packet dir is not a read problem — the snapshot decides what absence means.
 */
export function readPacket(workDir: string, missionId: string): { files: PacketFile[]; problems: string[] } {
  const empty = { files: [], problems: [] };
  if (!isSafeMissionId(missionId)) return empty;
  const packetDir = path.join(workDir, missionId);
  if (!packetDir.startsWith(workDir + path.sep)) return empty;
  if (!existsSync(packetDir) || !statSync(packetDir).isDirectory()) return empty;
  const files = readdirSync(packetDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => packetFile(packetDir, entry.name));
  return { files, problems: [] };
}

/** Mission ids must stay a single path segment under the injected root (S1). */
export function isSafeMissionId(missionId: string): boolean {
  return missionId.trim() !== ''
    && !missionId.includes('/')
    && !missionId.includes('\\')
    && !missionId.includes('..');
}

function packetFile(packetDir: string, name: string): PacketFile {
  const filePath = path.join(packetDir, name);
  return { name, path: filePath, observedModifiedAt: statSync(filePath).mtime.toISOString() };
}
