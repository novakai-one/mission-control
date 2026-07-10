import { AgentExecutor, AgentStep } from './executor/index.js';
import { StateManager, BuildRecord } from '../state/index.js';
import { SubagentManager } from './subagent/index.js';
import { encodeCwd } from '../transcript/parser.js';

export interface AgentInstance {
  id: string;
  role: string;
  parentAgentId?: string;
  status: 'idle' | 'thinking' | 'running' | 'stopping' | 'stopped';
  currentAction?: string;
  tokensSpent: number;
}

export class AgentCoordinator {
  private readonly activeAgents = new Map<string, AgentInstance>();
  private readonly subagentManager = new SubagentManager();
  private activeBuild?: BuildRecord;
  private onBroadcastCallback?: (event: string, payload: any) => void;

  constructor(
    private readonly executor: AgentExecutor,
    private readonly stateManager: StateManager
  ) {}

  public setBroadcastHandler(callback: (event: string, payload: any) => void): void {
    this.onBroadcastCallback = callback;
  }

  private triggerBroadcast(event: string, payload: any): void {
    if (this.onBroadcastCallback) {
      this.onBroadcastCallback(event, payload);
    }
  }

  public getActiveAgents(): AgentInstance[] {
    return Array.from(this.activeAgents.values());
  }

  public async startBuild(prompt: string, llmType: 'claude' | 'gemini', geminiApiKey?: string, resumeSessionId?: string): Promise<string> {
    if (this.activeBuild && this.activeBuild.status === 'running') {
      throw new Error('BUILD_BUSY');
    }

    const buildId = `build_${Math.random().toString(36).substring(7)}`;
    const rootAgentId = `agent_coordinator`;

    const activeBuildRecord: BuildRecord = {
      id: buildId,
      startTime: new Date().toISOString(),
      status: 'running',
      steps: []
    };

    this.activeBuild = activeBuildRecord;
    this.activeAgents.clear();
    this.subagentManager.clear();

    const rootAgentNode: AgentInstance = {
      id: rootAgentId,
      role: 'Coordinator Agent',
      status: 'running',
      tokensSpent: 0
    };

    this.activeAgents.set(rootAgentId, rootAgentNode);
    this.subagentManager.registerAgent(rootAgentId, rootAgentNode.role);

    this.triggerBroadcast('build-started', { build: activeBuildRecord, agents: this.getActiveAgents() });

    this.runAgentLoop(rootAgentId, prompt, llmType, geminiApiKey, resumeSessionId).catch(() => {});

    return buildId;
  }

  private async runAgentLoop(agentId: string, prompt: string, llmType: 'claude' | 'gemini', geminiApiKey?: string, resumeSessionId?: string): Promise<void> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return;

    const onStdoutHandler = (text: string) => {
      this.triggerBroadcast('agent-stdout', { agentId, content: text });
    };

    const onStepHandler = (stepData: Partial<AgentStep>) => {
      const step: AgentStep = {
        id: stepData.id || Math.random().toString(36).substring(7),
        agentId: stepData.agentId || agentId,
        timestamp: stepData.timestamp || new Date().toISOString(),
        type: stepData.type || 'thought',
        content: stepData.content || '',
        stream: stepData.stream
      };

      const wordCount = step.content.trim().split(/\s+/).length;
      agent.tokensSpent += Math.round(wordCount * 1.33);

      if (this.activeBuild) {
        this.activeBuild.steps.push(step);
        this.stateManager.saveBuild(this.activeBuild);
      }

      this.triggerBroadcast('agent-step', { agent, step, activeAgents: this.getActiveAgents() });
    };

    if (this.activeBuild) this.activeBuild.llm = llmType;

    // Records the exact command/path/cwd/pid the executor spawned, so the Debug tab can show what actually ran.
    const onSpawnHandler = (info: { command: string; args: string[]; cwd: string; pid?: number; cliExists: boolean; sessionId?: string }) => {
      if (this.activeBuild) {
        this.activeBuild.command = info.command;
        this.activeBuild.args = info.args;
        this.activeBuild.cwd = info.cwd;
        this.activeBuild.pid = info.pid;
        this.activeBuild.cliExists = info.cliExists;
        if (info.sessionId) this.activeBuild.sessionId = info.sessionId;
        this.stateManager.saveBuild(this.activeBuild);
      }
      this.triggerBroadcast('build-debug', { buildId: this.activeBuild?.id, llm: llmType, ...info });
      this.triggerBroadcast('build-session', { buildId: this.activeBuild?.id, sessionId: info.sessionId, projectDir: encodeCwd(info.cwd) });
    };

