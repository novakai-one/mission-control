import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The html-builder checkout stays the source of truth — its data AND its
 * pure core/ projection modules are versioned together, so we import the
 * projection from the same root we read documents from. NVK_DESIGN_ROOT
 * rehomes both. This adapter is the single boundary that owns the
 * html-builder schema, sanitization, and revision identity; slice 1 is
 * strictly read-only — prototype.json and every source file are immutable. */
export function designRoot(): string {
  return process.env.NVK_DESIGN_ROOT ?? join(homedir(), 'Programming', 'html-builder');
}

export interface DesignProjectRef {
  id: string;
  name: string;
}

export interface DesignSceneRef {
  sceneId: string;
  rootId: string;
}

/** One rendered prototype: the accepted revision only. When a read races a
 * writer or the sources are invalid, the previous good render is served with
 * stale=true and the reason — never a broken frame, never a partial state. */
export interface DesignRender {
  projectId: string;
  name: string;
  revision: string;
  scenes: DesignSceneRef[];
  fragment: string;
  css: string;
  stale: boolean;
  error?: string;
}

interface ManifestSceneSource extends DesignSceneRef { file: string; }
interface PrototypeManifest {
  formatVersion: number;
  document: Record<string, unknown>;
  sources: {
    scenes: ManifestSceneSource[];
    classes: { classId: string; file: string }[];
  };
}

interface ProjectionModules {
  composePrototypeSource(input: {
    manifest: PrototypeManifest;
    scenes: Record<string, unknown>;
    classes: Record<string, unknown>;
  }): { document: unknown };
  renderHTMLFragment(document: unknown): string;
  renderDocumentCSS(document: unknown): string;
}

/** Defence-in-depth for the shadow-DOM native render: the fragment comes from
 * the bounded CLI's validated sources, but nothing executable or frame-like
 * may cross the adapter boundary regardless. */
