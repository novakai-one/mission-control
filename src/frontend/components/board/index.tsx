import React, { useMemo, useState } from 'react';
import { Network, Brain, FileText, Wrench, AlertTriangle, Radio } from 'lucide-react';
import { TranscriptEvent } from '../index.js';
import type { SpawnRun, TimelineVariant, ToolPairs, Turn } from './timelineModel.js';
import { compressNoiseRuns, getChipLabel, getToolLabel, groupIntoTurns, groupSpawnRuns, noiseSummary, selKey } from './timelineModel.js';
import { currentTimeZone } from '../../lib/timezone/index.js';
import './index.css';

interface TimelineProps {
  events: TranscriptEvent[];
  onSelectEvent: (event: TranscriptEvent) => void;
  selectedKey: string | null;
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
  return new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: currentTimeZone() });
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

/** Compact chip row: time + kind label; the content preview lives in the tooltip. */
export function EventRow({ event, selected, onSelect, countSuffix, resultChip, onSelectChip, chipSelected }: EventRowProps) {
  const chipTone = resultChip?.isError ? 'tl-chip tl-chip-err' : 'tl-chip tl-chip-ok';
  return (
    <div className={selected ? 'tl-row tl-row-selected' : 'tl-row'} onClick={onSelect} title={getEventLabel(event)}>
      <span className="tl-time">{formatTime(event.ts)}</span>
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
  selected: boolean;
  pairs: ToolPairs;
  onSelectEvent: (event: TranscriptEvent) => void;
  selectedKey: string | null;
  countSuffix?: number;
}

/** Tool rows carry their paired result as a clickable chip. */
function MergedRow({ event, selected, pairs, onSelectEvent, selectedKey, countSuffix }: MergedRowProps) {
  const chip = event.kind === 'tool_use' && event.toolUseId ? pairs.results.get(event.toolUseId) : undefined;
  return (
    <EventRow
      event={event}
      countSuffix={countSuffix}
      resultChip={chip}
      selected={selected}
      onSelect={() => onSelectEvent(event)}
      onSelectChip={chip ? () => onSelectEvent(chip) : undefined}
      chipSelected={chip ? selectedKey === selKey(chip) : false}
    />
  );
}

// Drop tool_result events whose tool_use is visible in the same slice; the
// result renders as a chip on the tool row instead. Unpaired results stay.
function withoutPairedResults(events: TranscriptEvent[], pairs: ToolPairs): TranscriptEvent[] {
  return events.filter((event) => !(event.kind === 'tool_result' && pairs.toolUseIds.has(event.toolUseId || '')));
}

/** Row props shared by every variant for a plain event or a collapsed spawn run. */
function rowProps(item: TranscriptEvent | SpawnRun, selectedKey: string | null) {
  const run = 'spawnRun' in item ? item.spawnRun : null;
  const event = 'spawnRun' in item ? item.spawnRun[0] : item;
  return {
    event,
    countSuffix: run?.length,
    selected: run ? run.some((member) => selKey(member) === selectedKey) : selKey(event) === selectedKey,
  };
}

interface MergedListProps extends TimelineProps {
  pairs: ToolPairs;
  compressNoise: boolean;
}

/** Merged rows; spawn runs collapsed, optional noise compression into dim strips. */
function MergedList({ events, pairs, compressNoise, onSelectEvent, selectedKey }: MergedListProps) {
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
        const props = rowProps(item, selectedKey);
        return (
          <MergedRow
            key={selKey(props.event) || index}
            {...props}
            pairs={pairs}
            onSelectEvent={onSelectEvent}
            selectedKey={selectedKey}
          />
        );
      })}
    </>
  );
}

function CurrentTimeline({ events, onSelectEvent, selectedKey }: TimelineProps) {
  const items = useMemo(() => groupSpawnRuns(events), [events]);
  return (
    <>
      {items.map((item, index) => {
        const props = rowProps(item as TranscriptEvent | SpawnRun, selectedKey);
        return (
          <EventRow
            key={selKey(props.event) || index}
            {...props}
            onSelect={() => onSelectEvent(props.event)}
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
  onSelect: (event: TranscriptEvent) => void;
  selectedKey: string | null;
}

function TurnHeader({ turn, collapsed, onToggle, onSelect, selectedKey }: TurnHeaderProps) {
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
            className={selectedKey === selKey(header) ? 'tl-turn-text tl-turn-text-selected' : 'tl-turn-text'}
            onClick={() => onSelect(header)}
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

function TurnBlock({ turn, pairs, collapsed, onToggle, onSelect, selectedKey }: TurnBlockProps) {
  return (
    <div className="tl-turn">
      <TurnHeader turn={turn} collapsed={collapsed} onToggle={onToggle} onSelect={onSelect} selectedKey={selectedKey} />
      {!collapsed && (
        <div className="tl-turn-children">
          <MergedList events={turn.children} pairs={pairs} compressNoise onSelectEvent={onSelect} selectedKey={selectedKey} />
        </div>
      )}
    </div>
  );
}

function GroupedTimeline({ events, pairs, onSelectEvent, selectedKey }: TimelineProps & { pairs: ToolPairs }) {
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
        const turnId = turn.header ? selKey(turn.header) : `pre-${index}`;
        return (
          <TurnBlock
            key={turnId}
            turn={turn}
            pairs={pairs}
            collapsed={collapsed.has(turnId)}
            onToggle={() => toggleTurn(turnId)}
            onSelect={onSelectEvent}
            selectedKey={selectedKey}
          />
        );
      })}
    </>
  );
}

// Pure layout: visibility is the view panel's job; variants never hide events themselves.
function TimelineBody({ variant, events, pairs, onSelectEvent, selectedKey }: TimelineProps & { variant: TimelineVariant; pairs: ToolPairs }) {
  const merged = useMemo(() => withoutPairedResults(events, pairs), [events, pairs]);
  if (variant === 'grouped') {
    return <GroupedTimeline events={merged} pairs={pairs} onSelectEvent={onSelectEvent} selectedKey={selectedKey} />;
  }
  if (variant === 'signal' || variant === 'ledger') {
    return (
      <MergedList
        events={merged}
        pairs={pairs}
        compressNoise={variant === 'ledger'}
        onSelectEvent={onSelectEvent}
        selectedKey={selectedKey}
      />
    );
  }
  return <CurrentTimeline events={events} onSelectEvent={onSelectEvent} selectedKey={selectedKey} />;
}

/** Left column: the main agent's event chips. Stats live in the session bar above. */
export function AgentBoard({ events, visibleEvents, pairs, onSelectEvent, selectedKey, variant }: AgentBoardProps) {
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
          <TimelineBody variant={variant} events={visibleEvents} pairs={pairs} onSelectEvent={onSelectEvent} selectedKey={selectedKey} />
        </div>
      )}
    </div>
  );
}
