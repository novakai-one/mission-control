// Design lens — Novakai Design prototypes rendered native, read-only slice.
// Data flows from DesignHub (/api/design/*); external commits (the bounded
// CLI, the html-builder app) arrive as 'design-event' ws frames relayed via
// a window event, and the lens refetches the accepted revision.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SceneHost } from './scene/index.js';
import './index.css';

/** DashboardShell relays backend design-event ws frames as this window event. */
export const DESIGN_CHANGED_EVENT = 'novakai:design-changed';

interface DesignProjectRef { id: string; name: string; }
interface DesignSceneRef { sceneId: string; rootId: string; }
interface DesignRender {
  projectId: string;
  name: string;
  revision: string;
  scenes: DesignSceneRef[];
  fragment: string;
  css: string;
  stale: boolean;
  error?: string;
}

function sceneLabel(sceneId: string): string {
  return sceneId
    .replace(/^scene-/, '')
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function fetchJson<T>(requestUrl: string): Promise<T | null> {
  try {
    const response = await fetch(requestUrl);
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

/** The Design studio lens. Always mounted (AgentsView pattern); hides via CSS. */
export function DesignView({ visible }: { visible: boolean }) {
  const [projects, setProjects] = useState<DesignProjectRef[]>([]);
  const [available, setAvailable] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [render, setRender] = useState<DesignRender | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const projectRef = useRef<string | null>(null);
  projectRef.current = projectId;

  const loadListing = useCallback(() => {
    void fetchJson<{ available: boolean; projects: DesignProjectRef[] }>('/api/design/projects')
      .then((listing) => {
        if (!listing) {
          setReachable(false);
          setLoading(false);
          return;
        }
        setReachable(true);
        setAvailable(listing.available);
        setProjects(listing.projects);
        setProjectId((current) => current ?? listing.projects[0]?.id ?? null);
        if (!listing.available || listing.projects.length === 0) setLoading(false);
      });
  }, []);

  useEffect(() => { loadListing(); }, [loadListing]);

  const load = useCallback((id: string) => {
    setLoading(true);
    void fetchJson<DesignRender>(`/api/design/projects/${id}`).then((next) => {
      if (projectRef.current !== id) return;
      setLoading(false);
      if (!next) {
        setReachable(false);
        return;
      }
      setReachable(true);
      setRender(next);
      setSceneId((current) =>
        current && next.scenes.some((scene) => scene.sceneId === current)
          ? current
          : next.scenes[0]?.sceneId ?? null);
    });
  }, []);

  useEffect(() => {
    if (projectId) load(projectId);
  }, [projectId, load]);

  // External commit -> refresh the listing (new projects appear) and refetch
  // the affected project (marker swap = accepted revision changed).
  useEffect(() => {
    const onCommit = (event: Event): void => {
      const changed = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      loadListing();
      if (changed && projectRef.current === changed) load(changed);
    };
    window.addEventListener(DESIGN_CHANGED_EVENT, onCommit);
    return () => window.removeEventListener(DESIGN_CHANGED_EVENT, onCommit);
  }, [load, loadListing]);

  const selectProject = useCallback((id: string) => {
    setRender(null);
    setSceneId(null);
    setProjectId(id);
  }, []);

  const retry = useCallback(() => {
    loadListing();
    if (projectRef.current) load(projectRef.current);
  }, [loadListing, load]);

  const activeRootId = render?.scenes.find((scene) => scene.sceneId === sceneId)?.rootId ?? null;

  return (
    <div
      className="design-view"
      // eslint-disable-next-line no-restricted-syntax -- visibility is runtime state (always-mounted lens)
      style={visible ? undefined : { display: 'none' }}
    >
      <div className="design-toolbar">
        <select
          aria-label="Prototype"
          className="design-project-select"
          value={projectId ?? ''}
          onChange={(change) => selectProject(change.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <nav className="design-scene-tabs">
          {render?.scenes.map((scene) => (
            <button
              className={scene.sceneId === sceneId ? 'is-active' : ''}
              key={scene.sceneId}
              onClick={() => setSceneId(scene.sceneId)}
              type="button"
            >{sceneLabel(scene.sceneId)}</button>
          ))}
        </nav>
        <span className="design-meta">
          {render?.stale ? `Stale — ${render.error ?? 'showing last good'}` : render ? `r${render.revision.slice(0, 7)}` : ''}
        </span>
      </div>
      {!reachable && (
        <p className="design-empty">
          Backend unreachable.
          <button className="design-retry" onClick={retry} type="button">Retry</button>
        </p>
      )}
      {reachable && !available && <p className="design-empty">Novakai Design checkout not found.</p>}
      {reachable && available && !render && (
        <p className="design-empty">{loading ? 'Loading prototype…' : 'No prototypes found.'}</p>
      )}
      {reachable && available && render && (
        <SceneHost fragment={render.fragment} css={render.css} activeRootId={activeRootId} />
      )}
    </div>
  );
}
