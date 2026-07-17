import { readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isArchitectureDocument, isCanvasPreferences } from '../../../shared/canvas/validate/index.js';
import { defaultPreferences, emptyArchitecture } from '../../../shared/canvas/model/defaults.js';
import type { ArchitectureDocument, CanvasPreferences } from '../../../shared/canvas/model/types.js';

export const ARCHITECTURE_FILE = 'project-architecture.json';
export const PREFERENCES_FILE = 'canvas-preferences.json';

/** The Novakai-Canvas checkout stays the source of truth so its ./canvas CLI
 * keeps working unchanged; NVK_CANVAS_DATA rehomes the documents. */
export function canvasDataDir(): string {
  return process.env.NVK_CANVAS_DATA
    ?? join(homedir(), 'Programming', 'Novakai-Canvas', 'public', 'data');
}

export class StaleRevisionError extends Error {
  constructor(public readonly diskRevision: number) {
    super('stale revision');
  }
}

/** File-backed canvas documents with the same contract as the Canvas repo's
 * json-file-bridge: revision CAS on the architecture file, atomic writes,
 * write timestamps exposed so the watcher can suppress echoes. */
export class CanvasStore {
  private lastWriteMs = 0;

  constructor(private readonly dataDir = canvasDataDir()) {}

  directory(): string { return this.dataDir; }

  /** Milliseconds since this store last wrote a file (Infinity if never). */
  msSinceLastWrite(): number {
    return this.lastWriteMs === 0 ? Number.POSITIVE_INFINITY : Date.now() - this.lastWriteMs;
  }

  available(): boolean { return existsSync(join(this.dataDir, ARCHITECTURE_FILE)); }

  async loadArchitecture(): Promise<ArchitectureDocument> {
    const parsed = await this.read(ARCHITECTURE_FILE);
    return isArchitectureDocument(parsed) ? parsed : emptyArchitecture;
  }

  async loadPreferences(): Promise<CanvasPreferences> {
    const parsed = await this.read(PREFERENCES_FILE);
    return isCanvasPreferences(parsed) ? parsed : defaultPreferences;
  }

  /** Compare-and-swap save: an external writer (the canvas CLI) may have
   * advanced the file since this client loaded it; a stale PUT must not
   * clobber that. Throws StaleRevisionError when the disk copy is newer. */
  async saveArchitecture(document: ArchitectureDocument): Promise<void> {
    if (!isArchitectureDocument(document)) throw new Error('invalid architecture document');
    const disk = await this.read(ARCHITECTURE_FILE);
    if (isArchitectureDocument(disk) && document.revision <= disk.revision) {
      throw new StaleRevisionError(disk.revision);
    }
    await this.write(ARCHITECTURE_FILE, document);
  }

  async savePreferences(preferences: CanvasPreferences): Promise<void> {
    if (!isCanvasPreferences(preferences)) throw new Error('invalid canvas preferences');
    await this.write(PREFERENCES_FILE, preferences);
  }

  private async read(file: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(join(this.dataDir, file), 'utf8')) as unknown;
    } catch {
      return null;
    }
  }

  private async write(file: string, value: unknown): Promise<void> {
    const target = join(this.dataDir, file);
    const temporary = join(this.dataDir, `.${file}-${process.pid}.tmp`);
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
    this.lastWriteMs = Date.now();
  }
}
