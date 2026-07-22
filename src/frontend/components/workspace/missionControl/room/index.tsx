// Mission Room V1 — the read-only snapshot surface. No composer, no buttons
// that mutate; every section renders snapshot facts with a light provenance
// tag, and every ambiguous fact appears in the Attention panel (Ruling #1).
import React from 'react';
import type {
  ArtifactView,
  AttentionItem,
  CurrentActivityView,
  MissionAssignmentView,
  MissionSnapshot,
  PresenceView,
  TimelineEntry,
} from '../../../../../shared/missionView/schema.js';
import {
  missionRoomViewModel,
  sourceTag,
  type MissionRoomViewModel,
  type RoomFact,
} from './model.js';
import './index.css';

interface MissionRoomProps {
  snapshot: MissionSnapshot | null;
  error: string | null;
}

function FactRow({ fact }: { fact: RoomFact }) {
  const provenance = sourceTag(fact.sourceRefs);
  return (
    <div className={fact.tone === 'attention' ? 'mr-fact mr-fact-attention' : 'mr-fact'}>
      <span>{fact.label}</span>
      <strong>{fact.value}</strong>
      {provenance && <small className="mr-source" title={provenance}>{provenance}</small>}
    </div>
  );
}

function PulseSection({ model }: { model: MissionRoomViewModel }) {
  return (
    <section className="mr-panel" aria-label="Pulse">
      <header><span className="mr-kicker">Pulse</span></header>
      <div className="mr-facts">
        {model.pulse.map((fact) => <FactRow key={fact.label} fact={fact} />)}
      </div>
    </section>
  );
}

function ContextSection({ model }: { model: MissionRoomViewModel }) {
  if (!model.objective) return null;
  const provenance = sourceTag(model.objective.sourceRefs);
  return (
    <section className="mr-panel" aria-label="Context">
      <header><span className="mr-kicker">Context</span></header>
      <p className="mr-objective">
        {model.objective.value}
        {provenance && <small className="mr-source" title={provenance}>{provenance}</small>}
      </p>
    </section>
  );
}

function AssignmentRow({ assignment }: { assignment: MissionAssignmentView }) {
  const provenance = sourceTag(assignment.sourceRefs);
  return (
    <div className="mr-row">
      <strong>{assignment.personId}</strong>
      <span>{assignment.role}</span>
      {provenance && <small className="mr-source" title={provenance}>{provenance}</small>}
    </div>
  );
}

function PresenceRow({ presence }: { presence: PresenceView }) {
  const provenance = sourceTag(presence.sourceRefs);
  const session = presence.sessionError
    ? `session error: ${presence.sessionError}`
    : presence.sessionId ? `session ${presence.sessionId}` : 'no active session';
  return (
    <div className="mr-row">
      <strong>{presence.title}</strong>
      <span>{presence.provider} · {presence.status} · {session} · observed {presence.observedAt}</span>
      {provenance && <small className="mr-source" title={provenance}>{provenance}</small>}
    </div>
  );
}

function ActivityRow({ activity }: { activity: CurrentActivityView }) {
  const provenance = sourceTag(activity.sourceRefs);
  return (
    <div className="mr-row">
      <strong>{activity.personId ?? 'Team'}</strong>
      <span>{activity.active ? '' : 'last: '}{activity.summary}</span>
      {provenance && <small className="mr-source" title={provenance}>{provenance}</small>}
    </div>
  );
}

function TeamSection({ model }: { model: MissionRoomViewModel }) {
  return (
    <section className="mr-panel" aria-label="Team">
      <header><span className="mr-kicker">Team</span></header>
      <div className="mr-subhead">Assignments</div>
      {model.assignments.length === 0
        ? <p className="mr-empty">No mission-explicit assignments recorded — the Attention panel explains the gap.</p>
        : model.assignments.map((assignment) => (
          <AssignmentRow key={`${assignment.personId}:${assignment.role}`} assignment={assignment} />
        ))}
      <div className="mr-subhead">Live presences</div>
      {model.presences.length === 0
        ? <p className="mr-empty">No mission-explicit bound presences — the Attention panel explains the gap.</p>
        : model.presences.map((presence) => <PresenceRow key={presence.agentId} presence={presence} />)}
      <div className="mr-subhead">Current activity</div>
      {model.currentActivity.length === 0
        ? <p className="mr-empty">No explicitly linked current activity — the Attention panel explains the gap.</p>
        : model.currentActivity.map((activity, index) => (
          <ActivityRow key={`${activity.personId ?? 'team'}:${index}`} activity={activity} />
        ))}
    </section>
  );
}

/**
 * The object-model progress tree (plan v2 §1.6): Mission → Team → Agent →
 * Tasks → Artifacts, rendered purely from snapshot data. Ancestry renders as
 * a quiet header path, not a second tree. Exactly one blocked row (L15's
 * deterministic pick) may carry the amber accent; done rows settle sage.
 */
