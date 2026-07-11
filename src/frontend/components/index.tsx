import React, { useState, useEffect, useRef } from 'react';
import { AppHeader } from './dashboard/index.js';
import { AgentBoard } from './board/index.js';
import { SelectedInspector } from './details/index.js';
import { PlaybackSlider } from './history/index.js';
import { RulesetInspector, RulesetData } from './ruleset/index.js';
import { SettingsPanel } from './settings/index.js';
import { DebugPanel, BuildMessage } from './debug/index.js';
import { FilesPanel } from './files/index.js';
import { SubagentInspector } from './subagent/index.js';
import { SidePanel } from './sidepanel/index.js';
import { AgentsView, useAgentsState } from './agents/index.js';
import { ViewPanel, useViewPanelState } from './viewpanel/index.js';
import { upsertEvent } from '../lib/upsertEvents.js';
import { fetchUsage, useCostSettings, type SessionUsage } from '../lib/cost/index.js';

/** Display-only '~' conversion for an absolute path. Never used for anything sent to the backend. */
export function toDisplayPath(absPath: string | null, homeDir: string | null): string {
  if (!absPath) return '';
  if (homeDir && (absPath === homeDir || absPath.startsWith(homeDir + '/'))) {
    return '~' + absPath.slice(homeDir.length);
  }
  return absPath;
}

export interface SessionMeta {
  sessionId: string;
  dirName: string;
  matchReason: 'cwd' | 'files';
  modified: number;
  size: number;
}

export interface TranscriptEvent {
  kind: string;
  eventKey?: string;
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  ts: string;
  isSidechain?: boolean;
  // text events
  text?: string;
  // tool_use events
  tool?: string;
  toolUseId?: string;
  input?: any;
  isAgentSpawn?: boolean;
  agentDescription?: string;
  agentPrompt?: string;
  agentType?: string;
  // tool_result events
  content?: string;
  isError?: boolean;
  // hook events
  hookName?: string;
  hookEvent?: string;
  // system events
  subtype?: string;
  // session_meta
  mode?: string;
  permissionMode?: string;
  summary?: string;
  // usage events (kind 'usage' — stripped from the events state; granular record + refetch trigger)
  model?: string;
  msgId?: string;
  usage?: { input: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number; output: number };
}

const COL_MIN = 280;
const COL_MAX = 900;

