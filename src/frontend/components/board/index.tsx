import React, { useMemo, useState } from 'react';
import { Network, Brain, FileText, Wrench, AlertTriangle, Radio } from 'lucide-react';
import { TranscriptEvent } from '../index.js';
import type { TimelineVariant, ToolPairs, Turn } from './timelineModel.js';
import { compressNoiseRuns, getChipLabel, getToolLabel, groupIntoTurns, groupSpawnRuns, noiseSummary } from './timelineModel.js';
import './index.css';

interface TimelineProps {
  events: TranscriptEvent[];
  onSelectEvent: (uuid: string | null) => void;
  selectedEventUuid: string | null;
}

interface AgentBoardProps extends TimelineProps {
  visibleEvents: TranscriptEvent[];
  pairs: ToolPairs;
  variant: TimelineVariant;
}

export const EVENT_ICONS: Record<string, React.ReactNode> = {
  user_text: <FileText size={11} color="var(--text-secondary)" />,
  assistant_text: <FileText size={11} color="var(--kind-assistant)" />,
  assistant_thinking: <Brain size={11} color="var(--kind-thinking)" />,
  tool_use: <Wrench size={11} color="var(--kind-tool)" />,
  tool_result: <Wrench size={11} color="var(--kind-result)" />,
  hook_event: <AlertTriangle size={11} color="var(--kind-error)" />,
  system: <Radio size={11} color="var(--text-muted)" />,
  session_meta: <Radio size={11} color="var(--text-muted)" />,
};

export const EVENT_COLORS: Record<string, string> = {
  user_text: 'var(--text-secondary)',
  assistant_text: 'var(--kind-assistant)',
  assistant_thinking: 'var(--kind-thinking)',
  tool_use: 'var(--kind-tool)',
  tool_result: 'var(--kind-result)',
  hook_event: 'var(--kind-error)',
  system: 'var(--text-muted)',
  session_meta: 'var(--text-muted)',
};

/** Content preview — used for row tooltips and turn headers; chips themselves show the kind. */
export function getEventLabel(ev: TranscriptEvent): string {
  switch (ev.kind) {
    case 'user_text': return ev.text?.substring(0, 80) || '';
    case 'assistant_text': return ev.text?.substring(0, 80) || '';
    case 'assistant_thinking': return ev.text?.substring(0, 80) || '';
    case 'tool_use': return getToolLabel(ev);
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
  selected: boolean;
  onSelect: () => void;
  countSuffix?: number;
  resultChip?: TranscriptEvent;
  onSelectChip?: () => void;
  chipSelected?: boolean;
}

/** Compact chip row: kind label only; the content preview lives in the tooltip. */
export function EventRow({ event, selected, onSelect, countSuffix, resultChip, onSelectChip, chipSelected }: EventRowProps) {
  const chipTone = resultChip?.isError ? 'tl-chip tl-chip-err' : 'tl-chip tl-chip-ok';
  return (
    <div className={selected ? 'tl-row tl-row-selected' : 'tl-row'} onClick={onSelect} title={getEventLabel(event)}>
      <span className="tl-icon">{EVENT_ICONS[event.kind] || <FileText size={11} color="var(--text-muted)" />}</span>
      <span className={`tl-label tl-kind-${event.kind}`}>
        {getChipLabel(event)}{countSuffix && countSuffix > 1 ? ` ×${countSuffix}` : ''}
      </span>
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
  countSuffix?: number;
}

/** Tool rows carry their paired result as a clickable chip. */
function MergedRow({ event, pairs, onSelectEvent, selectedEventUuid, countSuffix }: MergedRowProps) {
  const chip = event.kind === 'tool_use' && event.toolUseId ? pairs.results.get(event.toolUseId) : undefined;
  return (
    <EventRow
      event={event}
      countSuffix={countSuffix}
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

/** Merged rows; spawn runs collapsed, optional noise compression into dim strips. */
function MergedList({ events, pairs, compressNoise, onSelectEvent, selectedEventUuid }: MergedListProps) {
  const items = useMemo(
    () => groupSpawnRuns(compressNoise ? compressNoiseRuns(events) : events),
    [events, compressNoise],
  );
  return (
    <>
      {items.map((item, index) => {
        if ('noiseRun' in item) {
          return <div key={`noise-${index}`} className="tl-noise-strip">····&ensp;{noiseSummary(item.noiseRun)}</div>;
        }
        if ('spawnRun' in item) {
          const head = item.spawnRun[0];
          return (
            <MergedRow
              key={head.eventKey || head.uuid || index}
              event={head}
              countSuffix={item.spawnRun.length}
              pairs={pairs}
              onSelectEvent={onSelectEvent}
              selectedEventUuid={item.spawnRun.some((spawn) => spawn.uuid === selectedEventUuid) ? head.uuid : selectedEventUuid}
            />
          );
        }
        return (
          <MergedRow
            key={item.eventKey || item.uuid || index}
            event={item}
            pairs={pairs}
            onSelectEvent={onSelectEvent}
            selectedEventUuid={selectedEventUuid}
          />
        );
      })}
    </>
  );
}

function CurrentTimeline({ events, onSelectEvent, selectedEventUuid }: TimelineProps) {
  const items = useMemo(() => groupSpawnRuns(events), [events]);
  return (
    <>
      {items.map((item, index) => {
        const event = 'spawnRun' in item ? item.spawnRun[0] : (item as TranscriptEvent);
        const run = 'spawnRun' in item ? item.spawnRun : [event];
        return (
          <EventRow
            key={event.eventKey || event.uuid || index}
            event={event}
            countSuffix={run.length}
            selected={run.some((member) => member.uuid === selectedEventUuid)}
            onSelect={() => onSelectEvent(event.uuid)}
          />
        );
      })}
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

/** Left column: the main agent's event chips. Stats live in the session bar above. */
export function AgentBoard({ events, visibleEvents, pairs, onSelectEvent, selectedEventUuid, variant }: AgentBoardProps) {
  return (
    <div className="tl-col">
      <div className="tl-col-title">Agent Timeline</div>
      {events.length === 0 ? (
        <div className="tl-col-hint">
          <Network size={28} strokeWidth={1.5} />
          <span>Select a session to view transcript</span>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="tl-empty">All events hidden by view filters</div>
      ) : (
        <div className="tl-col-scroll">
          <TimelineBody variant={variant} events={visibleEvents} pairs={pairs} onSelectEvent={onSelectEvent} selectedEventUuid={selectedEventUuid} />
        </div>
      )}
    </div>
  );
}
