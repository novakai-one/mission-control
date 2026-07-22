// Mission Room V1 — pure linkage resolution + bounded validation (plan Delta v2 S4/S5, M4).
// Explicit refs only (Chief Ruling #1): the mission's forward refs, reverse typed
// refs (task/log/issue blocks whose refs[] name the mission id), and ONE bounded
// hop beyond (mission ← task ← issue). Text matching is never linkage. Every
// record the join touches is validated (id/kind/ts, kind↔store, per-kind shape,
// ref-kind allowlist, dangling store-id refs); every violation is a visible
// problem string — duplicates are never silently picked.
import type { ReadIssue, SourceRef } from '../../../shared/missionView/schema.js';
import type { RawRecord, StoreName } from '../sources/index.js';

/** A typed ref as stored in a block's refs[] (AGENTS.md ref kinds). */
export interface RefValue {
  kind: string;
  value: string;
  label?: string;
}

/** One record collected by linkage, with the full path that reached it (M4). */
export interface LinkedRecord {
  record: RawRecord;
  refPath: string[];
}

/** One duplicate-id candidate for an ambiguous target id (S5 → HTTP 409). */
export interface AmbiguousCandidate {
  id: string;
  line: number;
  sourceRefs: SourceRef[];
}

/** The resolved linkage graph for one mission, with validation verdicts. */
export interface MissionLinkage {
  mission: RawRecord;
  /** False when the target record itself failed bounded validation (health 'unknown'). */
  missionValid: boolean;
  forwardRefs: RefValue[];
  objective: RawRecord | null;
  linked: LinkedRecord[];
  needsChris: boolean;
  needsChrisSource: RawRecord | null;
  /** exp/session refs: no store exists — attention items, never dangling (S5). */
  unresolvableRefs: RefValue[];
  problems: ReadIssue[];
}

/** Linkage outcome: absent → 404, ambiguous → 409 with candidates, else resolved. */
export type LinkageResult =
  | { status: 'absent' }
  | { status: 'ambiguous'; candidates: AmbiguousCandidate[] }
  | { status: 'resolved'; linkage: MissionLinkage };

const REF_KINDS = new Set([
  'task', 'mission', 'project', 'doc', 'decision', 'log',
  'exp', 'objective', 'request', 'issue', 'session', 'learning',
  'team', 'agent', 'artifact', 'thread',
]);
const UNRESOLVABLE_KINDS = new Set(['exp', 'session']);
const KINDS_BY_STORE: Record<StoreName, string[]> = {
  'missions': ['mission'],
  'tasks': ['task'],
  'okrs': ['objective', 'kr'],
  'requests': ['request'],
  'issues': ['issue'],
  'captains-log': ['log'],
  'projects': ['project'],
  'teams': ['team'],
  'agents': ['agent'],
  'artifacts': ['artifact'],
  'threads': ['thread'],
};
/** Ref kinds backed by a store we read — dangling checks apply to these only. */
const STORE_BY_REF_KIND = new Map<string, StoreName>([
  ['task', 'tasks'],
  ['mission', 'missions'],
  ['log', 'captains-log'],
  ['issue', 'issues'],
  ['objective', 'okrs'],
  ['request', 'requests'],
  ['project', 'projects'],
  ['team', 'teams'],
  ['agent', 'agents'],
  ['artifact', 'artifacts'],
  ['thread', 'threads'],
]);

/**
 * Resolve the full explicit linkage graph for one mission id. Duplicate target
 * ids are ambiguous (never a silent pick); a truly absent id is absent.
 */
export function resolveLinkage(missionId: string, stores: Record<StoreName, RawRecord[]>): LinkageResult {
  const matches = stores.missions.filter((record) => record.block.id === missionId);
  if (matches.length === 0) return { status: 'absent' };
  if (matches.length > 1) return { status: 'ambiguous', candidates: matches.map(toCandidate) };
  return assemble(missionId, matches[0], stores);
}