export function sanitizeFragment(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<\/?(?:script|iframe|object|embed|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\b(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[^"'>]*\2/gi, '$1=$2#$2');
}

function humanize(directoryName: string): string {
  return directoryName
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function isFormatV2Manifest(value: unknown): value is PrototypeManifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Record<string, unknown>;
  const sources = manifest.sources as Record<string, unknown> | undefined;
  return manifest.formatVersion === 2
    && typeof manifest.document === 'object' && manifest.document !== null
    && Array.isArray(sources?.scenes) && Array.isArray(sources?.classes);
}

/** Sources are content-addressed: exactly `<family>/<sha256>.json`. Anything
 * else — absolute paths, dot segments, foreign prefixes — is rejected BEFORE
 * any filesystem read; the manifest is untrusted input until proven shaped. */
const SOURCE_FILE_PATTERN: Record<'scenes' | 'classes', RegExp> = {
  scenes: /^scenes\/[0-9a-f]{64}\.json$/,
  classes: /^classes\/[0-9a-f]{64}\.json$/,
};

/** Persisted IDs are CLI-allocated slugs; anything else could smuggle markup
 * or selector syntax into a consumer, so reject at the boundary. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function assertFamilyPaths(family: 'scenes' | 'classes', references: { file: string }[]): void {
  const seen = new Set<string>();
  for (const reference of references) {
    if (typeof reference.file !== 'string' || !SOURCE_FILE_PATTERN[family].test(reference.file)) {
      throw new Error(`manifest ${family} entry has an invalid source path: ${JSON.stringify(reference.file)}`);
    }
    if (seen.has(reference.file)) throw new Error(`manifest ${family} entry duplicates source path: ${reference.file}`);
    seen.add(reference.file);
  }
}

function assertSceneIds(scenes: ManifestSceneSource[]): void {
  for (const scene of scenes) {
    if (typeof scene.sceneId !== 'string' || !SAFE_ID.test(scene.sceneId)
      || typeof scene.rootId !== 'string' || !SAFE_ID.test(scene.rootId)) {
      throw new Error(`manifest scene entry has an invalid id: ${JSON.stringify({ sceneId: scene.sceneId, rootId: scene.rootId })}`);
    }
  }
}

function assertSourcePaths(manifest: PrototypeManifest): void {
  assertFamilyPaths('scenes', manifest.sources.scenes);
  assertFamilyPaths('classes', manifest.sources.classes);
  assertSceneIds(manifest.sources.scenes);
}

export class DesignAdapter {
  private readonly lastGood = new Map<string, DesignRender>();
  private modules: Promise<ProjectionModules> | null = null;

  constructor(private readonly root = designRoot()) {}

  available(): boolean { return existsSync(this.root); }

  /** Directories whose prototype.json swaps signal a commit — watch these. */
  watchRoots(): string[] {
    return [join(this.root, 'workspace'), join(this.root, 'projects')].filter((directory) => existsSync(directory));
  }

  /** Discovery mirrors html-builder's ProjectManager: the live workspace plus
   * every projects/ subdirectory holding a format-v2 prototype.json. */
  async listProjects(): Promise<DesignProjectRef[]> {
    const found: DesignProjectRef[] = [];
    for (const candidate of await this.candidateDirs()) {
      const manifest = await readJson(join(candidate.directory, 'prototype.json'));
      if (!isFormatV2Manifest(manifest)) continue;
      const meta = await readJson(join(candidate.directory, 'project.json')) as { name?: string } | null;
      found.push({ id: candidate.id, name: meta?.name ?? humanize(candidate.id) });
    }
    return found;
  }

  /** Renders the accepted revision of one project; serves the last good
   * render (stale=true) when the current read fails mid-write or invalid. */
  async renderProject(projectId: string): Promise<DesignRender | null> {
    const directory = await this.projectDir(projectId);
    if (!directory) return null;
    try {
      const render = await this.renderAccepted(projectId, directory);
      this.lastGood.set(projectId, render);
      return render;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unreadable prototype';
      const cached = this.lastGood.get(projectId);
      if (cached) return { ...cached, stale: true, error: message };
      return {
        projectId, name: humanize(projectId), revision: '', scenes: [],
        fragment: '', 'css': '', stale: true, error: message,
      };
    }
  }

  private async readSources(directory: string, manifest: PrototypeManifest): Promise<{ scenes: Record<string, unknown>; classes: Record<string, unknown> }> {
    const scenes: Record<string, unknown> = {};
    for (const reference of manifest.sources.scenes) {
      scenes[reference.file] = JSON.parse(await readFile(join(directory, reference.file), 'utf8')) as unknown;
    }
    const classes: Record<string, unknown> = {};
    for (const reference of manifest.sources.classes) {
      classes[reference.classId] = JSON.parse(await readFile(join(directory, reference.file), 'utf8')) as unknown;
    }
    return { scenes, classes };
  }

  private async renderAccepted(projectId: string, directory: string): Promise<DesignRender> {
    const markerText = await readFile(join(directory, 'prototype.json'), 'utf8');
    const manifest: unknown = JSON.parse(markerText);
    if (!isFormatV2Manifest(manifest)) throw new Error('prototype.json is not a format-v2 manifest');
    assertSourcePaths(manifest);
    const { scenes, classes } = await this.readSources(directory, manifest);
    const projection = await this.loadModules();
    const { document } = projection.composePrototypeSource({ manifest, scenes, classes });
    const meta = await readJson(join(directory, 'project.json')) as { name?: string } | null;
    return {
      projectId,
      name: meta?.name ?? humanize(projectId),
      revision: createHash('sha256').update(markerText).digest('hex').slice(0, 12),
      scenes: manifest.sources.scenes.map(({ sceneId, rootId }) => ({ sceneId, rootId })),
      fragment: sanitizeFragment(projection.renderHTMLFragment(document)),
      'css': projection.renderDocumentCSS(document),
      stale: false,
    };
  }

  private loadModules(): Promise<ProjectionModules> {
    this.modules ??= (async () => {
      const compose = await import(pathToFileURL(join(this.root, 'core/prototype/source-model.js')).href) as Pick<ProjectionModules, 'composePrototypeSource'>;
      const html = await import(pathToFileURL(join(this.root, 'core/projection/html.js')).href) as Pick<ProjectionModules, 'renderHTMLFragment'>;
      const cssModule = await import(pathToFileURL(join(this.root, 'core/projection/style/css.js')).href) as Pick<ProjectionModules, 'renderDocumentCSS'>;
      return {
        composePrototypeSource: compose.composePrototypeSource,
        renderHTMLFragment: html.renderHTMLFragment,
        renderDocumentCSS: cssModule.renderDocumentCSS,
      };
    })();
    return this.modules;
  }

  private async candidateDirs(): Promise<{ id: string; directory: string }[]> {
    const candidates: { id: string; directory: string }[] = [];
    const workspace = join(this.root, 'workspace');
    if (existsSync(join(workspace, 'prototype.json'))) candidates.push({ id: 'workspace', directory: workspace });
    const projectsDir = join(this.root, 'projects');
    if (existsSync(projectsDir)) {
      for (const entry of await readdir(projectsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) candidates.push({ id: entry.name, directory: join(projectsDir, entry.name) });
      }
    }
    return candidates;
  }

  private async projectDir(projectId: string): Promise<string | null> {
    if (!/^[A-Za-z0-9._-]+$/.test(projectId) || projectId.startsWith('.')) return null;
    const directory = projectId === 'workspace' ? join(this.root, 'workspace') : join(this.root, 'projects', projectId);
    return existsSync(join(directory, 'prototype.json')) ? directory : null;
  }
}
