import { spawn, ChildProcess } from 'node:child_process';

export interface AgentStep {
  id: string;
  agentId: string;
  timestamp: string;
  type: 'thought' | 'action' | 'command' | 'stdout' | 'spawn';
  content: string;
  tokenCount?: number;
}

export interface ExecutionOptions {
  workspacePath: string;
  systemPrompt?: string;
  onStdout: (data: string) => void;
  onStep: (step: Partial<AgentStep>) => void;
}

export class AgentExecutor {
  private readonly activeSubprocesses = new Map<string, ChildProcess>();
  private readonly activeAbortControllers = new Map<string, AbortController>();

  public async runClaudeCode(agentId: string, prompt: string, options: ExecutionOptions): Promise<void> {
    const args = ['-p', prompt, '--bare', '--permission-mode', 'bypassPermissions'];
    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }

    const processInstance = spawn('claude', args, {
      cwd: options.workspacePath,
      env: { ...process.env, FORCE_COLOR: '1' },
      shell: true
    });

    this.activeSubprocesses.set(agentId, processInstance);

    processInstance.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      options.onStdout(text);
      options.onStep({
        id: Math.random().toString(36).substring(7),
        agentId,
        timestamp: new Date().toISOString(),
        type: 'stdout',
        content: text
      });
    });

    processInstance.stderr.on('data', (chunk: Buffer) => {
      options.onStdout(chunk.toString());
    });

    return new Promise((resolve, reject) => {
      processInstance.on('close', (code) => {
        this.activeSubprocesses.delete(agentId);
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`Claude process exited with code ${code}`));
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