    try {
      if (llmType === 'gemini' && geminiApiKey) {
        await this.executor.runGeminiApi(agentId, prompt, geminiApiKey, {
          workspacePath: process.cwd(),
          onStdout: onStdoutHandler,
          onStep: onStepHandler
        });
      } else {
        await this.executor.runClaudeCode(agentId, prompt, {
          workspacePath: process.cwd(),
          onStdout: onStdoutHandler,
          onStep: onStepHandler,
          onSpawn: onSpawnHandler,
          resumeSessionId
        });
      }

      agent.status = 'idle';
      if (this.activeBuild) this.activeBuild.exitCode = 0;
      this.completeBuild('success');
    } catch (err: any) {
      agent.status = 'stopped';
      if (this.activeBuild) {
        this.activeBuild.errorMessage = err?.message ? String(err.message) : String(err);
        if (typeof err?.exitCode !== 'undefined') this.activeBuild.exitCode = err.exitCode;
      }
      this.completeBuild('failed');
    }
  }

  public async stopBuild(buildId: string): Promise<void> {
    if (!this.activeBuild || this.activeBuild.id !== buildId) return;

    this.activeBuild.status = 'stopped';
    this.activeBuild.endTime = new Date().toISOString();

    for (const [agentId, agent] of this.activeAgents.entries()) {
      if (agent.status === 'running' || agent.status === 'thinking') {
        agent.status = 'stopped';
        await this.executor.stopProcess(agentId);
      }
    }

    this.stateManager.saveBuild(this.activeBuild);
    this.triggerBroadcast('build-stopped', { build: this.activeBuild, agents: this.getActiveAgents() });
  }

  public async spawnSubagent(parentAgentId: string, role: string, prompt: string, llmType: 'claude' | 'gemini', geminiApiKey?: string): Promise<string> {
    const subagentId = `agent_sub_${Math.random().toString(36).substring(7)}`;
    const subagentNode: AgentInstance = {
      id: subagentId,
      role,
      parentAgentId,
      status: 'running',
      tokensSpent: 0
    };

    this.activeAgents.set(subagentId, subagentNode);
    this.subagentManager.registerAgent(subagentId, role, parentAgentId);

    const step: AgentStep = {
      id: Math.random().toString(36).substring(7),
      agentId: parentAgentId,
      timestamp: new Date().toISOString(),
      type: 'spawn',
      content: `Spawned subagent ${role} (ID: ${subagentId})`
    };

    if (this.activeBuild) {
      this.activeBuild.steps.push(step);
      this.stateManager.saveBuild(this.activeBuild);
    }

    this.triggerBroadcast('agent-spawned', {
      parentAgentId,
      subagent: subagentNode,
      step,
      agents: this.getActiveAgents()
    });

    this.runAgentLoop(subagentId, prompt, llmType, geminiApiKey).catch(() => {});

    return subagentId;
  }

  private completeBuild(finalStatus: 'success' | 'failed'): void {
    if (!this.activeBuild) return;
    // A stopped build is terminal — don't let a trailing loop rejection relabel it success/failed.
    if (this.activeBuild.status === 'stopped') return;

    this.activeBuild.status = finalStatus;
    this.activeBuild.endTime = new Date().toISOString();
    this.activeBuild.durationMs = new Date(this.activeBuild.endTime).getTime() - new Date(this.activeBuild.startTime).getTime();
    this.stateManager.saveBuild(this.activeBuild);

    this.stateManager.createGitCommit(`Mission Control: Automated commit for build ${this.activeBuild.id} (${finalStatus})`)
      .then((commitHash) => {
        if (this.activeBuild && commitHash) {
          this.activeBuild.gitCommitHash = commitHash;
          this.stateManager.saveBuild(this.activeBuild);
        }
      })
      .catch(() => {});

    this.triggerBroadcast('build-completed', { build: this.activeBuild, agents: this.getActiveAgents() });
  }
}