/** Invisible 6px strip between columns; highlights on hover, drag resizes the column to its right. */
function ResizeHandle({ width, onWidthChange }: { width: number; onWidthChange(width: number): void }) {
  const [dragging, setDragging] = useState(false);

  function handleMouseDown(event: React.MouseEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(moveEvent: MouseEvent): void {
      onWidthChange(Math.min(COL_MAX, Math.max(COL_MIN, startWidth + startX - moveEvent.clientX)));
    }
    function onUp(): void {
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div
      className={dragging ? 'col-resize-handle col-resize-dragging' : 'col-resize-handle'}
      onMouseDown={handleMouseDown}
    />
  );
}

export function DashboardShell() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState<number>(-1);
  const [selectedEventUuid, setSelectedEventUuid] = useState<string | null>(null);
  const [selectedSubEvent, setSelectedSubEvent] = useState<TranscriptEvent | null>(null);
  const [viewMode, setViewMode] = useState<'files' | 'agents' | 'transcript' | 'ruleset' | 'debug'>('files');
  const agentsState = useAgentsState();
  const [rulesetData, setRulesetData] = useState<RulesetData | null>(null);
  const [buildMessages, setBuildMessages] = useState<BuildMessage[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [detailsWidth, setDetailsWidth] = useState(480);
  const [subagentWidth, setSubagentWidth] = useState(480);
  const viewPanel = useViewPanelState();
  const [sessionUsage, setSessionUsage] = useState<SessionUsage | null>(null);
  const [costSettings, setCostSettings] = useCostSettings();

  const webSocketRef = useRef<WebSocket | null>(null);
  // Mirror for the ws onmessage closure, which only mounts once.
  const selectedSessionRef = useRef<string | null>(null);
  selectedSessionRef.current = selectedSession;

  // Debounced /api/usage refetch: fired per usage-bearing ws frame (main or
  // subagent); trailing debounce keeps re-parsing the jsonl files cheap.
  const usageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedMetaRef = useRef<{ dirName: string; sessionId: string } | null>(null);
  function refetchUsage(delayMs: number): void {
    if (usageTimerRef.current) clearTimeout(usageTimerRef.current);
    usageTimerRef.current = setTimeout(() => {
      const meta = selectedMetaRef.current;
      if (!meta) return;
      fetchUsage(meta.dirName, meta.sessionId)
        .then((data) => {
          if (data && selectedMetaRef.current?.sessionId === meta.sessionId) setSessionUsage(data);
        })
        .catch(() => {});
    }, delayMs);
  }

  // Resolve $HOME once, for '~'-relative display across the shell.
  useEffect(() => {
    fetch('/api/fs?path=~&showHidden=false')
      .then(res => res.json())
      .then(data => setHomeDir(data.path))
      .catch(() => {});
  }, []);

  // Load the persisted active repo on mount.
  useEffect(() => {
    fetch('/api/active-repo')
      .then(res => res.json())
      .then(data => setActiveRepo(data.activeRepo ?? null))
      .catch(() => {});
  }, []);

  // Load sessions when the active repo changes
  useEffect(() => {
    let cancelled = false;
    if (!activeRepo) {
      setSessions([]);
      setSelectedSession(null);
      return;
    }
    fetch('/api/sessions')
      .then(res => res.json())
      .then((data: SessionMeta[]) => {
        if (cancelled) return;
        setSessions(data);
        // Auto-select most recent; clear when the repo has no matches
        setSelectedSession(data[0]?.sessionId ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeRepo]);

  // Load ruleset data when the active repo changes
  useEffect(() => {
    let cancelled = false;
    fetch('/api/ruleset')
      .then(res => res.json())
      .then((data: RulesetData) => { if (!cancelled) setRulesetData(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeRepo]);

  const selectedMeta = sessions.find((session) => session.sessionId === selectedSession) ?? null;
  selectedMetaRef.current = selectedMeta ? { dirName: selectedMeta.dirName, sessionId: selectedMeta.sessionId } : null;

  // Load transcript when the selected session changes. Usage events are data,
  // not rows — stripped here so counts/turns/playback never see them; costs
  // come from /api/usage over the full files (visibility filters never apply).
  useEffect(() => {
    let cancelled = false;
    setSessionUsage(null);
    if (!selectedMeta) return;
    fetch(`/api/transcript?project=${selectedMeta.dirName}&session=${selectedMeta.sessionId}`)
      .then(res => res.json())
      .then((data: TranscriptEvent[]) => {
        if (cancelled) return;
        setEvents(data.filter(event => event.kind !== 'usage'));
        setPlaybackIndex(-1); // live mode
      })
      .catch(() => {});
    refetchUsage(0);
    return () => { cancelled = true; };
  }, [selectedMeta]);

  // WebSocket for live updates
  useEffect(() => {
    const wsUrl = `ws://${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    webSocketRef.current = socket;

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.event === 'transcript-event') {
        // Drop events from a stale watcher during session switches.
        const matches = message.payload?.sessionId === selectedSessionRef.current;
        if (matches && message.payload?.kind === 'usage') {
          refetchUsage(1500); // usage events never enter the events state; they trigger a re-aggregate
        } else {
          setEvents(prev => (matches ? upsertEvent(prev, message.payload) : prev));
        }
      } else if (message.type === 'subagent-event') {
        // Subagent tails stream over the same socket; their usage growth must refresh costs too.
        if (message.sessionId === selectedSessionRef.current && message.event?.kind === 'usage') refetchUsage(1500);
      } else if (message.event === 'watch-started') {
        // Watch acknowledgement — must not fall through to the debug message list.
      } else if (message.event === 'build-session' && message.payload?.sessionId && message.payload?.projectDir) {
        const { sessionId, projectDir } = message.payload;
        setSessions(prev => prev.some(session => session.sessionId === sessionId)
          ? prev
          : [{ sessionId, dirName: projectDir, matchReason: 'cwd', modified: Date.now(), size: 0 }, ...prev]);
        setSelectedSession(sessionId);
      } else if (!message.type) {
        // Build/agent events. Type-keyed frames (agents-changed etc.) belong to
        // the agentSocket dialect and are broadcast to every socket — not ours.
        setBuildMessages(prev => [...prev, message]);
      }
    };

    return () => socket.close();
  }, []);

  // Start watching when session is selected and in live mode
  useEffect(() => {
    if (!selectedMeta || !webSocketRef.current) return;
    const socket = webSocketRef.current;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'watch-session', project: selectedMeta.dirName, session: selectedMeta.sessionId }));
    }
  }, [selectedMeta, webSocketRef.current?.readyState]);

  const currentEvents = playbackIndex >= 0
    ? events.slice(0, playbackIndex + 1)
    : events;

  // Build agent tree from events
  const agentSpawns = currentEvents.filter(e => e.kind === 'tool_use' && e.isAgentSpawn);
  const selectedEvent = currentEvents.find(e => e.uuid === selectedEventUuid);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <AppHeader
        eventCount={events.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenSettings={() => setSettingsOpen(true)}
        activeRepo={activeRepo}
        homeDir={homeDir}
        viewPanelOpen={viewPanel.open}
        onToggleViewPanel={viewPanel.toggleOpen}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SidePanel
          agents={agentsState.agents}
          activeAgentId={agentsState.activeAgentId}
          collapsed={agentsState.collapsed}
          onToggle={agentsState.toggleCollapsed}
          onSelect={(agentId) => { agentsState.setActiveAgentId(agentId); setViewMode('agents'); }}
          onCreate={agentsState.createAgent}
          onRename={agentsState.renameAgent}
          onKill={agentsState.killAgent}
          onArchive={agentsState.archiveAgent}
        />
        {/* Always mounted so agent terminals survive tab switches; hides itself via CSS. */}
        <AgentsView
          agents={agentsState.agents}
          activeAgentId={agentsState.activeAgentId}
          onCreate={agentsState.createAgent}
          visible={viewMode === 'agents'}
        />
        {viewMode === 'files' ? (
          <FilesPanel
            homeDir={homeDir}
            activeRepo={activeRepo}
            onActiveRepoChange={setActiveRepo}
          />
        ) : viewMode === 'transcript' ? (
          <>
            <AgentBoard
              events={currentEvents}
              onSelectEvent={(uuid) => { setSelectedEventUuid(uuid); setSelectedSubEvent(null); }}
              selectedEventUuid={selectedEventUuid}
              variant={viewPanel.variant}
              hiddenEvents={viewPanel.hiddenEvents}
              sessionUsage={sessionUsage}
              costSettings={costSettings}
            />
            <ResizeHandle width={detailsWidth} onWidthChange={setDetailsWidth} />
            <div style={{ width: detailsWidth, minWidth: COL_MIN, flexShrink: 1, display: 'flex', overflow: 'hidden' }}>
              <SelectedInspector
                event={selectedSubEvent ?? selectedEvent}
                events={currentEvents}
              />
            </div>
            <ResizeHandle width={subagentWidth} onWidthChange={setSubagentWidth} />
            <div style={{ width: subagentWidth, minWidth: COL_MIN, flexShrink: 1, display: 'flex', overflow: 'hidden' }}>
              <SubagentInspector
                projectDir={selectedMeta?.dirName ?? null}
                sessionId={selectedSession}
                selectedEvent={selectedEvent}
                mainEvents={currentEvents}
                onSelectSubEvent={setSelectedSubEvent}
                selectedSubEventUuid={selectedSubEvent?.uuid ?? null}
                sessionUsage={sessionUsage}
                costSettings={costSettings}
              />
            </div>
          </>
        ) : viewMode === 'ruleset' ? (
          <RulesetInspector data={rulesetData} />
        ) : viewMode === 'debug' ? (
          <DebugPanel
            buildMessages={buildMessages}
            wsReady={webSocketRef.current?.readyState === WebSocket.OPEN}
          />
        ) : null}
        {/* Panel enumerates from the FULL event array; the board filters its own slice. */}
        <ViewPanel
          viewMode={viewMode}
          events={events}
          {...viewPanel}
          sessionUsage={sessionUsage}
          costSettings={costSettings}
          onCostSettingsChange={setCostSettings}
          activeAgent={agentsState.agents.find(agent => agent.agentId === agentsState.activeAgentId) ?? null}
        />
      </div>
      {viewMode === 'transcript' && (
        <PlaybackSlider 
          sessions={sessions}
          selectedSession={selectedSession}
          onSelectSession={(id) => { setSelectedSession(id); setPlaybackIndex(-1); setSelectedEventUuid(null); setSelectedSubEvent(null); }}
          events={events}
          playbackIndex={playbackIndex}
          onSetPlaybackIndex={setPlaybackIndex}
        />
      )}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
