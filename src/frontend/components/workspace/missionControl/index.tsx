import React, { useState } from 'react';
import type { ProjectRecord, ThreadRecord } from '../../../../shared/project/schema.js';
import type { ThreadProjection } from '../../../../shared/provider/schema.js';
import type { AgentInfo } from '../../../lib/agentSocket/index.js';
import type { AttentionView } from '../../../lib/attention/index.js';
import type { SessionUsage } from '../../../lib/cost/index.js';
import { PanelGlyph } from '../../ui/index.js';
import { AgentRow } from './agentRow.js';
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

const LEFT_OPEN_KEY = 'novakai.mission.leftRailOpen';
const RIGHT_OPEN_KEY = 'novakai.mission.rightRailOpen';
const LEFT_WIDTH_KEY = 'novakai.mission.leftRailWidth';
const RIGHT_WIDTH_KEY = 'novakai.mission.rightRailWidth';

function restoredBoolean(storageKey: string, fallback: boolean): boolean {
  const stored = localStorage.getItem(storageKey);
  return stored === null ? fallback : stored !== 'false';
}

function restoredWidth(storageKey: string, fallback: number, minimum: number, maximum: number): number {
  const stored = Number(localStorage.getItem(storageKey));
  return Number.isFinite(stored) && stored >= minimum && stored <= maximum ? stored : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function MissionControl(props: MissionControlProps) {
  const [leftOpen, setLeftOpen] = useState(() => restoredBoolean(LEFT_OPEN_KEY, true));
  const [rightOpen, setRightOpen] = useState(() => restoredBoolean(RIGHT_OPEN_KEY, true));
  const [leftWidth, setLeftWidth] = useState(() => restoredWidth(LEFT_WIDTH_KEY, 224, 180, 360));
  const [rightWidth, setRightWidth] = useState(() => restoredWidth(RIGHT_WIDTH_KEY, 304, 240, 440));
  const [draggingRail, setDraggingRail] = useState<'left' | 'right' | null>(null);
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

  function toggleLeft(): void {
    setLeftOpen((open) => {
      localStorage.setItem(LEFT_OPEN_KEY, String(!open));
      return !open;
    });
  }

  function toggleRight(): void {
    setRightOpen((open) => {
      localStorage.setItem(RIGHT_OPEN_KEY, String(!open));
      return !open;
    });
  }

  function resizeRail(side: 'left' | 'right', move: React.PointerEvent<HTMLDivElement>): void {
    if (draggingRail !== side) return;
    const bounds = move.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    if (side === 'left') setLeftWidth(clamp(move.clientX - bounds.left, 180, 360));
    else setRightWidth(clamp(bounds.right - move.clientX, 240, 440));
  }

  function finishResize(side: 'left' | 'right', release: React.PointerEvent<HTMLDivElement>): void {
    if (draggingRail !== side) return;
    const bounds = release.currentTarget.parentElement?.getBoundingClientRect();
    const width = bounds
      ? side === 'left'
        ? clamp(release.clientX - bounds.left, 180, 360)
        : clamp(bounds.right - release.clientX, 240, 440)
      : side === 'left' ? leftWidth : rightWidth;
    if (side === 'left') setLeftWidth(width);
    else setRightWidth(width);
    if (release.currentTarget.hasPointerCapture(release.pointerId)) {
      release.currentTarget.releasePointerCapture(release.pointerId);
    }
    localStorage.setItem(side === 'left' ? LEFT_WIDTH_KEY : RIGHT_WIDTH_KEY, String(width));
    setDraggingRail(null);
  }

  return (
    <section
      className={`mc-mission${leftOpen ? '' : ' mc-left-closed'}${rightOpen ? '' : ' mc-right-closed'}`}
      aria-label="Mission control"
      // eslint-disable-next-line no-restricted-syntax -- pointer-driven rail widths are runtime CSS variables.
      style={{
        '--mc-left-width': `${leftWidth}px`,
        '--mc-right-width': `${rightWidth}px`,
      } as React.CSSProperties}
    >
      <aside className="mc-mission-rail">
        {leftOpen ? (
          <>
            <div className="mc-rail-brand">
              <div className="mc-brand">
                <span className="studio-glyph">&gt;_</span>
                <b>novakai<span>&nbsp;command</span></b>
              </div>
              <button type="button" className="mc-rail-toggle" onClick={toggleLeft} aria-label="Collapse mission rail" title="Collapse mission rail">
                <PanelGlyph open />
              </button>
            </div>

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
          </>
        ) : (
          <button type="button" className="mc-rail-reopen" onClick={toggleLeft} aria-label="Open mission rail" title="Open mission rail">
            <PanelGlyph open={false} />
          </button>
        )}
      </aside>

      {leftOpen && (
        <div
          className="mc-resize-handle mc-resize-left"
          data-dragging={draggingRail === 'left' ? '' : undefined}
          role="separator"
          aria-label="Resize mission rail"
          aria-orientation="vertical"
          onPointerDown={(press) => {
            press.preventDefault();
            press.currentTarget.setPointerCapture(press.pointerId);
            setDraggingRail('left');
          }}
          onPointerMove={(move) => resizeRail('left', move)}
          onPointerUp={(release) => finishResize('left', release)}
          onPointerCancel={(release) => finishResize('left', release)}
        />
      )}

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
                <span className="mc-avatar">{item.actor.slice(0, 2).toUpperCase()}</span>
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

      {rightOpen && (
        <div
          className="mc-resize-handle mc-resize-right"
          data-dragging={draggingRail === 'right' ? '' : undefined}
          role="separator"
          aria-label="Resize live squad rail"
          aria-orientation="vertical"
          onPointerDown={(press) => {
            press.preventDefault();
            press.currentTarget.setPointerCapture(press.pointerId);
            setDraggingRail('right');
          }}
          onPointerMove={(move) => resizeRail('right', move)}
          onPointerUp={(release) => finishResize('right', release)}
          onPointerCancel={(release) => finishResize('right', release)}
        />
      )}

      <aside className="mc-evidence-column">
        {rightOpen ? (
          <>
            <header className="mc-evidence-head">
              <span className="mc-kicker">Live squad</span>
              <button type="button" className="mc-rail-toggle" onClick={toggleRight} aria-label="Collapse live squad rail" title="Collapse live squad rail">
                <PanelGlyph open />
              </button>
            </header>
            {squad.length > 0 && (
              <section className="mc-squad">
                <header>
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
              <section className="mc-attention">
                <span className="mc-kicker">Needs you</span>
                <h3>{approval.text}</h3>
                {approval.approval?.reason && <p>{approval.approval.reason}</p>}
                {props.onReviewAttention && (
                  <button type="button" onClick={props.onReviewAttention}>Review decision</button>
                )}
              </section>
            )}
          </>
        ) : (
          <button type="button" className="mc-rail-reopen" onClick={toggleRight} aria-label="Open live squad rail" title="Open live squad rail">
            <PanelGlyph open={false} />
          </button>
        )}
      </aside>
    </section>
  );
}
