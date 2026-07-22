// Mission-spawn resolution for POST /api/agents (plan v2 §1.4, ruling S4):
// mint the ONE durable agent id and persist the Agent block BEFORE the
// Presence exists. Kept beside AgentsHub so the route handler stays small.
import type { Request, Response } from 'express';
import { ObjectModel, ObjectModelError } from '../../objectModel/index.js';

/** Resolve the optional mission context of a spawn request.
 * Returns the minted durable agentId, undefined for a plain spawn, or null
 * after writing an error response (the caller stops). */
function missionContext(request: Request): { missionId?: string; teamId?: string } {
  return {
    missionId: typeof request.body?.missionId === 'string' ? request.body.missionId : undefined,
    teamId: typeof request.body?.teamId === 'string' ? request.body.teamId : undefined,
  };
}

export function resolveMissionSpawn(
  request: Request,
  response: Response,
  objectModel: ObjectModel | undefined,
  title: string,
  provider: string,
): string | undefined | null {
  const { missionId, teamId } = missionContext(request);
  if (missionId === undefined && teamId === undefined) return undefined;
  if (!missionId || !teamId || !objectModel) {
    response.status(400).json({ error: 'mission spawns need both missionId and teamId (and a configured object model)' });
    return null;
  }
  try {
    return objectModel.createAgent({ name: title, provider, teamId, missionId });
  } catch (error) {
    if (error instanceof ObjectModelError) {
      response.status(400).json({ error: error.message });
      return null;
    }
    throw error;
  }
}