/** Walk + validate the whole graph for a resolved (single) target record. */
function assemble(missionId: string, mission: RawRecord, stores: Record<StoreName, RawRecord[]>): LinkageResult {
  const problems: ReadIssue[] = [];
  const missionValid = validateRecord(mission, problems);
  const forwardRefs = readRefs(mission, problems);
  const linked = dedupeLinked(collectLinked(missionId, stores, problems));
  const objective = resolveObjective(mission, forwardRefs, stores, problems);
  const needsChrisSource = stores.requests.find((record) => isPendingFor(record, missionId)) ?? null;
  checkDangling(mission, forwardRefs, stores, problems);
  for (const item of linked) checkDangling(item.record, readRefs(item.record, problems), stores, problems);
  const unresolvableRefs = forwardRefs.filter((entry) => UNRESOLVABLE_KINDS.has(entry.kind));
  const linkage: MissionLinkage = {
    mission, missionValid, forwardRefs, objective, linked,
    needsChris: needsChrisSource !== null, needsChrisSource, unresolvableRefs, problems: dedupeIssues(problems),
  };
  return { status: 'resolved', linkage };
}

/**
 * Bounded validation of one joined record (S5): required id/kind/ts, kind must
 * match its store file, and the per-kind shape rule — a mission needs a
 * non-empty string title beyond id/kind/ts.
 */
function validateRecord(record: RawRecord, problems: ReadIssue[]): boolean {
  const before = problems.length;
  const block = record.block;
  const where = `${record.store}:${record.line} record '${describe(record)}'`;
  for (const field of ['id', 'kind', 'ts']) {
    if (typeof block[field] !== 'string' || (block[field] as string).trim() === '') {
      problems.push(issueOf(record, `${where} missing required field '${field}'`));
    }
  }
  if (typeof block.kind === 'string' && !KINDS_BY_STORE[record.store].includes(block.kind)) {
    problems.push(issueOf(record, `${where} has kind '${block.kind}' not allowed in ${record.store}.jsonl`));
  }
  if (record.store === 'missions' && (typeof block.title !== 'string' || block.title.trim() === '')) {
    problems.push(issueOf(record, `${where} has no non-empty string title (mission per-kind shape rule)`));
  }
  return problems.length === before;
}

/** A block's refs[], shape-checked; a malformed refs field is a visible issue. */
function readRefs(record: RawRecord, problems: ReadIssue[]): RefValue[] {
  const rawRefs = record.block.refs;
  if (rawRefs === undefined) return [];
  if (!Array.isArray(rawRefs)) {
    problems.push(issueOf(record, `${record.store}:${record.line} record '${describe(record)}' has a non-array refs field`));
    return [];
  }
  const refs: RefValue[] = [];
  for (const entry of rawRefs as unknown[]) {
    if (!isRefValue(entry)) {
      problems.push(issueOf(record, `${record.store}:${record.line} record '${describe(record)}' has a malformed ref`));
      continue;
    }
    if (!REF_KINDS.has(entry.kind)) {
      problems.push(issueOf(record, `${record.store}:${record.line} ref kind '${entry.kind}' outside the typed-ref allowlist`));
    }
    refs.push(entry);
  }
  return refs;
}

/** Reverse refs + one bounded hop (M4): mission ← task/log/issue, then mission ← task ← issue. */
function collectLinked(missionId: string, stores: Record<StoreName, RawRecord[]>, problems: ReadIssue[]): LinkedRecord[] {
  const linked: LinkedRecord[] = [];
  const tasks: LinkedRecord[] = [];
  for (const storeName of ['tasks', 'captains-log', 'issues'] as StoreName[]) {
    for (const record of stores[storeName]) {
      if (!readRefs(record, problems).some((entry) => entry.kind === 'mission' && entry.value === missionId)) continue;
      validateRecord(record, problems);
      flagDuplicate(record, stores[storeName], problems);
      const item = { record, refPath: [missionId, describe(record)] };
      linked.push(item);
      if (storeName === 'tasks') tasks.push(item);
    }
  }
  return linked.concat(collectIssueHop(tasks, stores, problems));
}

/** The one allowed transitive hop: issues ref'ing an already-linked task (M4). */
function collectIssueHop(tasks: LinkedRecord[], stores: Record<StoreName, RawRecord[]>, problems: ReadIssue[]): LinkedRecord[] {
  const taskIds = new Set(tasks.map((item) => String(item.record.block.id)));
  const hops: LinkedRecord[] = [];
  for (const record of stores.issues) {
    const viaRef = readRefs(record, problems).find((entry) => entry.kind === 'task' && taskIds.has(entry.value));
    if (!viaRef) continue;
    validateRecord(record, problems);
    flagDuplicate(record, stores.issues, problems);
    const parent = tasks.find((item) => String(item.record.block.id) === viaRef.value);
    hops.push({ record, refPath: [...(parent?.refPath ?? [viaRef.value]), describe(record)] });
  }
  return hops;
}

