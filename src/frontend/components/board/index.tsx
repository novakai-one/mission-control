import React, { useMemo, useState } from 'react';
import { Network, Brain, Wrench, GitBranch, FileText, AlertTriangle, Radio } from 'lucide-react';
import { TranscriptEvent } from '../index.js';
import type { TimelineVariant, ToolPairs, Turn } from './timelineModel.js';
import { buildToolPairs, compressNoiseRuns, getToolLabel, groupIntoTurns, noiseSummary, visibilityPredicate } from './timelineModel.js';
import './index.css';

interface TimelineProps {
  events: TranscriptEvent[];
  onSelectEvent: (uuid: string | null) => void;
  selectedEventUuid: string | null;
}

interface AgentBoardProps extends TimelineProps {
  variant: TimelineVariant;
  hiddenEvents: Set<string>;
}

export const EVENT_ICONS: Record<string, React.ReactNode> = {
  user_text: <FileText size={11} color="var(--text-secondary)" />,
  assistant_text: <FileText size={11} color="#7a9ec9" />,
  assistant_thinking: <Brain size={11} color="#9a7ac9" />,
  tool_use: <Wrench size={11} color="#c9b57a" />,
  tool_result: <Wrench size={11} color="#7ac98f" />,
  hook_event: <AlertTriangle size={11} color="#c97a7a" />,
  system: <Radio size={11} color="var(--text-muted)" />,
  session_meta: <Radio size={11} color="var(--text-muted)" />,
};

export const EVENT_COLORS: Record<string, string> = {
  user_text: 'var(--text-secondary)',
  assistant_text: '#7a9ec9',
  assistant_thinking: '#9a7ac9',
  tool_use: '#c9b57a',
  tool_result: '#7ac98f',
  hook_event: '#c97a7a',
  system: 'var(--text-muted)',
  session_meta: 'var(--text-muted)',
};

export function getEventLabel(ev: TranscriptEvent): string {
  switch (ev.kind) {
    case 'user_text': return ev.text?.substring(0, 80) || '';
    case 'assistant_text': return ev.text?.substring(0, 80) || '';
    case 'assistant_thinking': return ev.text?.substring(0, 80) || '';
    case 'tool_use':
      if (ev.isAgentSpawn) return `Spawn: ${ev.agentDescription || ev.agentType || 'subagent'}`;
      return `${ev.tool}(${Object.keys(ev.input || {}).slice(0, 3).join(', ')})`;
    case 'tool_result':
      return ev.isError ? 'ERROR' : (ev.content?.substring(0, 80) || '');
    case 'hook_event': return `${ev.hookName || ev.hookEvent}`;
    case 'system': return ev.text?.substring(0, 80) || '';
    case 'session_meta': return ev.mode || ev.permissionMode || ev.summary || '';
    default: return '';
  }
}

