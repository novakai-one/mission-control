import React from 'react';
import type { ProjectRecord, ThreadRecord } from '../../../../shared/project/schema.js';
import type { ThreadProjection } from '../../../../shared/provider/schema.js';
import type { AgentInfo } from '../../../lib/agentSocket/index.js';
import type { AttentionView } from '../../../lib/attention/index.js';
import type { SessionUsage } from '../../../lib/cost/index.js';
import {
  attentionApproval,
  liveMissionAgents,
  missionActivity,
  missionHealth,
  missionStages,
} from './model.js';
import './index.css';

export interface MissionConfidence {
  score: number;
  label: string;
  evidence: string;
}

export interface MissionControlProps {
  agents: AgentInfo[];
  project: ProjectRecord | null;
  thread: ThreadRecord | null;
  projection: ThreadProjection | null;
  attention: AttentionView;
  usage?: SessionUsage | null;
  confidence?: MissionConfidence | null;
  selectedAgentId?: string | null;
  onSelectAgent?(agentId: string): void;
  onSelectThread?(threadId: string): void;
  onReviewAttention?(): void;
}

function initials(title: string): string {
  return title
    .split(/[\s·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function AgentRow({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentInfo;
  selected: boolean;
  onSelect?(): void;
}) {
  return (
    <button
      type="button"
      className={selected ? 'mc-agent mc-agent-selected' : 'mc-agent'}
      onClick={onSelect}
      disabled={!onSelect}
    >
      <span className="mc-avatar">{initials(agent.title)}</span>
      <span className="mc-agent-copy">
        <strong>{agent.title}</strong>
        <small>{agent.provider} · {agent.status}</small>
      </span>
      <span className={agent.status === 'running' ? 'mc-status mc-status-live' : 'mc-status'} />
    </button>
  );
}

export function MissionControl(props: MissionControlProps) {
  const stages = missionStages(props.projection);
  const activity = missionActivity(props.projection);
  const squad = liveMissionAgents(props.agents, props.project?.id, props.thread?.id);
  const approval = attentionApproval(props.projection, props.attention);
  const health = missionHealth(props.projection, squad, props.usage ?? null);
  const running = squad.filter((agent) => agent.status === 'running').length;
  const title = props.thread?.title ?? props.project?.name ?? 'No mission selected';
  const missionFacts = [
    props.projection ? `${props.projection.events.length} recorded events` : null,
    squad.length > 0 ? `${running} of ${squad.length} agents live` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="mc-mission" aria-label="Mission control">
      <aside className="mc-mission-rail">
        {props.project && (
          <>
            <div className="mc-section-label">Mission work</div>
            <div className="mc-room-list">
              {props.project.threads.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  className={candidate.id === props.thread?.id ? 'mc-room mc-room-active' : 'mc-room'}
                  onClick={() => props.onSelectThread?.(candidate.id)}
                  disabled={!props.onSelectThread}
                >
                  <span>#</span>
                  <strong>{candidate.title}</strong>
                  <small>{candidate.sessionReferences.length} session{candidate.sessionReferences.length === 1 ? '' : 's'}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {squad.length > 0 && (
          <>
            <div className="mc-section-label mc-section-spaced">Live squad</div>
            <div className="mc-rail-agents">
              {squad.slice(0, 5).map((agent) => (
                <AgentRow
                  key={agent.agentId}
                  agent={agent}
                  selected={agent.agentId === props.selectedAgentId}
                  onSelect={props.onSelectAgent ? () => props.onSelectAgent?.(agent.agentId) : undefined}
                />
              ))}
            </div>
          </>
        )}
      </aside>

      <main className="mc-mission-main">
        <header className="mc-mission-hero">
          <div className="mc-mission-outcome">
            <span className="mc-kicker">{props.thread ? 'Active mission' : 'Mission control'}</span>
            <h1>{title}</h1>
            {missionFacts && <p>{missionFacts}</p>}
          </div>
          {props.confidence && (
            <div className="mc-confidence">
              <strong>{props.confidence.score}</strong>
              <span>{props.confidence.label}</span>
              <small>{props.confidence.evidence}</small>
            </div>
          )}
        </header>

        {stages.length > 0 && (
          <section className="mc-stage-strip" aria-label="Mission stages">
            {stages.slice(0, 5).map((stage, index) => (
              <article className={`mc-stage mc-stage-${stage.state}`} key={stage.id}>
                <span>{index + 1}</span>
                <strong>{stage.label}</strong>
                <small>{stage.detail}</small>
              </article>
            ))}
          </section>
        )}

        <div className="mc-mission-columns">
          <section className="mc-panel mc-activity">
            <header>
              <div>
                <span className="mc-kicker">Central activity</span>
                <h2>{props.thread?.title ?? props.project?.name ?? 'Mission activity'}</h2>
              </div>
              {running > 0 && <span className="mc-live"><i /> Live</span>}
            </header>
            <div className="mc-activity-list">
              {activity.length === 0 && <p className="mc-empty">No mission activity is available yet.</p>}
              {activity.map((item) => (
                <article className="mc-activity-row" key={item.id}>
                  <span className="mc-avatar">{initials(item.actor)}</span>
                  <div>
                    <header>
                      <strong>{item.actor}</strong>
                      <span>{item.kind}</span>
                      {item.time && <time>{item.time}</time>}
                    </header>
                    <p>{item.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="mc-evidence-column">
            {squad.length > 0 && (
              <section className="mc-panel mc-squad">
                <header>
                  <span className="mc-kicker">Live squad</span>
                  <strong>{running} live · {squad.length} attached</strong>
                </header>
                {squad.map((agent) => (
                  <AgentRow
                    key={agent.agentId}
                    agent={agent}
                    selected={agent.agentId === props.selectedAgentId}
                    onSelect={props.onSelectAgent ? () => props.onSelectAgent?.(agent.agentId) : undefined}
                  />
                ))}
              </section>
            )}

            {approval && (
              <section className="mc-panel mc-attention">
                <span className="mc-kicker">Needs you</span>
                <h3>{approval.text}</h3>
                {approval.approval?.reason && <p>{approval.approval.reason}</p>}
                {props.onReviewAttention && (
                  <button type="button" onClick={props.onReviewAttention}>Review decision</button>
                )}
              </section>
            )}
          </aside>
        </div>

        {health.length > 0 && (
          <section className="mc-health-bar" aria-label="Mission health">
            <div className="mc-health-heading">
              <span className="mc-kicker">Mission health</span>
              <strong>{health.length}</strong>
              <small>Live measures</small>
            </div>
            {health.map((measure) => (
              <div className={measure.tone === 'attention' ? 'mc-health-item mc-health-attention' : 'mc-health-item'} key={measure.id}>
                <span>{measure.label}</span>
                <strong>{measure.value}</strong>
                <small>{measure.detail}</small>
              </div>
            ))}
          </section>
        )}
      </main>
    </section>
  );
}