function TreeSection({ model }: { model: MissionRoomViewModel }) {
  const tree = model.tree;
  return (
    <section className="mr-panel" aria-label="Progress tree">
      <header><span className="mr-kicker">Progress</span></header>
      {tree.ancestry.length > 0 && (
        <p className="mr-ancestry" title={sourceTag(tree.ancestry.flatMap((step) => step.sourceRefs))}>
          {tree.ancestry.map((step) => step.kind === 'kr' ? `KR: ${step.label}` : step.label).join(' › ')}
        </p>
      )}
      {tree.team
        ? <div className="mr-tree-team" title={sourceTag(tree.team.sourceRefs)}>{tree.team.name}</div>
        : <p className="mr-empty">No team recorded for this mission.</p>}
      {tree.agents.length === 0
        ? <p className="mr-empty">No agents recorded for this mission.</p>
        : tree.agents.map((agent) => <AgentTree key={agent.id} agent={agent} amberTaskId={model.amberTaskId} />)}
      {tree.unassignedTasks.length > 0 && (
        <div className="mr-tree-agent">
          <div className="mr-tree-agent-head"><strong>Unassigned</strong><span className="mr-tree-count">{tree.unassignedTasks.length} task{tree.unassignedTasks.length === 1 ? '' : 's'} without an agent</span></div>
          {tree.unassignedTasks.map((task) => <TaskRow key={task.id} task={task} amberTaskId={model.amberTaskId} />)}
        </div>
      )}
      {tree.artifacts.length > 0 && (
        <div className="mr-tree-artifacts">
          {tree.artifacts.map((artifact) => (
            <div className="mr-row" key={artifact.id} title={sourceTag(artifact.sourceRefs)}>
              <strong>{artifact.title}</strong>
              <span><code>{artifact.location}</code>{artifact.taskId ? ` · via ${artifact.taskId}` : ''}</span>
            </div>
          ))}
        </div>
      )}
      {tree.threads.length > 0 && (
        <p className="mr-tree-threads" title={sourceTag(tree.threads.flatMap((thread) => thread.sourceRefs))}>
          Linked room{tree.threads.length === 1 ? '' : 's'}: {tree.threads.map((thread) => thread.roomId).join(', ')}
        </p>
      )}
    </section>
  );
}

function AgentTree({ agent, amberTaskId }: { agent: import('../../../../../shared/missionView/schema.js').AgentNode; amberTaskId: string | null }) {
  return (
    <div className="mr-tree-agent" title={sourceTag(agent.sourceRefs)}>
      <div className="mr-tree-agent-head">
        <strong>{agent.name}</strong>
        <span className="mr-tree-count">
          {agent.provider} · {agent.status}{agent.totalCount > 0 ? ` · ${agent.doneCount}/${agent.totalCount} done` : ' · no tasks recorded'}
        </span>
      </div>
      {agent.tasks.map((task) => <TaskRow key={task.id} task={task} amberTaskId={amberTaskId} />)}
    </div>
  );
}

function TaskRow({ task, amberTaskId }: { task: import('../../../../../shared/missionView/schema.js').TaskNode; amberTaskId: string | null }) {
  const mark = task.status === 'done' ? '✓' : task.status === 'doing' ? '▸' : '▢';
  const tone = task.status === 'done' ? 'mr-task mr-task-done'
    : task.status === 'blocked' && task.id === amberTaskId ? 'mr-task mr-task-amber'
    : 'mr-task';
  return (
    <div className={tone} title={sourceTag(task.sourceRefs)}>
      <span className="mr-task-mark">{mark}</span>
      <span className="mr-task-title">{task.title}</span>
      {task.status === 'doing' && <span className="mr-task-now">working now</span>}
      {task.status === 'blocked' && <span className="mr-task-blocked">blocked: {task.blockedReason}</span>}
    </div>
  );
}

function TimelineSection({ model }: { model: MissionRoomViewModel }) {
  return (
    <section className="mr-panel" aria-label="Chronological history">
      <header><span className="mr-kicker">Chronological history</span></header>
      {model.timeline.length === 0
        ? <p className="mr-empty">No explicitly linked history — the Attention panel explains the gap.</p>
        : model.timeline.map((entry: TimelineEntry) => (
          <div className="mr-row" key={entry.id}>
            <strong>{entry.summary}</strong>
            <span>{entry.kind} · {entry.timestamp} · via {entry.refPath.join(' ← ')}</span>
            <small className="mr-source" title={sourceTag(entry.sourceRefs)}>{sourceTag(entry.sourceRefs)}</small>
          </div>
        ))}
    </section>
  );
}

function ArtifactRow({ artifact }: { artifact: ArtifactView }) {
  const provenance = sourceTag(artifact.sourceRefs);
  const when = artifact.producedAt
    ? `produced ${artifact.producedAt}`
    : artifact.observedModifiedAt ? `observed (mtime) ${artifact.observedModifiedAt}` : 'timestamp unknown';
  const location = /^https?:\/\//.test(artifact.location)
    ? <a href={artifact.location} target="_blank" rel="noreferrer">{artifact.location}</a>
    : <code>{artifact.location}</code>;
  return (
    <div className="mr-row">
      <strong>{artifact.label}</strong>
      <span>{artifact.kind} · {location} · {when}</span>
      {provenance && <small className="mr-source" title={provenance}>{provenance}</small>}
    </div>
  );
}

