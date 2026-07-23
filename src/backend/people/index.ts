// PeopleHub (mission_mission-control-ux, ruling S3) — the read-only people
// directory over the durable object model. MessagingHub shape: narrow injected
// collaborators, registerRoutes(app), error mapped at the edge. Identity law:
// durable agentId is the ONLY join/grouping key; runtime presence attaches by
// agentId (backend spawns reuse the one minted durable id — there is no second
// mint), a runtime entry the model has never heard of stays a runtime-only row,
// and a durable person with no runtime entry renders runtime: null — for a
// registered external session that absence is the honest state. Display names
// are never folded: duplicate names in the live store are distinct people.
import type { Express, Request, Response } from 'express';
import type { PeopleResponse, PersonView } from '../../shared/people/schema.js';
import type { AgentInfo } from '../terminal/manager.js';
import type { AgentBlock } from '../objectModel/index.js';

/** The one slice of the object model this hub reads. */
export interface PeopleSource {
  listAgents(): AgentBlock[];
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

export class PeopleHub {
  constructor(
    private readonly source: PeopleSource,
    /** Live backend-owned PTY list (already archived-filtered upstream). */
    private readonly runtimeAgents: () => AgentInfo[],
  ) {}

  registerRoutes(application: Express): void {
    application.get('/api/people', (request, response) => this.handlePeople(request, response));
  }

  /** The whole directory: durable people first (runtime attached by agentId),
   * then runtime-only rows the object model has never heard of. */
  listPeople(): PeopleResponse {
    const runtimeById = new Map(this.runtimeAgents().map((info) => [info.agentId, info]));
    const people: PersonView[] = [];
    for (const block of this.source.listAgents()) {
      people.push(durablePerson(block, runtimeById.get(block.id)));
      runtimeById.delete(block.id);
    }
    for (const info of runtimeById.values()) people.push(runtimeOnlyPerson(info));
    return { people, asOf: new Date().toISOString() };
  }

  private handlePeople(_request: Request, response: Response): void {
    try {
      response.json(this.listPeople());
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }
}
