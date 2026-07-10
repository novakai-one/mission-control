import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigManager } from '../../config/index.js';

export function buildClaudeArgs(prompt: string, opts: { systemPrompt?: string; resumeSessionId?: string }, sessionId: string): string[] {
  const args = ['-p', prompt];
  if (opts.resumeSessionId) {
    args.push('--resume', sessionId);
  } else {
    args.push('--session-id', sessionId);
  }
  args.push('--permission-mode', 'bypassPermissions');
  if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
  return args;
}

export interface AgentStep {
  id: string;
  agentId: string;
  timestamp: string;
  type: 'thought' | 'action' | 'command' | 'stdout' | 'spawn';
  content: string;
  tokenCount?: number;
  stream?: 'stdout' | 'stderr';
}

export interface SpawnInfo {
  command: string;
  args: string[];
  cwd: string;
  pid?: number;
  cliExists: boolean;
  sessionId: string;
}

export interface ExecutionOptions {
  workspacePath: string;
  systemPrompt?: string;
  resumeSessionId?: string;
  onStdout: (data: string) => void;
  onStep: (step: Partial<AgentStep>) => void;
  onSpawn?: (info: SpawnInfo) => void;
}

// Resolve a CLI command to an absolute path so the Debug tab can show what actually ran.
// A bare name (no separator) is looked up on PATH manually — spawn does this internally but throws the result away.
export function resolveCli(cmd: string): { resolved: string; exists: boolean } {
  if (cmd.includes(path.sep) || cmd.includes('/')) {
    return { resolved: path.resolve(cmd), exists: fs.existsSync(cmd) };
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, cmd);
    if (fs.existsSync(candidate)) return { resolved: candidate, exists: true };
  }
  return { resolved: cmd, exists: false };
}

export class AgentExecutor {
  private readonly activeSubprocesses = new Map<string, ChildProcess>();
  private readonly activeAbortControllers = new Map<string, AbortController>();

  public async runClaudeCode(agentId: string, prompt: string, options: ExecutionOptions): Promise<void> {
    // No --bare: bare mode skips credential loading and reports "Not logged in" even when authenticated.
    const sessionId = options.resumeSessionId ?? randomUUID();
    const args = buildClaudeArgs(prompt, options, sessionId);

    // Reads static machine config (not per-request like geminiApiKey), so load here rather than thread through.
    const cliPath = ConfigManager.load().claudeCliPath || 'claude';
    const { resolved, exists } = resolveCli(cliPath);
    // No shell: absolute path bypasses PATH, and args stay discrete (no word-splitting / shell injection from the prompt).
    const processInstance = spawn(resolved, args, {
      cwd: options.workspacePath,
      env: { ...process.env, FORCE_COLOR: '1' },
      // stdin ignored: prompt comes via -p, so no piped input — avoids Claude's 3s "no stdin" wait.
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.activeSubprocesses.set(agentId, processInstance);
    options.onSpawn?.({ command: resolved, args, cwd: options.workspacePath, pid: processInstance.pid, cliExists: exists, sessionId });

    processInstance.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      options.onStdout(text);
      options.onStep({
        id: Math.random().toString(36).substring(7),
        agentId,
        timestamp: new Date().toISOString(),
        type: 'stdout',
        content: text,
        stream: 'stdout'
      });
    });

    // stderr labeled as its own step so the Debug tab can show it separately (auth errors land here).
    processInstance.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      options.onStdout(text);
      options.onStep({
        id: Math.random().toString(36).substring(7),
        agentId,
        timestamp: new Date().toISOString(),
        type: 'stdout',
        content: text,
        stream: 'stderr'
      });
    });

    return new Promise<void>((resolve, reject) => {
      // Without this, a bad CLI path (ENOENT) makes the process throw uncaught / never settle. Reject instead.
      processInstance.on('error', (err) => {
        this.activeSubprocesses.delete(agentId);
        reject(err);
      });
      processInstance.on('close', (code) => {
        this.activeSubprocesses.delete(agentId);
        if (code === 0) {
          resolve();
        } else {
          // code === null means killed by signal (e.g. SIGINT from Stop) — no longer treated as success.
          const err = new Error(`Claude process exited with code ${code}`) as Error & { exitCode: number | null };
          err.exitCode = code;
          reject(err);
        }
      });
    });
  }

  public async runGeminiApi(agentId: string, prompt: string, apiKey: string, options: ExecutionOptions): Promise<void> {
    const abortController = new AbortController();
    this.activeAbortControllers.set(agentId, abortController);

    const apiEndpoint = `https://generativelanguageapis.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${apiKey}`;
    const requestPayload = {
      contents: [{ parts: [{ text: options.systemPrompt ? `${options.systemPrompt}\n\nUser: ${prompt}` : prompt }] }]
    };

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Gemini API returned HTTP status ${response.status}`);
      }

      const responseReader = response.body?.getReader();
      if (!responseReader) {
        throw new Error('Response body stream is not available');
      }

      const textDecoder = new TextDecoder();
      await this.processStreamReader(responseReader, textDecoder, agentId, options);
    } finally {
      this.activeAbortControllers.delete(agentId);
    }
  }

  private async processStreamReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    agentId: string,
    options: ExecutionOptions
  ): Promise<void> {
    let textBuffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      textBuffer += decoder.decode(value, { stream: true });
      const processedBuffer = this.parseStreamingJsonBuffer(textBuffer, agentId, options);
      textBuffer = processedBuffer;
    }
  }

  private parseStreamingJsonBuffer(buffer: string, agentId: string, options: ExecutionOptions): string {
    let remaining = buffer;
    while (true) {
      const matchIndex = remaining.indexOf('}\n]');
      if (matchIndex === -1) break;

      const singleJsonChunk = remaining.substring(0, matchIndex + 2);
      remaining = remaining.substring(matchIndex + 3);

      try {
        const cleanJson = singleJsonChunk.replace(/^\s*,\s*/, '').trim();
        const parsed = JSON.parse(cleanJson);
        const chunkText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (chunkText) {
          options.onStdout(chunkText);
          options.onStep({
            id: Math.random().toString(36).substring(7),
            agentId,
            timestamp: new Date().toISOString(),
            type: 'thought',
            content: chunkText
          });
        }
      } catch {
        // Continue buffering if JSON chunk is partial or invalid
      }
    }
    return remaining;
  }

  public async stopProcess(agentId: string): Promise<boolean> {
    const processInstance = this.activeSubprocesses.get(agentId);
    if (processInstance) {
      processInstance.kill('SIGINT');
      this.activeSubprocesses.delete(agentId);
      return true;
    }

    const controller = this.activeAbortControllers.get(agentId);
    if (controller) {
      controller.abort();
      this.activeAbortControllers.delete(agentId);
      return true;
    }

    return false;
  }
}
