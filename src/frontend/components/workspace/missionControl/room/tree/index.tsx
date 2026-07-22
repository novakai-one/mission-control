// The object-model progress tree (plan v2 §1.6, correction C3): Mission →
// Team → Agent → Tasks → Artifacts rendered purely from snapshot data.
// Split from room/index.tsx so each surface stays under the size law.
import React from 'react';
import { sourceTag, type MissionRoomViewModel } from '../model.js';
import './index.css';

/**
 * The object-model progress tree (plan v2 §1.6): Mission → Team → Agent →
 * Tasks → Artifacts, rendered purely from snapshot data. Ancestry renders as
 * a quiet header path, not a second tree. Exactly one blocked row (L15's
 * deterministic pick) may carry the amber accent; done rows settle sage.
 */
export function TreeSection({ model }: { model: MissionRoomViewModel }) {
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

function AgentTree({ agent, amberTaskId }: { agent: import('../../../../../../shared/missionView/schema.js').AgentNode; amberTaskId: string | null }) {
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

function TaskRow({ task, amberTaskId }: { task: import('../../../../../../shared/missionView/schema.js').TaskNode; amberTaskId: string | null }) {
  const mark = task.status === 'done' ? '✓' : task.status === 'doing' ? '▸' : '▢';
  const tone = task.status === 'done' ? 'mr-task mr-task-done'
    : task.status === 'blocked' && task.id === amberTaskId ? 'mr-task mr-task-amber'
    : 'mr-task';
  return (
    <>
      <div className={tone} title={sourceTag(task.sourceRefs)}>
        <span className="mr-task-mark">{mark}</span>
        <span className="mr-task-title">{task.title}</span>
        {task.status === 'doing' && <span className="mr-task-now">working now</span>}
        {task.status === 'blocked' && <span className="mr-task-blocked">blocked: {task.blockedReason}</span>}
      </div>
      {task.artifacts.map((artifact) => (
        <div className="mr-task-artifact" key={artifact.id} title={sourceTag(artifact.sourceRefs)}>
          <span className="mr-task-artifact-title">{artifact.title}</span>
          <code>{artifact.location}</code>
        </div>
      ))}
    </>
  );
}

