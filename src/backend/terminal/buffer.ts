// Ring buffer of raw pty output chunks, capped at 512KiB total. Used for
// agent-replay: a reconnecting client gets the full snapshot rewritten,
// so no per-chunk history is needed beyond what fits in the cap.
const MAX_BYTES = 512 * 1024;

export class AgentBuffer {
  private chunks: Array<{ data: string; bytes: number }> = [];
  private totalBytes = 0;

  push(data: string): void {
    const bytes = Buffer.byteLength(data);
    if (bytes > MAX_BYTES) {
      const tail = utf8Tail(data, MAX_BYTES);
      this.chunks = [{ data: tail, bytes: Buffer.byteLength(tail) }];
      this.totalBytes = this.chunks[0].bytes;
      return;
    }
    this.chunks.push({ data, bytes });
    this.totalBytes += bytes;
    this.trim();
  }

  snapshot(): string {
    return this.chunks.map((chunk) => chunk.data).join('');
  }

  private trim(): void {
    while (this.totalBytes > MAX_BYTES && this.chunks.length > 0) {
      const oldest = this.chunks[0];
      const excess = this.totalBytes - MAX_BYTES;
      if (oldest.bytes <= excess) {
        this.chunks.shift();
        this.totalBytes -= oldest.bytes;
        continue;
      }
      const tail = utf8Tail(oldest.data, oldest.bytes - excess);
      const tailBytes = Buffer.byteLength(tail);
      this.chunks[0] = { data: tail, bytes: tailBytes };
      this.totalBytes += tailBytes - oldest.bytes;
    }
  }
}

function utf8Tail(data: string, maxBytes: number): string {
  const encoded = Buffer.from(data);
  let start = encoded.length - maxBytes;
  while (start < encoded.length && (encoded[start] & 0xc0) === 0x80) start++;
  return encoded.subarray(start).toString('utf8');
}
