// Mission Room V1 — hub (mission_mission-room-v1). One read-only GET over the
// deep readMissionSnapshot composition, following the MessagingHub shape:
// constructor-injected collaborators, registerRoutes(app), error mapping.
// Roots are mandatory, explicit, and absolute (plan Delta v2 S1 — no
// process.cwd() defaults inside the module). Read-only end to end: no
// append/updateStatus/POST anywhere in this module.
import path from 'node:path';
import type { Express, Request, Response } from 'express';
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
    const result = resolveLinkage(missionId, stores.records);
    if (result.status === 'absent') throw new MissionNotFoundError(`mission not found: ${missionId}`);
    if (result.status === 'ambiguous') {
      throw new MissionAmbiguousError(`ambiguous mission id: ${missionId} (duplicate store records)`, result.candidates);
    }
    return deriveSnapshot(this.collectFacts(missionId, result.linkage, stores.problems));
  }

  /** Impure reads gathered at the edge; the derive itself is pure. */
  private collectFacts(missionId: string, linkage: MissionLinkage, storeProblems: string[]): MissionFacts {
    const journal = readJournal(this.roots.journalPath);
    const registry = readRegistry(this.roots.registryPath);
    const rooms = readRooms(this.roots.roomsPath);
    const packet = readPacket(this.roots.workDir, missionId);
    return {
      missionId,
      linkage,
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
