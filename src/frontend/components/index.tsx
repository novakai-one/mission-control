import React, { useState, useEffect, useRef } from 'react';
import { AppHeader } from './dashboard/index.js';
import { AgentBoard } from './board/index.js';
import { SelectedInspector } from './details/index.js';
import { PlaybackSlider } from './history/index.js';

export interface AgentStep {
  id: string;
  agentId: string;
  timestamp: string;
  type: 'thought' | 'action' | 'command' | 'stdout' | 'spawn';
  content: string;
}

export interface AgentInstance {
  id: string;
  role: string;
  parentAgentId?: string;
  status: 'idle' | 'thinking' | 'running' | 'stopping' | 'stopped';
  tokensSpent: number;
}

export interface BuildRecord {
  id: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'success' | 'failed' | 'stopped';
  steps: AgentStep[];
  gitCommitHash?: string;
}

export interface AppConfig {
  workspacePath: string;
  geminiApiKey?: string;
  serverPort: number;
}

export function DashboardShell() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [builds, setBuilds] = useState<BuildRecord[]>([]);
  const [activeBuild, setActiveBuild] = useState<BuildRecord | null>(null);
  const [activeAgents, setActiveAgents] = useState<AgentInstance[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [stdoutLogs, setStdoutLogs] = useState<Record<string, string>>({});
  const [playbackIndex, setPlaybackIndex] = useState<number>(-1);
  
  const webSocketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch(() => {});

    fetch('/api/builds')
      .then((res) => res.json())
      .then((data) => setBuilds(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const wsUrl = `ws://${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    webSocketRef.current = socket;

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message.event, message.payload);
    };

    return () => socket.close();
  }, []);

  const handleWebSocketMessage = (event: string, payload: any) => {
    switch (event) {
      case 'build-started':
        setActiveBuild(payload.build);
        setActiveAgents(payload.agents);
        setStdoutLogs({});
        setPlaybackIndex(-1);
        break;
      case 'agent-stdout':
        setStdoutLogs((prev) => ({
          ...prev,
          [payload.agentId]: (prev[payload.agentId] || '') + payload.content
        }));
        break;
      case 'agent-step':
        setActiveAgents(payload.activeAgents);
        setActiveBuild((prev) => prev ? { ...prev, steps: [...prev.steps, payload.step] } : null);
        break;
      case 'agent-spawned':
        setActiveAgents(payload.agents);
        setActiveBuild((prev) => prev ? { ...prev, steps: [...prev.steps, payload.step] } : null);
        break;
      case 'build-stopped':
      case 'build-completed':
        setActiveBuild(payload.build);
        setActiveAgents(payload.agents);
        fetch('/api/builds')
          .then((res) => res.json())
          .then((data) => setBuilds(data))
          .catch(() => {});
        break;
    }
  };

  const handleStartBuild = (prompt: string, llmType: 'claude' | 'gemini') => {
    fetch('/api/builds/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, llmType, geminiApiKey: config?.geminiApiKey })
    }).catch(() => {});
  };

  const handleStopBuild = () => {
    if (!activeBuild) return;
    fetch('/api/builds/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildId: activeBuild.id })
    }).catch(() => {});
  };

  const handleReviewBuild = (build: BuildRecord) => {
    setActiveBuild(build);
    setPlaybackIndex(build.steps.length - 1);
    const parsedLogs: Record<string, string> = {};
    build.steps.forEach((step) => {
      if (step.type === 'stdout') {
        parsedLogs[step.agentId] = (parsedLogs[step.agentId] || '') + step.content;
      }
    });
    setStdoutLogs(parsedLogs);
  };

  const currentSteps = activeBuild 
    ? (playbackIndex >= 0 ? activeBuild.steps.slice(0, playbackIndex + 1) : activeBuild.steps)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <AppHeader 
        config={config} 
        onSetConfig={setConfig} 
        activeBuild={activeBuild}
        onStartBuild={handleStartBuild}
        onStopBuild={handleStopBuild}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <AgentBoard 
          activeAgents={activeAgents} 
          steps={currentSteps}
          onSelectAgent={setSelectedAgentId}
          selectedAgentId={selectedAgentId}
        />
        <SelectedInspector 
          agent={activeAgents.find((a) => a.id === selectedAgentId)}
          stdout={stdoutLogs[selectedAgentId || ''] || ''}
          steps={currentSteps.filter((s) => s.agentId === selectedAgentId)}
        />
      </div>
      <PlaybackSlider 
        activeBuild={activeBuild} 
        playbackIndex={playbackIndex}
        onSetPlaybackIndex={setPlaybackIndex}
        builds={builds}
        onReviewBuild={handleReviewBuild}
      />
    </div>
  );
}