/** Resolve an explicit objective ref into the okrs store; absent/dup is visible. */
function resolveObjective(carrier: RawRecord, refs: RefValue[], stores: Record<StoreName, RawRecord[]>, problems: ReadIssue[]): RawRecord | null {
  const target = refs.find((entry) => entry.kind === 'objective');
  if (!target) return null;
  const matches = stores.okrs.filter((record) => record.block.id === target.value);
  if (matches.length === 0) {
    problems.push(issueOf(carrier, `dangling ref: objective '${target.value}' absent from okrs.jsonl`));
    return null;
  }
  if (matches.length > 1) problems.push(issueOf(matches[0], `duplicate id '${target.value}' in okrs.jsonl — objective resolution ambiguous`));
  validateRecord(matches[0], problems);
  return matches[0];
}

/** Dangling check for ref kinds backed by a store we read (S5); doc/exp/session excluded. */
function checkDangling(record: RawRecord, refs: RefValue[], stores: Record<StoreName, RawRecord[]>, problems: ReadIssue[]): void {
  for (const entry of refs) {
    const storeName = STORE_BY_REF_KIND.get(entry.kind);
    if (!storeName) continue;
    if (!stores[storeName].some((target) => target.block.id === entry.value)) {
      problems.push(issueOf(record, `dangling ref: ${record.store}:${record.line} refs ${entry.kind} '${entry.value}' — absent from ${storeName}.jsonl`));
    }
  }
}

/** A pending request whose refs name the mission id (explicit reverse ref, M6). */
function isPendingFor(record: RawRecord, missionId: string): boolean {
  if (record.block.status !== 'pending') return false;
  const rawRefs = record.block.refs;
  if (!Array.isArray(rawRefs)) return false;
  return rawRefs.some((entry) => isRefValue(entry) && entry.kind === 'mission' && entry.value === missionId);
}

/** Duplicate ids in a store are a visible issue — joined records are never silently picked. */
function flagDuplicate(record: RawRecord, records: RawRecord[], problems: ReadIssue[]): void {
  const recordId = record.block.id;
  if (typeof recordId !== 'string') return;
  if (records.filter((other) => other.block.id === recordId).length > 1) {
    problems.push(issueOf(record, `duplicate id '${recordId}' in ${record.store}.jsonl — joined records are never silently picked`));
  }
}

function dedupeLinked(linked: LinkedRecord[]): LinkedRecord[] {
  const seen = new Set<string>();
  return linked.filter((item) => {
    const seenKey = `${item.record.store}:${item.record.line}`;
    if (seen.has(seenKey)) return false;
    seen.add(seenKey);
    return true;
  });
}

/** One validation issue citing the record that produced it (R2). */
function issueOf(record: RawRecord, message: string): ReadIssue {
  return { message, sourceRefs: [{ store: record.store, recordId: String(record.block.id ?? ''), path: record.path, line: record.line }] };
}

/** Duplicate messages merge into one issue; sourceRefs from EVERY occurrence survive (T1). */
function dedupeIssues(problems: ReadIssue[]): ReadIssue[] {
  const byMessage = new Map<string, ReadIssue>();
  for (const problem of problems) {
    const existing = byMessage.get(problem.message);
    if (!existing) {
      byMessage.set(problem.message, { message: problem.message, sourceRefs: [...problem.sourceRefs] });
      continue;
    }
    const seen = new Set(existing.sourceRefs.map(refKeyOf));
    for (const sourceRef of problem.sourceRefs) {
      if (seen.has(refKeyOf(sourceRef))) continue;
      seen.add(refKeyOf(sourceRef));
      existing.sourceRefs.push(sourceRef);
    }
  }
  return [...byMessage.values()];
}

function refKeyOf(sourceRef: SourceRef): string {
  return `${sourceRef.store}|${sourceRef.recordId ?? ''}|${sourceRef.path ?? ''}|${sourceRef.line ?? ''}`;
}

function toCandidate(record: RawRecord): AmbiguousCandidate {
  const recordId = String(record.block.id);
  return {
    id: recordId,
    line: record.line,
    sourceRefs: [{ store: record.store, recordId, path: record.path, line: record.line }],
  };
}

function isRefValue(value: unknown): value is RefValue {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as RefValue;
  return typeof entry.kind === 'string' && typeof entry.value === 'string';
}

function describe(record: RawRecord): string {
  return typeof record.block.id === 'string' ? record.block.id : '(no id)';
}
