// Shared people DTO (mission_mission-control-ux, ruling S3): the ONE response
// shape the frontend imports for the durable people directory. Durable agentId
// is the authoritative identity — display names are presentation/transport
// only and are NEVER a join or merge key (duplicate display names are real,
// distinct people in the live store). Runtime presence is separately sourced:
// `runtime: null` means no backend-owned PTY exists for this person — for a
// registered external session that absence IS the honest state, not a gap.

export interface PersonView {
  /** Durable Agent id — authoritative identity, the only grouping key. */
  agentId: string;
  /** Display/mailbox name. Transport-level DM addressing still uses this
   * (filed external-envelope-id gap); identity never does. */
  name: string;
  provider: string;
  /** Status from the durable Agent block; null for runtime-only rows the
   * object model has never heard of (pre-model PTY spawns). */
  durableStatus: 'spawning' | 'live' | 'failed' | 'retired' | null;
  /** From the Agent block's typed refs. */
  missionId: string | null;
  teamId: string | null;
  /** Separately-sourced runtime presence; null = no PTY entry (external
   * session or exited-and-archived). Never merged across different agentIds. */
  runtime: { status: 'running' | 'exited' } | null;
  /** Current Presence pointer (durable `sessionId`, else the runtime one). */
  sessionId: string | null;
  updated: string | null;
}

export interface PeopleResponse {
  people: PersonView[];
  asOf: string;
}
