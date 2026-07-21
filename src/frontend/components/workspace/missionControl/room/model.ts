// Mission Room view-model — pure derivation. It takes ONLY the snapshot and
// never the global agents roster: that is the S2 hard rendering boundary, so
// no unbound agent can leak into the room's team/presence surface. Every
// output row carries the provenance (SourceRef[]) it will render.
import type {
  ArtifactView,
  AttentionItem,
  CurrentActivityView,
  MissionAssignmentView,
  MissionSnapshot,
  PresenceView,
  SourceRef,
  Sourced,
  TimelineEntry,
} from '../../../../../shared/missionView/schema.js';

/** One labeled fact row with its provenance, ready to render. */
export interface RoomFact {
  label: string;
  value: string;
  sourceRefs: SourceRef[];
  tone: 'steady' | 'attention';
}

/** Section data the Mission Room component renders, in display order. */
export interface MissionRoomViewModel {
  title: Sourced<string>;
  /** Raw mission record fields (status, owner, stage, priority) — owner stays raw, never a role (S4). */
  missionFacts: RoomFact[];
  /** The six-second answer, per the plan Delta v2 M6 derivation table. */
  pulse: RoomFact[];
  /** Linked objective context line, when an explicit objective ref resolved. */
  objective: Sourced<string> | null;
  /** Mission-explicit assignments only — empty means the gap lives in `attention` (S4). */
  assignments: MissionAssignmentView[];
  /** Mission-explicit bound presences only — empty means the gap lives in `attention` (S4). */
  presences: PresenceView[];
  /** Explicit current work — empty means the gap lives in `attention` (S3). */
  currentActivity: CurrentActivityView[];
  /** Chronological history (M4: chronological, never causal). */
  timeline: TimelineEntry[];
  /** Resolved, explicitly ref'd artifacts (S4). */
  artifacts: ArtifactView[];
  /** THE trust feature: every ambiguous fact, labeled, with sourceRefs. */
  attention: AttentionItem[];
  /** Freshness + recoverable read problems — always visible (M6). */
  trust: { asOf: string; issues: string[] };
}

function sourcedFact(label: string, sourced: Sourced<string | null>, empty: string): RoomFact {
  return { label, value: sourced.value ?? empty, sourceRefs: sourced.sourceRefs, tone: 'steady' };
}

function healthFact(snapshot: MissionSnapshot): RoomFact {
  const health = snapshot.pulse.health;
  return {
    label: 'Health',
    value: health.value,
    sourceRefs: health.sourceRefs,
    tone: health.value === 'attention' ? 'attention' : 'steady',
  };
}

function checkpointFact(snapshot: MissionSnapshot): RoomFact {
  const checkpoint = snapshot.pulse.nextCheckpoint;
  if (checkpoint.value !== null) {
    return { label: 'Next checkpoint', value: checkpoint.value, sourceRefs: checkpoint.sourceRefs, tone: 'steady' };
  }
  const status = snapshot.mission.status.value;
  const stage = snapshot.mission.stage.value;
  const stageText = stage ? `, stage \`${stage}\`` : '';
  return {
    label: 'Next checkpoint',
    value: `Mission closed (status \`${status}\`${stageText}) — no next checkpoint`,
    sourceRefs: [...snapshot.mission.status.sourceRefs, ...snapshot.mission.stage.sourceRefs],
    tone: 'steady',
  };
}

function needsChrisFact(snapshot: MissionSnapshot): RoomFact {
  const needs = snapshot.pulse.needsChris;
  return {
    label: 'Needs Chris',
    value: needs.value ? 'Yes — a pending request references this mission' : 'No pending requests',
    sourceRefs: needs.sourceRefs,
    tone: needs.value ? 'attention' : 'steady',
  };
}

function pulseFacts(snapshot: MissionSnapshot): RoomFact[] {
  return [
    sourcedFact('Outcome', snapshot.pulse.outcome, 'No outcome recorded'),
    sourcedFact('Phase', snapshot.pulse.phase, 'No phase recorded'),
    healthFact(snapshot),
    sourcedFact('Last update', snapshot.pulse.lastUpdate, 'Unknown'),
    checkpointFact(snapshot),
    needsChrisFact(snapshot),
  ];
}

function missionFacts(snapshot: MissionSnapshot): RoomFact[] {
  return [
    sourcedFact('Status', snapshot.mission.status, 'Unknown'),
    sourcedFact('Owner', snapshot.mission.owner, 'No owner recorded'),
    sourcedFact('Stage', snapshot.mission.stage, 'No stage recorded'),
    sourcedFact('Priority', snapshot.mission.priority, 'No priority recorded'),
  ];
}

/**
 * Builds the room's section data from the snapshot alone. Pass-throughs are
 * deliberate: the snapshot is the only legal data root for this surface, and
 * empty sections stay empty — the attention items explain the gaps.
 */
export function missionRoomViewModel(snapshot: MissionSnapshot): MissionRoomViewModel {
  return {
    title: snapshot.mission.title,
    missionFacts: missionFacts(snapshot),
    pulse: pulseFacts(snapshot),
    objective: snapshot.objective,
    assignments: snapshot.assignments,
    presences: snapshot.presences,
    currentActivity: snapshot.currentActivity,
    timeline: snapshot.timeline,
    artifacts: snapshot.artifacts,
    attention: snapshot.attention,
    trust: { asOf: snapshot.asOf, issues: snapshot.issues },
  };
}

function tagOf(sourceRef: SourceRef): string {
  const where = sourceRef.path ?? sourceRef.store;
  const line = sourceRef.line ? `:${sourceRef.line}` : '';
  const record = sourceRef.recordId ? ` ${sourceRef.recordId}` : '';
  return `${where}${line}${record}`.trim();
}

/** Short provenance tag for one fact, e.g. "missions.jsonl:11 · registry". */
export function sourceTag(sourceRefs: SourceRef[]): string {
  return sourceRefs.map(tagOf).join(' · ');
}
