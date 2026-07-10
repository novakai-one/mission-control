import React, { useState, useEffect, useRef } from 'react';
import { AppHeader } from './dashboard/index.js';
import { AgentBoard } from './board/index.js';
import { SelectedInspector } from './details/index.js';
import { PlaybackSlider } from './history/index.js';
import { RulesetInspector, RulesetData } from './ruleset/index.js';
import { TerminalPanel, BuildMessage } from './terminal/index.js';
import { SettingsPanel } from './settings/index.js';
import { DebugPanel } from './debug/index.js';
import { FilesPanel } from './files/index.js';
import { SubagentInspector } from './subagent/index.js';
import { SidePanel } from './sidepanel/index.js';
import { AgentsView, useAgentsState } from './agents/index.js';
import { upsertEvent } from '../lib/upsertEvents.js';

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
  // session_meta
  mode?: string;
  permissionMode?: string;
  summary?: string;
}

export function DashboardShell() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(-1);
  const [selectedEventUuid, setSelectedEventUuid] = useState<string | null>(null);
  const [selectedSubEvent, setSelectedSubEvent] = useState<TranscriptEvent | null>(null);
  const [viewMode, setViewMode] = useState<'files' | 'agents' | 'transcript' | 'livechat' | 'ruleset' | 'debug'>('files');
  const agentsState = useAgentsState();
  const [rulesetData, setRulesetData] = useState<RulesetData | null>(null);
  const [buildMessages, setBuildMessages] = useState<BuildMessage[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);

  const webSocketRef = useRef<WebSocket | null>(null);
  // Mirror for the ws onmessage closure, which only mounts once.
  const selectedSessionRef = useRef<string | null>(null);
  selectedSessionRef.current = selectedSession;

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

  // Load transcript when the selected session changes
  useEffect(() => {
    let cancelled = false;
    if (!selectedMeta) return;
    fetch(`/api/transcript?project=${selectedMeta.dirName}&session=${selectedMeta.sessionId}`)
      .then(res => res.json())
      .then((data: TranscriptEvent[]) => {
        if (cancelled) return;
        setEvents(data);
        setPlaybackIndex(-1); // live mode
      })
      .catch(() => {});
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
        setEvents(prev => (matches ? upsertEvent(prev, message.payload) : prev));
      } else if (message.event === 'watch-started') {
        setLiveMode(true);
      } else if (message.event === 'build-session' && message.payload?.sessionId && message.payload?.projectDir) {
        const { sessionId, projectDir } = message.payload;
        setSessions(prev => prev.some(session => session.sessionId === sessionId)
          ? prev
          : [{ sessionId, dirName: projectDir, matchReason: 'cwd', modified: Date.now(), size: 0 }, ...prev]);
        setSelectedSession(sessionId);
      } else {
        // Build/agent events
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
        liveMode={liveMode}
        eventCount={events.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenSettings={() => setSettingsOpen(true)}
        activeRepo={activeRepo}
        homeDir={homeDir}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SidePanel
          agents={agentsState.agents}
          activeAgentId={agentsState.activeAgentId}
          collapsed={agentsState.collapsed}
          onToggle={agentsState.toggleCollapsed}
          onSelect={(agentId) => { agentsState.setActiveAgentId(agentId); setViewMode('agents'); }}
          onCreate={agentsState.createAgent}
        />
        {viewMode === 'files' ? (
          <FilesPanel
            homeDir={homeDir}
            activeRepo={activeRepo}
            onActiveRepoChange={setActiveRepo}
          />
        ) : viewMode === 'agents' ? (
          <AgentsView agents={agentsState.agents} activeAgentId={agentsState.activeAgentId} onCreate={agentsState.createAgent} />
        ) : viewMode === 'transcript' ? (
          <>
            <AgentBoard
              events={currentEvents}
              onSelectEvent={(uuid) => { setSelectedEventUuid(uuid); setSelectedSubEvent(null); }}
              selectedEventUuid={selectedEventUuid}
            />
            <SelectedInspector
              event={selectedSubEvent ?? selectedEvent}
              events={currentEvents}
            />
            <SubagentInspector
              projectDir={selectedMeta?.dirName ?? null}
              sessionId={selectedSession}
              selectedEvent={selectedEvent}
              mainEvents={currentEvents}
              onSelectSubEvent={setSelectedSubEvent}
              selectedSubEventUuid={selectedSubEvent?.uuid ?? null}
            />
          </>
        ) : viewMode === 'livechat' ? (
          <TerminalPanel
            activeRepo={activeRepo}
            onBuildMessage={(msg) => setBuildMessages(prev => [...prev, msg])}
            buildMessages={buildMessages}
            wsReady={webSocketRef.current?.readyState === WebSocket.OPEN}
            resumeSessionId={selectedSession}
            canResume={liveMode && !!selectedSession}
          />
        ) : viewMode === 'ruleset' ? (
          <RulesetInspector data={rulesetData} />
        ) : (
          <DebugPanel
            buildMessages={buildMessages}
            wsReady={webSocketRef.current?.readyState === WebSocket.OPEN}
          />
        )}
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