function formatTime(stamp: string): string {
  return new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface EventRowProps {
  event: TranscriptEvent;
  label: string;
  selected: boolean;
  onSelect: () => void;
  resultChip?: TranscriptEvent;
  onSelectChip?: () => void;
  chipSelected?: boolean;
}

function EventRow({ event, label, selected, onSelect, resultChip, onSelectChip, chipSelected }: EventRowProps) {
  const chipTone = resultChip?.isError ? 'tl-chip tl-chip-err' : 'tl-chip tl-chip-ok';
  return (
    <div className={selected ? 'tl-row tl-row-selected' : 'tl-row'} onClick={onSelect}>
      <span className="tl-time">{formatTime(event.ts)}</span>
      <span className="tl-icon">{EVENT_ICONS[event.kind] || <FileText size={11} color="var(--text-muted)" />}</span>
      <span className={`tl-label tl-kind-${event.kind}`}>{label}</span>
      {resultChip && (
        <span
          className={chipSelected ? `${chipTone} tl-chip-selected` : chipTone}
          onClick={(domEvent) => { domEvent.stopPropagation(); onSelectChip?.(); }}
        >
          {resultChip.isError ? '✗' : '✓'} {(resultChip.content || '').replace(/\s+/g, ' ').slice(0, 30)}
        </span>
      )}
      {event.isSidechain && <span className="tl-sc">SC</span>}
    </div>
  );
}

interface MergedRowProps {
  event: TranscriptEvent;
  pairs: ToolPairs;
  onSelectEvent: (uuid: string | null) => void;
  selectedEventUuid: string | null;
}

/** A-style row: tool_use rows get the value label plus the paired result as a clickable chip. */
function MergedRow({ event, pairs, onSelectEvent, selectedEventUuid }: MergedRowProps) {
  const isTool = event.kind === 'tool_use';
  const chip = isTool && event.toolUseId ? pairs.results.get(event.toolUseId) : undefined;
  return (
    <EventRow
      event={event}
      label={isTool ? getToolLabel(event) : getEventLabel(event)}
      resultChip={chip}
      selected={selectedEventUuid === event.uuid}
      onSelect={() => onSelectEvent(event.uuid)}
      onSelectChip={chip ? () => onSelectEvent(chip.uuid) : undefined}
      chipSelected={chip ? selectedEventUuid === chip.uuid : false}
    />
  );
}

// Drop tool_result events whose tool_use is visible in the same slice; the
// result renders as a chip on the tool row instead. Unpaired results stay.
function withoutPairedResults(events: TranscriptEvent[], pairs: ToolPairs): TranscriptEvent[] {
  return events.filter((event) => !(event.kind === 'tool_result' && pairs.toolUseIds.has(event.toolUseId || '')));
}

interface MergedListProps {
  events: TranscriptEvent[];
  pairs: ToolPairs;
  compressNoise: boolean;
  onSelectEvent: (uuid: string | null) => void;
  selectedEventUuid: string | null;
}

/** Merged rows; optionally compresses consecutive noise into dim non-clickable strips. */
function MergedList({ events, pairs, compressNoise, onSelectEvent, selectedEventUuid }: MergedListProps) {
  const items = useMemo(() => (compressNoise ? compressNoiseRuns(events) : events), [events, compressNoise]);
  return (
    <>
      {items.map((item, index) => ('noiseRun' in item ? (
        <div key={`noise-${index}`} className="tl-noise-strip">····&ensp;{noiseSummary(item.noiseRun)}</div>
      ) : (
        <MergedRow
          key={item.eventKey || item.uuid || index}
          event={item}
          pairs={pairs}
          onSelectEvent={onSelectEvent}
          selectedEventUuid={selectedEventUuid}
        />
      )))}
    </>
  );
}

function CurrentTimeline({ events, onSelectEvent, selectedEventUuid }: TimelineProps) {
  return (
    <>
      {events.map((event, index) => (
        <EventRow
          key={event.eventKey || event.uuid || index}
          event={event}
          label={getEventLabel(event)}
          selected={selectedEventUuid === event.uuid}
          onSelect={() => onSelectEvent(event.uuid)}
        />
      ))}
    </>
  );
}

interface TurnHeaderProps {
  turn: Turn;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (uuid: string | null) => void;
  selectedUuid: string | null;
}

function TurnHeader({ turn, collapsed, onToggle, onSelect, selectedUuid }: TurnHeaderProps) {
  const header = turn.header;
  return (
    <div className="tl-turn-header">
      <span className="tl-caret" onClick={onToggle}>{collapsed ? '▸' : '▾'}</span>
      {header ? (
        <>
          <span className="tl-time">{formatTime(header.ts)}</span>
          <span className={header.kind === 'user_text' ? 'tl-turn-tag tl-turn-tag-you' : 'tl-turn-tag tl-turn-tag-claude'}>
            {header.kind === 'user_text' ? 'YOU' : 'CLAUDE'}
          </span>
          <span
            className={selectedUuid === header.uuid ? 'tl-turn-text tl-turn-text-selected' : 'tl-turn-text'}
            onClick={() => onSelect(header.uuid)}
          >
            {(header.text || '').substring(0, 80)}
          </span>
        </>
      ) : (
        <span className="tl-turn-start">session start</span>
      )}
      {collapsed && <span className="tl-turn-count">({turn.children.length})</span>}
    </div>
  );
}

interface TurnBlockProps extends TurnHeaderProps {
  pairs: ToolPairs;
}

function TurnBlock({ turn, pairs, collapsed, onToggle, onSelect, selectedUuid }: TurnBlockProps) {
  return (
    <div className="tl-turn">
      <TurnHeader turn={turn} collapsed={collapsed} onToggle={onToggle} onSelect={onSelect} selectedUuid={selectedUuid} />
      {!collapsed && (
        <div className="tl-turn-children">
          <MergedList events={turn.children} pairs={pairs} compressNoise onSelectEvent={onSelect} selectedEventUuid={selectedUuid} />
        </div>
      )}
    </div>
  );
}

function GroupedTimeline({ events, pairs, onSelectEvent, selectedEventUuid }: TimelineProps & { pairs: ToolPairs }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const turns = useMemo(() => groupIntoTurns(events), [events]);

  function toggleTurn(turnId: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) next.delete(turnId);
      else next.add(turnId);
      return next;
    });
  }

  return (
    <>
      {turns.map((turn, index) => {
        const turnId = turn.header?.eventKey || turn.header?.uuid || `pre-${index}`;
        return (
          <TurnBlock
            key={turnId}
            turn={turn}
            pairs={pairs}
            collapsed={collapsed.has(turnId)}
            onToggle={() => toggleTurn(turnId)}
            onSelect={onSelectEvent}
            selectedUuid={selectedEventUuid}
          />
        );
      })}
    </>
  );
}

