// Ring buffer of raw pty output chunks, capped at 2MiB total. Used for
// agent-replay: a reconnecting client gets the full snapshot rewritten,
// so no per-chunk history is needed beyond what fits in the cap.
const MAX_BYTES = 2 * 1024 * 1024;

export class AgentBuffer {
  private chunks: string[] = [];
  private totalLength = 0;

  push(data: string): void {
    this.chunks.push(data);
    this.totalLength += data.length;
    this.trim();
  }

  snapshot(): string {
    return this.chunks.join('');
  }

  private trim(): void {
    while (this.totalLength > MAX_BYTES && this.chunks.length > 0) {
      const dropped = this.chunks.shift() as string;
      this.totalLength -= dropped.length;
    }
  }
}
