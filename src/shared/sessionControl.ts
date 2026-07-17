export type SessionControlIntent =
  | { kind: 'interrupt' }
  | { kind: 'model'; model: string };

export type SessionControlResult =
  | { status: 'accepted'; agentId: string; intent: SessionControlIntent }
  | { status: 'rejected'; agentId: string; intent: SessionControlIntent; reason: string };

export type SessionControlReceipt = SessionControlResult & {
  type: 'agent-control-result';
  commandId: string;
};
