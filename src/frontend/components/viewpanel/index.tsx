import React, { useMemo, useState } from 'react';
import type { TranscriptEvent } from '../index.js';
import type { FilterKeyUpdate, TimelineVariant } from '../board/timelineModel.js';
import {
  CATEGORY_SECTIONS,
  VARIANT_OPTIONS,
  childToggleUpdate,
  classifyEvent,
  loadStoredVariant,
  masterState,
  masterToggleUpdate,
  storeVariant,
} from '../board/timelineModel.js';
import { AgentCostSection, CostSection } from './costSection.js';
import type { AgentInfo } from '../../lib/agentSocket/index.js';
import type { CostSettings, SessionUsage } from '../../lib/cost/index.js';
import { FONTS, THEMES, applyFont, applyTheme, currentFont, currentTheme } from '../../lib/theme/index.js';
import { TimezonePicker } from './timezone/index.js';
import './index.css';

const HIDDEN_EVENTS_KEY = 'mc-hidden-events';
const PANEL_OPEN_KEY = 'mc-view-panel-open';

// Persisted hidden "category/child" filter keys; anything malformed resets to
// the default (empty = everything visible).
function loadHiddenEvents(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_EVENTS_KEY) || '[]');
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return new Set(parsed);
    }
  } catch {
    // fall through to the default
  }
  return new Set();
}

/**
 * Panel state hook, called from DashboardShell so hiddenEvents/variant can be
 * passed down to the board. Return names line up with ViewPanel props so the
 * shell can spread the whole object.
 */
export function useViewPanelState() {
  const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(loadHiddenEvents);
  const [open, setOpen] = useState(() => localStorage.getItem(PANEL_OPEN_KEY) === 'true');
  const [variant, setVariant] = useState<TimelineVariant>(loadStoredVariant);

  function onToggle(update: FilterKeyUpdate): void {
    const next = new Set(hiddenEvents);
    for (const filterKey of update.show) next.delete(filterKey);
    for (const filterKey of update.hide) next.add(filterKey);
    localStorage.setItem(HIDDEN_EVENTS_KEY, JSON.stringify([...next]));
    setHiddenEvents(next);
  }

  function toggleOpen(): void {
    localStorage.setItem(PANEL_OPEN_KEY, String(!open));
    setOpen(!open);
  }

  function onVariantChange(next: TimelineVariant): void {
    storeVariant(next);
    setVariant(next);
  }

  return { hiddenEvents, open, variant, onToggle, toggleOpen, onVariantChange };
}

interface ChildEntry {
  child: string;
  filterKey: string;
  count: number;
}

interface CategoryEntry {
  category: string;
  section: string;
  children: ChildEntry[];
  total: number;
}

interface ViewPanelProps {
  open: boolean;
  viewMode: string;
  events: TranscriptEvent[];
  hiddenEvents: Set<string>;
  onToggle: (update: FilterKeyUpdate) => void;
  variant: TimelineVariant;
  onVariantChange: (variant: TimelineVariant) => void;
  sessionUsage: SessionUsage | null;
  costSettings: CostSettings;
  onCostSettingsChange: (next: CostSettings) => void;
  activeAgent: AgentInfo | null;
}

function toCategoryEntry(category: string, childCounts: Map<string, number>): CategoryEntry {
  const children = [...childCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([child, count]) => ({ child, filterKey: `${category}/${child}`, count }));
  return {
    category,
    section: CATEGORY_SECTIONS[category],
    children,
    total: children.reduce((total, entry) => total + entry.count, 0),
  };
}

/**
 * Enumerate present categories/children with counts from the FULL session
 * event array — never the playback slice, so the toggle tree stays stable
 * while scrubbing. Sidechain is cross-cutting: counted separately, on top
 * of each event's normal category.
 */
