// Server-derived envelope identity (plan v2 §1.5, rulings S2 + M11): durable
// agent ids and the mission link are stamped on the SERVER from the object
// model — never trusted from a client. Messaging owns this seam interface;
// the object model satisfies it structurally (dependency inversion, same
// pattern as PtyWriter).
import { isChannel, isRoom } from '../types.js';
import type { AgentAddress, MessageEnvelope } from '../types.js';

/** The slice of the durable mission graph messaging needs. */
type DurableAgent = { id: string; refs: Array<{ kind: string; value: string }> };

export interface MissionGraph {
  agentRecord(agentId: string): DurableAgent | null;
  missionForRoom(roomId: string): string | null;
  createThread(input: { roomId: string; missionId: string }): string;
}

export class EnvelopeIdentity {
  constructor(private readonly graph: MissionGraph) {}

  /**
   * Stamp durable ids + missionId onto an envelope before its first append,
   * so the audit record carries them from birth. Display names stay for
   * presentation; durable joins use the ids (M11 — renames never sever
   * history). Rules:
   * - sender/recipient get their durable agentId when their Presence is in
   *   the mission model;
   * - a room send carries the mission its thread block links to;
   * - a DM carries a mission ONLY when both parties are durable agents of
   *   the same mission — ambiguity is never guessed.
   */
  stamp(envelope: MessageEnvelope, roster: AgentAddress[]): void {
    const sender = this.durableFor(envelope.from, roster);
    if (sender) envelope.senderAgentId = sender.id;
    if (isRoom(envelope.to)) {
      const missionId = this.graph.missionForRoom(envelope.to);
      if (missionId) envelope.missionId = missionId;
      return;
    }
    if (!isChannel(envelope.to)) this.stampDirect(envelope, sender, roster);
  }

  private stampDirect(envelope: MessageEnvelope, sender: DurableAgent | null, roster: AgentAddress[]): void {
    const recipient = this.durableFor(envelope.to, roster);
    if (recipient) envelope.recipientAgentId = recipient.id;
    if (sender && recipient) {
      const senderMission = missionOf(sender);
      if (senderMission && senderMission === missionOf(recipient)) {
        envelope.missionId = senderMission;
      }
    }
  }

  private durableFor(name: string, roster: AgentAddress[]): DurableAgent | null {
    const address = roster.find((agent) => agent.name === name);
    return address ? this.graph.agentRecord(address.agentId) : null;
  }
}

function missionOf(record: DurableAgent): string | null {
  return record.refs.find((entry) => entry.kind === 'mission')?.value ?? null;
}