function EvidenceSection({ model }: { model: MissionRoomViewModel }) {
  return (
    <section className="mr-panel" aria-label="Evidence">
      <header><span className="mr-kicker">Evidence</span></header>
      {model.artifacts.length === 0
        ? <p className="mr-empty">No explicitly linked artifacts — the Attention panel explains the gap.</p>
        : model.artifacts.map((artifact) => <ArtifactRow key={artifact.id} artifact={artifact} />)}
    </section>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <div className="mr-row mr-attention-row">
      <strong>{item.label}</strong>
      <span>{item.detail}</span>
      <small className="mr-source" title={sourceTag(item.sourceRefs)}>{sourceTag(item.sourceRefs)}</small>
    </div>
  );
}

function AttentionSection({ model }: { model: MissionRoomViewModel }) {
  const { items, groups, count } = model.attention;
  return (
    <section className="mr-panel" aria-label="Attention">
      <header>
        <span className="mr-kicker">Attention</span>
        <strong className="mr-count">{count}</strong>
      </header>
      {count === 0
        ? <p className="mr-empty">Nothing needs attention — every displayed fact is explicitly sourced.</p>
        : (
          <>
            {items.map((item) => <AttentionRow key={item.id} item={item} />)}
            {groups.map((group) => (
              <details className="mr-group" key={group.id}>
                <summary className="mr-group-summary">
                  <strong>{group.label}</strong>
                  <span className="mr-group-hint">click to expand</span>
                </summary>
                {group.items.map((item) => <AttentionRow key={item.id} item={item} />)}
              </details>
            ))}
          </>
        )}
    </section>
  );
}

function TrustSection({ model }: { model: MissionRoomViewModel }) {
  return (
    <section className="mr-panel" aria-label="Trust">
      <header><span className="mr-kicker">Trust</span></header>
      <p className="mr-asof">Snapshot generated {model.trust.asOf} — refreshed by polling every 5s.</p>
      {model.trust.issues.length === 0
        ? <p className="mr-empty">No read issues during snapshot generation.</p>
        : model.trust.issues.map((issue, index) => (
          <p className="mr-issue" key={`${index}`}>
            {issue.message}
            {issue.sourceRefs.length > 0 && (
              <small className="mr-source" title={sourceTag(issue.sourceRefs)}>{sourceTag(issue.sourceRefs)}</small>
            )}
          </p>
        ))}
    </section>
  );
}

/**
 * Snapshot-mode hero: title and facts sourced from the snapshot (S2), never
 * from the live mission surface. Reuses the mc-mission-hero chrome.
 */
export function MissionRoomHero(props: { snapshot: MissionSnapshot | null }) {
  const snap = props.snapshot;
  const facts = snap
    ? [
      `status ${snap.mission.status.value}`,
      snap.mission.owner.value ? `owner ${snap.mission.owner.value}` : null,
      snap.mission.stage.value ? `stage ${snap.mission.stage.value}` : null,
      `as of ${snap.asOf}`,
    ].filter(Boolean).join(' · ')
    : '';
  const provenance = snap
    ? sourceTag([
      ...snap.mission.status.sourceRefs,
      ...snap.mission.owner.sourceRefs,
      ...snap.mission.stage.sourceRefs,
    ])
    : '';
  return (
    <header className="mc-mission-hero">
      <div className="mc-mission-outcome">
        <span className="mc-kicker">Mission room · read-only snapshot</span>
        <h1>{snap?.mission.title.value ?? 'Mission Room — Store Validator'}</h1>
        {facts && <p title={provenance}>{facts}</p>}
      </div>
    </header>
  );
}

/**
 * The read-only Mission Room. Renders the snapshot's sections; while polling
 * is broken the last good snapshot stays visible under an honest error banner
 * and recovery is automatic (M7).
 */
export function MissionRoom(props: MissionRoomProps) {
  if (!props.snapshot) {
    return (
      <div className="mr-room">
        {props.error
          ? <p className="mr-error">Snapshot unavailable: {props.error} — retrying every 5s.</p>
          : <p className="mr-empty">Loading mission snapshot…</p>}
      </div>
    );
  }
  const model = missionRoomViewModel(props.snapshot);
  return (
    <div className="mr-room">
      {props.error && (
        <p className="mr-error">Snapshot refresh failing: {props.error} — showing the last good snapshot, retrying every 5s.</p>
      )}
      <PulseSection model={model} />
      <ContextSection model={model} />
      <TreeSection model={model} />
      <TeamSection model={model} />
      <TimelineSection model={model} />
      <EvidenceSection model={model} />
      <AttentionSection model={model} />
      <TrustSection model={model} />
    </div>
  );
}
