// PeopleHub (mission_mission-control-ux, ruling S3) — the read-only people
// directory over the durable object model. MessagingHub shape: narrow injected
// collaborators, registerRoutes(app), error mapped at the edge. Identity law:
// durable agentId is the ONLY join/grouping key; runtime presence attaches by
// agentId (backend spawns reuse the one minted durable id — there is no second
// mint), a runtime entry the model has never heard of stays a runtime-only row,
// and a durable person with no runtime entry renders runtime: null — for a
// registered external session that absence is the honest state. Display names
// are never folded: duplicate names in the live store are distinct people.
import { existsSync, readFileSync } from 'node:fs';
import type { Express, Request, Response } from 'express';
import type { ArchiveResponse, ArchivedLane, PeopleResponse, PersonView } from '../../shared/people/schema.js';
import type { AgentInfo } from '../terminal/manager.js';
import type { AgentBlock } from '../objectModel/index.js';

/** The slices of the object model this hub reads. The archive resolvers are
 * optional so the people directory works standalone (tests, minimal wiring). */
export interface PeopleSource {
  listAgents(): AgentBlock[];
  missionForRoom?(roomId: string): string | null;
  missionRecord?(missionId: string): Record<string, unknown> | null;
}

const DURABLE_STATUSES = new Set(['spawning', 'live', 'failed', 'retired']);

function refValue(block: AgentBlock, kind: string): string | null {
  const ref = block.refs?.find((entry) => entry.kind === kind);
  return typeof ref?.value === 'string' ? ref.value : null;
}

function durablePerson(block: AgentBlock, runtime: AgentInfo | undefined): PersonView {
  return {
    agentId: block.id,
    name: block.name,
    provider: block.provider,
    durableStatus: DURABLE_STATUSES.has(block.status) ? block.status : null,
    missionId: refValue(block, 'mission'),
    teamId: refValue(block, 'team'),
    runtime: runtime ? { status: runtime.status } : null,
    sessionId: block.sessionId ?? runtime?.sessionId ?? null,
    updated: typeof block.updated === 'string' ? block.updated : null,
  };
}

function runtimeOnlyPerson(info: AgentInfo): PersonView {
  return {
    agentId: info.agentId,
    name: info.title,
    provider: info.provider,
    durableStatus: null, // unknown to the object model — never invented
    missionId: null,
    teamId: null,
    runtime: { status: info.status },
    sessionId: info.sessionId || null,
    updated: null,
  };
}

const CLOSED_MISSION_STATUSES = new Set(['done', 'closed', 'refiled']);

/** Tolerant room fold INCLUDING archived records (ruling S1): the frozen
 * RoomStore.list()/get() contract stays untouched — this is a separate
 * read-only path over the same JSONL, folded by roomId, last line wins. */
function foldRoomsWithArchived(roomsPath: string): Map<string, Record<string, unknown>> {
  const folded = new Map<string, Record<string, unknown>>();
  if (!existsSync(roomsPath)) return folded;
  for (const line of readFileSync(roomsPath, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed: unknown = JSON.parse(line);
      const roomId = (parsed as { roomId?: unknown } | null)?.roomId;
      if (typeof roomId === 'string') folded.set(roomId, parsed as Record<string, unknown>);
    } catch {
      // torn/corrupt line never blocks the rest (MessageStore tolerance)
    }
  }
  return folded;
}

export class PeopleHub {
  constructor(
    private readonly source: PeopleSource,
    /** Live backend-owned PTY list (already archived-filtered upstream). */
    private readonly runtimeAgents: () => AgentInfo[],
    /** Rooms JSONL path for the on-demand archive read; omit to serve people only. */
    private readonly roomsPath?: string,
  ) {}

  registerRoutes(application: Express): void {
    application.get('/api/people', (request, response) => this.handlePeople(request, response));
    application.get('/api/people/archive', (request, response) => this.handleArchive(request, response));
  }

  /** The explicit on-demand archive read (ruling S1): archived rooms, rooms
   * whose thread-linked mission is closed, and retired durable people. */
  listArchive(): ArchiveResponse {
    const archived: ArchivedLane[] = [];
    for (const [roomId, block] of this.roomsPath ? foldRoomsWithArchived(this.roomsPath) : new Map<string, Record<string, unknown>>()) {
      const title = typeof block.name === 'string' ? block.name : roomId;
      if (block.archived === true) {
        archived.push({ id: roomId, kind: 'room', title, conversationId: roomId, reason: 'room-archived', missionId: null, sourceRefs: [{ store: 'rooms', recordId: roomId }] });
        continue;
      }
      const missionId = this.source.missionForRoom?.(roomId) ?? null;
      if (!missionId) continue;
      const mission = this.source.missionRecord?.(missionId);
      if (mission && CLOSED_MISSION_STATUSES.has(String(mission.status ?? ''))) {
        archived.push({
          id: roomId, kind: 'room', title, conversationId: roomId, reason: 'mission-closed', missionId,
          sourceRefs: [{ store: 'rooms', recordId: roomId }, { store: 'missions', recordId: missionId }],
        });
      }
    }
    for (const block of this.source.listAgents()) {
      if (block.status !== 'retired' && block.status !== 'failed') continue;
      archived.push({
        id: block.id, kind: 'person', title: block.name, conversationId: `dm:${block.name}`,
        reason: 'person-retired', missionId: null, sourceRefs: [{ store: 'agents', recordId: block.id }],
      });
    }
    return { archived, asOf: new Date().toISOString() };
  }

  /** The whole directory: durable people first (runtime attached by agentId),
   * then runtime-only rows the object model has never heard of. Carries the
   * archived room-lane ids so the default view can exclude them without
   * pulling the full archive detail (S1). */
  listPeople(): PeopleResponse {
    const runtimeById = new Map(this.runtimeAgents().map((info) => [info.agentId, info]));
    const people: PersonView[] = [];
    for (const block of this.source.listAgents()) {
      people.push(durablePerson(block, runtimeById.get(block.id)));
      runtimeById.delete(block.id);
    }
    for (const info of runtimeById.values()) people.push(runtimeOnlyPerson(info));
    return { people, archivedLaneIds: this.archivedRoomIds(), asOf: new Date().toISOString() };
  }

  private archivedRoomIds(): string[] {
    if (!this.roomsPath) return [];
    const ids: string[] = [];
    for (const [roomId, block] of foldRoomsWithArchived(this.roomsPath)) {
      if (block.archived === true) {
        ids.push(roomId);
        continue;
      }
      const missionId = this.source.missionForRoom?.(roomId);
      if (!missionId) continue;
      const mission = this.source.missionRecord?.(missionId);
      if (mission && CLOSED_MISSION_STATUSES.has(String(mission.status ?? ''))) ids.push(roomId);
    }
    return ids;
  }

  private handlePeople(_request: Request, response: Response): void {
    try {
      response.json(this.listPeople());
    } catch (error) {
      this.sendFailure(response, error);
    }
  }

  private handleArchive(_request: Request, response: Response): void {
    try {
      response.json(this.listArchive());
    } catch (error) {
      this.sendFailure(response, error);
    }
  }

  private sendFailure(response: Response, error: unknown): void {
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
