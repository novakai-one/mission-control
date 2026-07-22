// Mission Room V1 — hub (mission_mission-room-v1). One read-only GET over the
// deep readMissionSnapshot composition, following the MessagingHub shape:
// constructor-injected collaborators, registerRoutes(app), error mapping.
// Roots are mandatory, explicit, and absolute (plan Delta v2 S1 — no
// process.cwd() defaults inside the module). Read-only end to end: no
// append/updateStatus/POST anywhere in this module.
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import type { ReadIssue } from '../../shared/missionView/schema.js';
import type {
  MissionSnapshot,
  MissionSnapshotError,
  MissionSnapshotResponse,
} from '../../shared/missionView/schema.js';
import { resolveLinkage } from './linkage/index.js';
import type { AmbiguousCandidate, MissionLinkage } from './linkage/index.js';
import { deriveSnapshot } from './snapshot/index.js';
import type { MissionFacts } from './snapshot/index.js';
import { isSafeMissionId, readJournal, readPacket, readRegistry, readRooms, readStores } from './sources/index.js';
import type { MissionViewRoots } from './sources/index.js';

export type { MissionViewRoots } from './sources/index.js';

const CLOSED_MISSION_STATUSES = new Set(['done', 'closed', 'refiled']);

/** C4 rule: latest team-linked mission, else latest open mission, else null. */
function resolveActiveMissionId(records: Record<string, Array<{ block: Record<string, unknown> }>>): string | null {
  const missions = records['missions'] ?? [];
  const teamLinked = new Set<string>();
  for (const team of records['teams'] ?? []) {
    const refs = team.block.refs;
    if (!Array.isArray(refs)) continue;
    for (const ref of refs as Array<{ kind?: unknown; value?: unknown }>) {
      if (ref?.kind === 'mission' && typeof ref.value === 'string') teamLinked.add(ref.value);
    }
  }
  const freshness = (block: Record<string, unknown>): string =>
    (typeof block.updated === 'string' ? block.updated : typeof block.ts === 'string' ? block.ts : '');
  const newestFirst = [...missions].sort((left, right) => freshness(right.block).localeCompare(freshness(left.block)));
  const withTeam = newestFirst.find((mission) => typeof mission.block.id === 'string' && teamLinked.has(mission.block.id));
  if (withTeam) return withTeam.block.id as string;
  const open = newestFirst.find((mission) => !CLOSED_MISSION_STATUSES.has(String(mission.block.status ?? '')));
  return typeof open?.block.id === 'string' ? open.block.id : null;
}

/** 400 — the id contains a path separator or '..' (S1 containment). */
export class InvalidMissionIdError extends Error {}

/** 404 — the mission id is truly absent from the stores. */
export class MissionNotFoundError extends Error {}

/** 409 — duplicate mission ids make the target ambiguous; candidates included (S5). */
export class MissionAmbiguousError extends Error {
  constructor(message: string, readonly candidates: AmbiguousCandidate[]) {
    super(message);
  }
}

/**
 * Owns the Mission Room read surface. Constructed beside the other hubs in
 * server/index.ts with roots resolved explicitly there (env override, then
 * repo-relative resolve at the wiring layer — never inside this module).
 */
export class MissionViewHub {
  private readonly roots: MissionViewRoots;

  constructor(roots: MissionViewRoots) {
    this.roots = assertRoots(roots);
  }

  registerRoutes(application: Express): void {
    application.get('/api/missions/:missionId/snapshot', (request, response) => this.handleSnapshot(request, response));
  }

  /** The single composition entry point: mission id in → snapshot out (deep module). */
  readMissionSnapshot(missionId: string): MissionSnapshot {
    if (!isSafeMissionId(missionId)) throw new InvalidMissionIdError(`invalid mission id: ${missionId}`);
    const stores = readStores(this.roots.storesDir);
    // Correction C4: 'active' unpins the room. The rule, exactly: the most
    // recently `updated` mission that a team block refs; if no team exists,
    // the most recently updated/ts'd mission whose status is not closed.
    // A full mission picker is a recorded follow-up, not this resolution.
    if (missionId === 'active') {
      const resolved = resolveActiveMissionId(stores.records);
      if (!resolved) throw new MissionNotFoundError('no active mission: no team-linked or open mission found');
      missionId = resolved;
    }
    const result = resolveLinkage(missionId, stores.records);
    if (result.status === 'absent') throw new MissionNotFoundError(`mission not found: ${missionId}`);
    if (result.status === 'ambiguous') {
      throw new MissionAmbiguousError(`ambiguous mission id: ${missionId} (duplicate store records)`, result.candidates);
    }
    return deriveSnapshot(this.collectFacts(missionId, result.linkage, stores.records, stores.problems));
  }

  /** Impure reads gathered at the edge; the derive itself is pure. */
  private collectFacts(
    missionId: string, linkage: MissionLinkage,
    storeRecords: MissionFacts['stores'], storeProblems: ReadIssue[],
  ): MissionFacts {
    const journal = readJournal(this.roots.journalPath);
    const registry = readRegistry(this.roots.registryPath);
    const rooms = readRooms(this.roots.roomsPath);
    const packet = readPacket(this.roots.workDir, missionId);
    return {
      missionId,
      linkage,
      stores: storeRecords,
      journal: journal.envelopes,
      journalPath: this.roots.journalPath,
      registry: registry.entries,
      registryPath: this.roots.registryPath,
      registryObservedAt: registry.observedAt,
      rooms: rooms.rooms,
      roomsPath: this.roots.roomsPath,
      packet: packet.files,
      readProblems: [...storeProblems, ...journal.problems, ...registry.problems, ...rooms.problems, ...packet.problems],
      asOf: new Date().toISOString(),
    };
  }

  private handleSnapshot(request: Request, response: Response): void {
    try {
      const snapshot = this.readMissionSnapshot(request.params.missionId);
      const payload: MissionSnapshotResponse = { snapshot };
      response.json(payload);
    } catch (error) {
      this.sendFailure(response, error);
    }
  }

  private sendFailure(response: Response, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof InvalidMissionIdError) {
      response.status(400).json({ error: message });
      return;
    }
    if (error instanceof MissionNotFoundError) {
      response.status(404).json({ error: message });
      return;
    }
    if (error instanceof MissionAmbiguousError) {
      const payload: MissionSnapshotError = { error: message, candidates: error.candidates };
      response.status(409).json(payload);
      return;
    }
    response.status(500).json({ error: message });
  }
}

/** Roots are mandatory and absolute — construction is refused otherwise (S1). */
function assertRoots(roots: MissionViewRoots): MissionViewRoots {
  if (!roots) throw new Error('MissionViewHub requires explicit roots (S1)');
  const required: Array<keyof MissionViewRoots> = ['storesDir', 'workDir', 'journalPath', 'registryPath', 'roomsPath'];
  for (const rootKey of required) {
    const value = roots[rootKey];
    if (typeof value !== 'string' || !path.isAbsolute(value)) {
      throw new Error(`MissionViewHub roots.${rootKey} must be an absolute path (S1)`);
    }
  }
  return roots;
}
