import { useEffect, useRef, useState } from 'react';
import { toDisplayPath } from '../index.js';
import { Drawer } from '../ui/index.js';
import { Rail } from './tree/index.js';
import { Detail } from './detail/index.js';
import './index.css';

export interface FsEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
}

interface FsListing {
  path: string;
  parent: string;
  entries: FsEntry[];
}

/** Repo metadata for the detail card. Mirrors the backend `GET /api/repo-info`
 * shape (see docs/files-redesign.md §3); intentionally NOT imported from the
 * backend so the frontend stays decoupled. */
export interface RepoInfo {
  name: string;
  path: string;
  gitRoot: string | null;
  isGitRepo: boolean;
  branch: string | null;
  dirty: boolean | null;
  lastCommit: string | null;
  trackedFiles: number | null;
  language: { name: string; pct: number } | null;
  description: string | null;
}

interface FilesPanelProps {
  homeDir: string | null;
  activeRepo: string | null;
  onActiveRepoChange: (path: string | null) => void;
  onOpenAgents: () => void;
}

/** The settled selection the detail card renders from. The entry and its repo
 * info are committed together — only once the info fetch lands — so the card
 * swaps exactly once per click instead of tearing (new title over old fields). */
export interface DisplayedEntry {
  entry: FsEntry;
  info: RepoInfo | null;
}

const STORAGE_KEY = 'mc.files.root';
const RAIL_STORAGE_KEY = 'mc.files.railOpen';
const DEFAULT_ROOT = '~/Programming';

