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

/** Display-only '~' conversion for an absolute path. Never used for anything sent to the backend. */
export function toDisplayPath(absPath: string | null, homeDir: string | null): string {
  if (!absPath) return '';
  if (homeDir && (absPath === homeDir || absPath.startsWith(homeDir + '/'))) {
    return '~' + absPath.slice(homeDir.length);
  }
  return absPath;
}

export interface ProjectInfo {
  dirName: string;
  displayPath: string;
}

export interface SessionMeta {
  sessionId: string;
  projectDir: string;
  filePath: string;
  modified: number;
  size: number;
}

export interface TranscriptEvent {
  kind: string;
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
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(-1);
  const [selectedEventUuid, setSelectedEventUuid] = useState<string | null>(null);
  const [selectedSubEvent, setSelectedSubEvent] = useState<TranscriptEvent | null>(null);
  const [viewMode, setViewMode] = useState<'files' | 'transcript' | 'livechat' | 'ruleset' | 'debug'>('files');
  const [rulesetData, setRulesetData] = useState<RulesetData | null>(null);
  const [buildMessages, setBuildMessages] = useState<BuildMessage[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);

  const webSocketRef = useRef<WebSocket | null>(null);

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

  // Load projects on mount
  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then((data: ProjectInfo[]) => {
        setProjects(data);
        // Auto-select novakai if present
        const novakai = data.find(p => p.dirName.includes('novakai') && !p.dirName.includes('worktree'));
        if (novakai) setSelectedProject(novakai.dirName);
      })
      .catch(() => {});
  }, []);

  // Load sessions when project changes
  useEffect(() => {
    if (!selectedProject) return;
    fetch(`/api/sessions?project=${selectedProject}`)
      .then(res => res.json())
      .then((data: SessionMeta[]) => {
        setSessions(data);
        // Auto-select most recent
        if (data[0]) setSelectedSession(data[0].sessionId);
      })
      .catch(() => {});
  }, [selectedProject]);

  // Load ruleset data when project changes
  useEffect(() => {
    if (!selectedProject) return;
    fetch(`/api/ruleset?project=${selectedProject}`)
      .then(res => res.json())
      .then((data: RulesetData) => setRulesetData(data))
      .catch(() => {});
  }, [selectedProject]);

  // Load transcript when session changes
  useEffect(() => {
    if (!selectedProject || !selectedSession) return;
    fetch(`/api/transcript?project=${selectedProject}&session=${selectedSession}`)
      .then(res => res.json())
      .then((data: TranscriptEvent[]) => {
        setEvents(data);
        setPlaybackIndex(-1); // live mode
      })
      .catch(() => {});
  }, [selectedProject, selectedSession]);

  // WebSocket for live updates
  useEffect(() => {
    const wsUrl = `ws://${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    webSocketRef.current = socket;

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.event === 'transcript-event') {
        setEvents(prev => [...prev, message.payload]);
      } else if (message.event === 'watch-started') {
        setLiveMode(true);
      } else {
        // Build/agent events
        setBuildMessages(prev => [...prev, message]);
      }
    };

    return () => socket.close();
  }, []);

  // Start watching when session is selected and in live mode
  useEffect(() => {
    if (!selectedProject || !selectedSession || !webSocketRef.current) return;
    const socket = webSocketRef.current;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'watch-session', project: selectedProject, session: selectedSession }));
    }
  }, [selectedProject, selectedSession, webSocketRef.current?.readyState]);

  const currentEvents = playbackIndex >= 0
    ? events.slice(0, playbackIndex + 1)
    : events;

  // Build agent tree from events
  const agentSpawns = currentEvents.filter(e => e.kind === 'tool_use' && e.isAgentSpawn);
  const selectedEvent = currentEvents.find(e => e.uuid === selectedEventUuid);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <AppHeader 
        projects={projects}
        selectedProject={selectedProject}
        onSelectProject={(dir) => { setSelectedProject(dir); setSelectedEventUuid(null); setSelectedSubEvent(null); }}
        liveMode={liveMode}
        eventCount={events.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenSettings={() => setSettingsOpen(true)}
        activeRepo={activeRepo}
        homeDir={homeDir}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
            />
            <SelectedInspector
              event={selectedSubEvent ?? selectedEvent}
              events={currentEvents}
            />
            <SubagentInspector
              projectDir={selectedProject}
              sessionId={selectedSession}
              selectedEvent={selectedEvent}
              mainEvents={currentEvents}
              onSelectSubEvent={setSelectedSubEvent}
              selectedSubEventUuid={selectedSubEvent?.uuid ?? null}
            />
          </>
        ) : viewMode === 'livechat' ? (
          <TerminalPanel
            selectedProject={selectedProject}
            onBuildMessage={(msg) => setBuildMessages(prev => [...prev, msg])}
            buildMessages={buildMessages}
            wsReady={webSocketRef.current?.readyState === WebSocket.OPEN}
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
