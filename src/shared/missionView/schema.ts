// Mission Room V1 — cross-boundary snapshot schema (mission_mission-room-v1).
// One read-only composition over existing data; every displayed fact carries
// provenance (SourceRef) and every ambiguous fact is an AttentionItem, never
// invented linkage (Chief Ruling #1). No runtime validation here — types only.

/** Where a displayed fact comes from. `store` names the source system. */
export interface SourceRef {
  /** Source system: a .novakai store name, 'journal', 'registry', or 'packet'. */
  store: string;
  /** Record id within the source, when the fact comes from a typed block. */
  recordId?: string;
  /** File path when the fact comes from a file (packet artifact, registry). */
  path?: string;
  /** 1-based line number within a JSONL store file, when known. */
  line?: number;
}

/** A value plus the provenance that backs it (M6: field-level provenance). */
export interface Sourced<T> {
  value: T;
  sourceRefs: SourceRef[];
}

/**
 * A labeled gap or ambiguity, rendered visibly. THE trust feature: anything
 * not explicitly linked appears here with the sourceRefs that prove the gap —
 * never inferred from titles, agent names, or text matching.
 */
export interface AttentionItem {
  id: string;
  label: string;
  detail: string;
  sourceRefs: SourceRef[];
}

/** A recoverable read/validation problem, with the provenance that produced it (R2). */
export interface ReadIssue {
  message: string;
  sourceRefs: SourceRef[];
}

/** The six-second answer, derived deterministically per the plan Delta v2 M6 table. */
export interface MissionPulse {
  outcome: Sourced<string | null>;
  phase: Sourced<string | null>;
  health: Sourced<'on-track' | 'attention' | 'unknown'>;
  lastUpdate: Sourced<string | null>;
  /** null for a closed mission — the UI renders the sourced "mission closed" line. */
  nextCheckpoint: Sourced<string | null>;
  needsChris: Sourced<boolean>;
}

/** A mission-explicit assignment only (S4). The scalar mission owner is NOT one. */
export interface MissionAssignmentView {
  personId: string;
  role: string;
  sourceRefs: SourceRef[];
}

/** A mission-explicit bound live Presence. Availability is not current work (S3). */
export interface PresenceView {
  agentId: string;
  title: string;
  provider: string;
  sessionId: string | null;
  sessionError: string | null;
  status: string;
  /** Registry file mtime — observation time, not production time (L2). */
  observedAt: string;
  sourceRefs: SourceRef[];
}

/** Explicit current work. For unlinked missions the honest value is empty + attention (S3). */
export interface CurrentActivityView {
  personId: string | null;
  summary: string;
  active: boolean;
  sourceRefs: SourceRef[];
}

/** One chronological timeline entry (M4: chronological, not causal). */
export interface TimelineEntry {
  id: string;
  kind: 'log' | 'task' | 'issue' | 'mission' | 'room';
  summary: string;
  timestamp: string;
  /** Full linkage path that collected this record, e.g. [mission, task, issue] (M4). */
  refPath: string[];
  sourceRefs: SourceRef[];
}

/** A resolved, explicitly ref'd Artifact (S4: Contract + PR only for V1). */
export interface ArtifactView {
  id: string;
  kind: string;
  label: string;
  location: string;
  /** null when production time is unknown (L2). */
  producedAt: string | null;
  /** Filesystem mtime when observed from disk — observation time, labeled (L2). */
  observedModifiedAt: string | null;
  sourceRefs: SourceRef[];
}

// --- The object-model tree (mission_mission-object-model, plan v2 §1.6) -----
// Mission → Team → Agent → Tasks → Artifacts rendered FROM DATA, with
// Project → Objective → KR as ancestry context. Empty arrays / nulls are the
// UI's explicit gap states — absence is shown, never invented.

export interface TaskNode {
  id: string;
  title: string;
  status: string;
  blockedReason: string | null;
  updated: string | null;
  sourceRefs: SourceRef[];
}

export interface AgentNode {
  id: string;
  name: string;
  provider: string;
  status: string;
  sessionId: string | null;
  tasks: TaskNode[];
  doneCount: number;
  totalCount: number;
  sourceRefs: SourceRef[];
}

/** One ancestry step in the header path: project → objective → KRs. */
export interface AncestryNode {
  id: string;
  kind: 'project' | 'objective' | 'kr';
  label: string;
  sourceRefs: SourceRef[];
}

export interface ArtifactNode {
  id: string;
  title: string;
  location: string;
  /** Set when the artifact anchors to a task inside this mission. */
  taskId: string | null;
  sourceRefs: SourceRef[];
}

export interface ThreadNode {
  id: string;
  roomId: string;
  sourceRefs: SourceRef[];
}

export interface MissionTreeView {
  ancestry: AncestryNode[];
  team: { id: string; name: string; sourceRefs: SourceRef[] } | null;
  agents: AgentNode[];
  /** Tasks refing the mission but no agent — rendered as an explicit gap group. */
  unassignedTasks: TaskNode[];
  artifacts: ArtifactNode[];
  threads: ThreadNode[];
}

/** The deep read result: one mission, joined read-only, uncertainty preserved. */
export interface MissionSnapshot {
  mission: {
    id: string;
    title: Sourced<string>;
    status: Sourced<string>;
    /** Raw owner field — rendered as-is, never promoted to an assignment (S4). */
    owner: Sourced<string | null>;
    stage: Sourced<string | null>;
    priority: Sourced<string | null>;
  };
  pulse: MissionPulse;
  /** Linked objective context line, when an explicit objective ref resolves. */
  objective: Sourced<string> | null;
  assignments: MissionAssignmentView[];
  presences: PresenceView[];
  currentActivity: CurrentActivityView[];
  timeline: TimelineEntry[];
  artifacts: ArtifactView[];
  /** The object-model tree — the progress-tree UI renders from this, not prose. */
  tree: MissionTreeView;
  attention: AttentionItem[];
  /** Snapshot generation time (ISO). */
  asOf: string;
  /** Recoverable read/validation problems, each with provenance. Always visible (R2). */
  issues: ReadIssue[];
}

/** 200 response shape for GET /api/missions/:missionId/snapshot. */
export interface MissionSnapshotResponse {
  snapshot: MissionSnapshot;
}

/** Error shapes: 404 truly absent id; 409 ambiguous (duplicate ids) with candidates (S5). */
export interface MissionSnapshotError {
  error: string;
  candidates?: Array<{ id: string; line: number; sourceRefs: SourceRef[] }>;
}