// Pure layout: visibility is the view panel's job; variants never hide events themselves.
function TimelineBody({ variant, events, pairs, onSelectEvent, selectedEventUuid }: TimelineProps & { variant: TimelineVariant; pairs: ToolPairs }) {
  const merged = useMemo(() => withoutPairedResults(events, pairs), [events, pairs]);
  if (variant === 'grouped') {
    return <GroupedTimeline events={merged} pairs={pairs} onSelectEvent={onSelectEvent} selectedEventUuid={selectedEventUuid} />;
  }
  if (variant === 'signal' || variant === 'ledger') {
    return (
      <MergedList
        events={merged}
        pairs={pairs}
        compressNoise={variant === 'ledger'}
        onSelectEvent={onSelectEvent}
        selectedEventUuid={selectedEventUuid}
      />
    );
  }
  return <CurrentTimeline events={events} onSelectEvent={onSelectEvent} selectedEventUuid={selectedEventUuid} />;
}

export function AgentBoard({ events, onSelectEvent, selectedEventUuid, variant, hiddenEvents }: AgentBoardProps) {
  const subagentSpawns = events.filter(e => e.kind === 'tool_use' && e.isAgentSpawn);
  const sidechainEvents = events.filter(e => e.isSidechain);
  // Visibility filters apply to the timeline only; stats and the spawn tree stay unfiltered.
  // Pairing indexes toolUseIds from ALL tool_use events (hidden or not) so hiding a tool
  // category drops its results too, while hidden results are excluded so their chips go away.
  const { visibleEvents, pairs } = useMemo(() => {
    const predicate = visibilityPredicate(hiddenEvents);
    return {
      visibleEvents: events.filter(predicate),
      pairs: buildToolPairs(events.filter((event) => event.kind !== 'tool_result' || predicate(event))),
    };
  }, [events, hiddenEvents]);

  return (
    <div style={{
      display: 'flex', flex: 1, minWidth: '320px', backgroundColor: 'var(--bg-primary)',
      borderRight: '1px solid var(--border-color)', overflowY: 'auto', padding: '1.5rem',
      flexDirection: 'column', gap: '1rem'
    }}>
      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="glass-panel" style={{ padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Events</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{events.length}</span>
        </div>
        <div className="glass-panel" style={{ padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Subagents</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#c9b57a' }}>{subagentSpawns.length}</span>
        </div>
        <div className="glass-panel" style={{ padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sidechain</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{sidechainEvents.length}</span>
        </div>
      </div>

      {/* Subagent spawn tree */}
      {subagentSpawns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <GitBranch size={12} color="var(--text-secondary)" />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Subagent Spawns</span>
          </div>
          {subagentSpawns.map((spawn) => (
            <div
              key={spawn.toolUseId || spawn.uuid}
              onClick={() => onSelectEvent(spawn.uuid)}
              className="glass-panel"
              style={{
                padding: '0.5rem 0.8rem', cursor: 'pointer',
                backgroundColor: selectedEventUuid === spawn.uuid ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                borderColor: selectedEventUuid === spawn.uuid ? 'var(--border-active)' : 'var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <GitBranch size={10} color="#c9b57a" />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 500 }}>{spawn.agentDescription || 'subagent'}</span>
              </div>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{spawn.agentType || ''} · {new Date(spawn.ts).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Event timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
          <Network size={12} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Event Timeline</span>
        </div>
        {events.length === 0 ? (
          <div style={{
            display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text-muted)', gap: '0.8rem'
          }}>
            <Network size={28} strokeWidth={1.5} />
            <span style={{ fontSize: '0.75rem' }}>Select a session to view transcript</span>
          </div>
        ) : visibleEvents.length === 0 ? (
          <div className="tl-empty">All events hidden by view filters</div>
        ) : (
          <TimelineBody variant={variant} events={visibleEvents} pairs={pairs} onSelectEvent={onSelectEvent} selectedEventUuid={selectedEventUuid} />
        )}
      </div>
    </div>
  );
}