function enumerateCategories(events: TranscriptEvent[]): CategoryEntry[] {
  const counts = new Map<string, Map<string, number>>();
  let sidechainCount = 0;
  for (const event of events) {
    if (event.isSidechain) sidechainCount += 1;
    const { category, child } = classifyEvent(event);
    const childCounts = counts.get(category) ?? new Map<string, number>();
    childCounts.set(child, (childCounts.get(child) ?? 0) + 1);
    counts.set(category, childCounts);
  }
  if (sidechainCount > 0) counts.set('sidechain', new Map([['sidechain', sidechainCount]]));
  // CATEGORY_SECTIONS key order fixes the display order; absent categories are not rendered.
  return Object.keys(CATEGORY_SECTIONS)
    .filter((category) => counts.has(category))
    .map((category) => toCategoryEntry(category, counts.get(category) as Map<string, number>));
}

function stateGlyph(state: 'on' | 'off' | 'mixed'): string {
  if (state === 'mixed') return '◐';
  return state === 'on' ? '✓' : '';
}

interface ChildRowProps {
  entry: ChildEntry;
  hidden: boolean;
  onClick: () => void;
}

function ChildRow({ entry, hidden, onClick }: ChildRowProps) {
  return (
    <div className="vp-row vp-row-child" onClick={onClick}>
      <span className="vp-check">{hidden ? '' : '✓'}</span>
      <span className="vp-label u-truncate">{entry.child}</span>
      <span className="vp-count">{entry.count}</span>
    </div>
  );
}

interface CategoryRowProps {
  entry: CategoryEntry;
  hiddenEvents: Set<string>;
  onToggle: (update: FilterKeyUpdate) => void;
  expanded: boolean;
  onExpand: () => void;
}

// Master toggle: on → hide the category via its wildcard key; off/mixed → show all children.
function CategoryRow({ entry, hiddenEvents, onToggle, expanded, onExpand }: CategoryRowProps) {
  const filterKeys = entry.children.map((child) => child.filterKey);
  const state = masterState(entry.category, filterKeys, hiddenEvents);
  const wildcardHidden = hiddenEvents.has(`${entry.category}/*`);
  const expandable = entry.children.length > 1;
  return (
    <>
      <div className="vp-row">
        <span className={expandable ? 'vp-caret' : 'vp-caret vp-caret-blank'} onClick={expandable ? onExpand : undefined}>
          {expandable ? (expanded ? '▾' : '▸') : ''}
        </span>
        <span className="vp-toggle" onClick={() => onToggle(masterToggleUpdate(entry.category, filterKeys, state))}>
          <span className="vp-check">{stateGlyph(state)}</span>
          <span className="vp-label u-truncate">{entry.category}</span>
          <span className="vp-count">{entry.total}</span>
        </span>
      </div>
      {expandable && expanded && entry.children.map((childEntry) => (
        <ChildRow
          key={childEntry.filterKey}
          entry={childEntry}
          hidden={wildcardHidden || hiddenEvents.has(childEntry.filterKey)}
          onClick={() => onToggle(childToggleUpdate(entry.category, childEntry.filterKey, filterKeys, hiddenEvents))}
        />
      ))}
    </>
  );
}

/** Collapsible sub-menu section. Body height animates via the grid 0fr→1fr trick. */
function VpSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="vp-section">
      <button type="button" className="vp-section-toggle" onClick={() => setOpen(!open)}>
        <span className="u-section-title vp-section-title">{title}</span>
        <span className={open ? 'vp-section-caret vp-section-caret-open' : 'vp-section-caret'}>▸</span>
      </button>
      <div className={open ? 'vp-section-body vp-section-body-open' : 'vp-section-body'}>
        <div className="vp-section-inner">{children}</div>
      </div>
    </div>
  );
}