async function fetchFs(path: string, showHidden: boolean): Promise<FsListing> {
  const res = await fetch(`/api/fs?path=${encodeURIComponent(path)}&showHidden=${showHidden}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function FilesPanel({ homeDir, activeRepo, onActiveRepoChange, onOpenAgents }: FilesPanelProps) {
  const [showHidden, setShowHidden] = useState(false);
  const [railOpen, setRailOpen] = useState(() => localStorage.getItem(RAIL_STORAGE_KEY) !== 'false');

  const toggleRail = () => {
    setRailOpen((prev) => {
      localStorage.setItem(RAIL_STORAGE_KEY, String(!prev));
      return !prev;
    });
  };

  const [rootAbs, setRootAbs] = useState<string | null>(null);
  const [rootParent, setRootParent] = useState<string | null>(null);
  const [pathBarValue, setPathBarValue] = useState('');
  const [rootError, setRootError] = useState<string | null>(null);
  const [upDisabled, setUpDisabled] = useState(false);

  const [cache, setCache] = useState<Map<string, FsEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandErrors, setExpandErrors] = useState<Map<string, string>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  const [selected, setSelected] = useState<FsEntry | null>(null);
  const [gitRoot, setGitRoot] = useState<string | null>(null);
  const [displayed, setDisplayed] = useState<DisplayedEntry | null>(null);
  const [repoLoading, setRepoLoading] = useState(false);
  const [settingActive, setSettingActive] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);

  // Latest-request guard: rapid Enter/up/refresh must not let a slow earlier
  // response land last and clobber the newer root.
  const rootReqId = useRef(0);

  const loadRoot = (rawPath: string, opts?: { isUp?: boolean; showHiddenOverride?: boolean }) => {
    const showHiddenNow = opts?.showHiddenOverride ?? showHidden;
    const reqId = ++rootReqId.current;
    fetchFs(rawPath, showHiddenNow)
      .then((data) => {
        if (reqId !== rootReqId.current) return;
        setRootAbs(data.path);
        setRootParent(data.parent);
        setRootError(null);
        setUpDisabled(false);
        setCache(new Map([[data.path, data.entries]]));
        setExpanded(new Set());
        setExpandErrors(new Map());
        localStorage.setItem(STORAGE_KEY, data.path);
      })
      .catch((caught) => {
        if (reqId !== rootReqId.current) return;
        setRootError(caught.message);
        if (opts?.isUp) setUpDisabled(true);
      });
  };

  // Initial load: last browsed root, else default.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    loadRoot(saved || DEFAULT_ROOT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the path bar to the canonical '~'-relative display whenever the
  // resolved root (or home dir, once known) changes. Left untouched on a
  // failed navigation so the user's typed text stays editable.
  useEffect(() => {
    if (rootAbs) setPathBarValue(toDisplayPath(rootAbs, homeDir));
  }, [rootAbs, homeDir]);

  // Escape deselects the current entry. Only bound while something is selected
  // so we don't hold a global listener for the common no-selection case.
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  // Resolve the git root for the current selection. Clear the previous value
  // first so a stale gitRoot can't be POSTed for the new selection while
  // resolve-root is still in flight.
  useEffect(() => {
    setGitRoot(null);
    if (!selected) return;
    let cancelled = false;
    fetch(`/api/fs/resolve-root?path=${encodeURIComponent(selected.path)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setGitRoot(data.gitRoot ?? null);
      })
      .catch(() => {
        if (!cancelled) setGitRoot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Fetch repo metadata for the selected entry, cancelling on change so a slow
  // earlier response can't paint under a newer selection. The displayed card is
  // deliberately NOT touched until the payload lands — the old card stays up
  // (dimmed via repoLoading), then entry+info commit together, so each click
  // produces exactly one content swap instead of a title/fields tear.
  useEffect(() => {
    if (!selected) {
      setDisplayed(null);
      return;
    }
    let cancelled = false;
    setRepoLoading(true);
    fetch(`/api/repo-info?path=${encodeURIComponent(selected.path)}`)
      .then((response) => response.json())
      .then((data: RepoInfo) => {
        if (!cancelled) setDisplayed({ entry: selected, info: data });
      })
      .catch(() => {
        if (!cancelled) setDisplayed({ entry: selected, info: null });
      })
      .finally(() => {
        if (!cancelled) setRepoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handlePathBarSubmit = () => {
    const trimmed = pathBarValue.trim();
    if (trimmed) loadRoot(trimmed);
  };

  const handleUp = () => {
    if (upBtnDisabled || !rootParent) return;
    loadRoot(rootParent, { isUp: true });
  };

  const handleRefresh = () => {
    if (rootAbs) loadRoot(rootAbs);
  };

  const handleShowHiddenToggle = (next: boolean) => {
    setShowHidden(next);
    if (rootAbs) loadRoot(rootAbs, { showHiddenOverride: next });
  };

  const toggleExpand = (entry: FsEntry) => {
    if (entry.type !== 'dir') return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
    if (!cache.has(entry.path) && !loadingPaths.has(entry.path)) {
      setLoadingPaths((prev) => new Set(prev).add(entry.path));
      fetchFs(entry.path, showHidden)
        .then((data) => {
          setCache((prev) => new Map(prev).set(entry.path, data.entries));
          setExpandErrors((prev) => {
            const next = new Map(prev);
            next.delete(entry.path);
            return next;
          });
        })
        .catch((caught) => {
          setExpandErrors((prev) => new Map(prev).set(entry.path, caught.message));
        })
        .finally(() => {
          setLoadingPaths((prev) => {
            const next = new Set(prev);
            next.delete(entry.path);
            return next;
          });
        });
    }
  };

  const canSetActive = gitRoot != null || selected?.type === 'dir';
  const activeTarget = gitRoot ?? selected?.path ?? null;
  const isActive = activeRepo != null && activeTarget === activeRepo;

  const handleSetActive = () => {
    if (!canSetActive) return;
    const target = gitRoot ?? selected!.path;
    setSettingActive(true);
    setActiveError(null);
    fetch('/api/active-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
        onActiveRepoChange(data.activeRepo ?? null);
      })
      .catch((caught) => setActiveError(caught.message))
      .finally(() => setSettingActive(false));
  };

  // At $HOME the parent (/Users) is outside the sandbox — disable up-front
  // instead of letting the click surface a bogus 403.
  const upBtnDisabled = !rootParent || rootParent === rootAbs || upDisabled
    || (homeDir != null && rootAbs === homeDir);

  return (
    // display:contents wrapper — the rail and detail become siblings in the
    // shell content row, so they float as separate cards with the shell gap.
    <div className="fd-panel">
      <Drawer open={railOpen} widthClass="fd-drawer" onOpen={toggleRail} label="Open file tree">
        <Rail
          onCollapse={toggleRail}
          pathBarValue={pathBarValue}
          onPathChange={setPathBarValue}
          onPathSubmit={handlePathBarSubmit}
          onUp={handleUp}
          upDisabled={upBtnDisabled}
          onRefresh={handleRefresh}
          rootError={rootError}
          entries={rootAbs ? cache.get(rootAbs) ?? [] : []}
          cache={cache}
          expanded={expanded}
          expandErrors={expandErrors}
          loadingPaths={loadingPaths}
          selectedPath={selected?.path ?? null}
          activeRepo={activeRepo}
          onToggle={toggleExpand}
          onSelect={setSelected}
          showHidden={showHidden}
          onShowHiddenToggle={handleShowHiddenToggle}
        />
      </Drawer>
      <Detail
        displayed={displayed}
        repoLoading={repoLoading}
        isActive={isActive}
        canSetActive={canSetActive}
        settingActive={settingActive}
        activeError={activeError}
        onSetActive={handleSetActive}
        onOpenAgents={onOpenAgents}
        onDeselect={() => setSelected(null)}
      />
    </div>
  );
}