/** Vertical option list in the rail style: quiet rows, active row gets a dot + brighter text. */
function OptionList<T extends string>({ options, active, onSelect }: {
  options: { id: T; label: string; description?: string; fontFamily?: string }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="vp-options">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={active === option.id ? 'vp-option vp-option-active' : 'vp-option'}
          onClick={() => onSelect(option.id)}
        >
          <span className="vp-option-dot" />
          <span className="vp-option-body">
            <span className="vp-option-name" style={option.fontFamily ? { fontFamily: option.fontFamily } : undefined}>{option.label}</span>
            {option.description && <span className="vp-option-desc">{option.description}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

const FONT_FAMILIES: Record<string, string> = {
  'source-serif': "'Source Serif 4', serif",
  newsreader: "'Newsreader', serif",
  inter: "'Inter', sans-serif",
  hanken: "'Hanken Grotesk', sans-serif",
  plex: "'IBM Plex Sans', sans-serif",
};

/** App-wide theme + font picker; present in every view's panel. */
function AppearanceSection() {
  const [theme, setTheme] = useState(currentTheme);
  const [font, setFont] = useState(currentFont);
  const activeName = THEMES.find((entry) => entry.id === theme)?.name ?? theme;

  return (
    <>
      <div className="vp-group-title">Theme · {activeName}</div>
      {(['dark', 'light'] as const).map((mode) => (
        <div key={mode} className="vp-swatch-row">
          {THEMES.filter((entry) => entry.mode === mode).map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.name}
              className={theme === entry.id ? 'vp-swatch vp-swatch-active' : 'vp-swatch'}
              style={{ backgroundColor: entry.bg }}
              onClick={() => { applyTheme(entry.id); setTheme(entry.id); }}
            >
              <span className="vp-swatch-dot" style={{ backgroundColor: entry.accent }} />
            </button>
          ))}
        </div>
      ))}
      <div className="vp-group-title">Font</div>
      <OptionList
        options={FONTS.map((entry) => ({ id: entry.id, label: entry.name, fontFamily: FONT_FAMILIES[entry.id] }))}
        active={font}
        onSelect={(id) => { applyFont(id); setFont(id); }}
      />
    </>
  );
}

function EventVisibility({ events, hiddenEvents, onToggle }: { events: TranscriptEvent[]; hiddenEvents: Set<string>; onToggle: (update: FilterKeyUpdate) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const categories = useMemo(() => enumerateCategories(events), [events]);
  const sections = [...new Set(categories.map((entry) => entry.section))];

  function toggleExpand(category: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <>
      {sections.map((section) => (
        <div key={section} className="vp-group">
          <div className="vp-group-title">{section}</div>
          {categories.filter((entry) => entry.section === section).map((entry) => (
            <CategoryRow
              key={entry.category}
              entry={entry}
              hiddenEvents={hiddenEvents}
              onToggle={onToggle}
              expanded={expanded.has(entry.category)}
              onExpand={() => toggleExpand(entry.category)}
            />
          ))}
        </div>
      ))}
    </>
  );
}

/** Right-hand collapsible settings panel; fully unmounts its body when closed (width 0). */
export function ViewPanel({ open, viewMode, events, hiddenEvents, onToggle, variant, onVariantChange, sessionUsage, costSettings, onCostSettingsChange, activeAgent }: ViewPanelProps) {
  if (!open) return null;
  return (
    <div className="vp-panel">
      {viewMode === 'transcript' && (
        <>
          <VpSection title="Layout" defaultOpen>
            <OptionList options={VARIANT_OPTIONS} active={variant} onSelect={onVariantChange} />
          </VpSection>
          <VpSection title="Events">
            <EventVisibility events={events} hiddenEvents={hiddenEvents} onToggle={onToggle} />
          </VpSection>
          <VpSection title="Cost">
            <CostSection usage={sessionUsage} settings={costSettings} onSettingsChange={onCostSettingsChange} />
          </VpSection>
        </>
      )}
      {viewMode === 'agents' && (
        <VpSection title="Cost" defaultOpen>
          <AgentCostSection agent={activeAgent} settings={costSettings} onSettingsChange={onCostSettingsChange} />
        </VpSection>
      )}
      <VpSection title="User Settings">
        <TimezonePicker />
      </VpSection>
      <VpSection title="Appearance" defaultOpen={viewMode !== 'transcript' && viewMode !== 'agents'}>
        <AppearanceSection />
      </VpSection>
    </div>
  );
}
