import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File as FileIcon, ArrowUp, RefreshCw, Star, GitBranch } from 'lucide-react';
import { toDisplayPath } from '../index.js';
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

interface FilesPanelProps {
  homeDir: string | null;
  activeRepo: string | null;
  onActiveRepoChange: (path: string | null) => void;
}

const STORAGE_KEY = 'mc.files.root';
const DEFAULT_ROOT = '~/Programming';

async function fetchFs(path: string, showHidden: boolean): Promise<FsListing> {
  const res = await fetch(`/api/fs?path=${encodeURIComponent(path)}&showHidden=${showHidden}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function FilesPanel({ homeDir, activeRepo, onActiveRepoChange }: FilesPanelProps) {
  const [showHidden, setShowHidden] = useState(false);

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
  const [settingActive, setSettingActive] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);

  // Latest-request guard: rapid Enter/up/refresh must not let a slow earlier
  // response land last and clobber the newer root.
  const rootReqId = useRef(0);

  const loadRoot = (rawPath: string, opts?: { isUp?: boolean; showHiddenOverride?: boolean }) => {
    const sh = opts?.showHiddenOverride ?? showHidden;
    const reqId = ++rootReqId.current;
    fetchFs(rawPath, sh)
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
      .catch((e) => {
        if (reqId !== rootReqId.current) return;
        setRootError(e.message);
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

  // Resolve the git root for the current selection. Clear the previous
  // value first so a stale gitRoot can't be POSTed for the new selection
  // while resolve-root is still in flight.
  useEffect(() => {
    setGitRoot(null);
    if (!selected) return;
    let cancelled = false;
    fetch(`/api/fs/resolve-root?path=${encodeURIComponent(selected.path)}`)
      .then((res) => res.json())
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
        .catch((e) => {
          setExpandErrors((prev) => new Map(prev).set(entry.path, e.message));
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
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        onActiveRepoChange(data.activeRepo ?? null);
      })
      .catch((e) => setActiveError(e.message))
      .finally(() => setSettingActive(false));
  };

  // At $HOME the parent (/Users) is outside the sandbox — disable up-front
  // instead of letting the click surface a bogus 403.
  const upBtnDisabled = !rootParent || rootParent === rootAbs || upDisabled
    || (homeDir != null && rootAbs === homeDir);

  return (
    <div className="files-panel">
      {/* Left panel */}
      <div className="files-sidebar">
        {/* Path bar */}
        <div className="files-pathbar">
          <input
            type="text"
            value={pathBarValue}
            onChange={(e) => setPathBarValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePathBarSubmit(); }}
            className="u-input files-input"
            placeholder="~/path/to/dir"
          />
          {rootError && (
            <div className="files-error files-pathbar-error">
              {rootError}
            </div>
          )}
        </div>

        {/* Buttons row */}
        <div className="files-toolbar">
          <button onClick={handleUp} disabled={upBtnDisabled} className="u-btn files-btn" title="Up">
            <ArrowUp size={12} />
          </button>
          <button onClick={handleRefresh} className="u-btn files-btn" title="Refresh">
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Tree */}
        <div className="files-tree">
          {rootAbs && (cache.get(rootAbs) || []).map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              cache={cache}
              expanded={expanded}
              expandErrors={expandErrors}
              loadingPaths={loadingPaths}
              selectedPath={selected?.path ?? null}
              onToggle={toggleExpand}
              onSelect={setSelected}
            />
          ))}
        </div>

        {/* Sticky footer */}
        <div className="files-footer">
          <span className="files-footer-path u-truncate">
            selected: {selected ? toDisplayPath(selected.path, homeDir) : '—'}
          </span>
          <span className="files-git-status">
            <GitBranch size={10} />
            {selected ? (gitRoot ? `repo: ${toDisplayPath(gitRoot, homeDir)}` : 'no git root') : 'no selection'}
          </span>
          <button
            onClick={handleSetActive}
            disabled={!canSetActive || settingActive}
            className="u-btn files-btn files-btn-wide"
          >
            <Star size={12} /> Set as Active Repo
          </button>
          {activeError && (
            <div className="files-error">
              {activeError}
            </div>
          )}
        </div>

        {/* Show hidden */}
        <label className="files-hidden-toggle">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => handleShowHiddenToggle(e.target.checked)}
          />
          show hidden
        </label>
      </div>

      {/* Primary area */}
      <div className="files-primary">
        <span className="files-primary-label">
          {selected ? toDisplayPath(selected.path, homeDir) : 'select a file or folder'}
        </span>
        <span className="files-primary-hint">primary view TBD</span>
      </div>
    </div>
  );
}

interface TreeNodeProps {
  entry: FsEntry;
  cache: Map<string, FsEntry[]>;
  expanded: Set<string>;
  expandErrors: Map<string, string>;
  loadingPaths: Set<string>;
  selectedPath: string | null;
  onToggle: (entry: FsEntry) => void;
  onSelect: (entry: FsEntry) => void;
}

function TreeNode({ entry, cache, expanded, expandErrors, loadingPaths, selectedPath, onToggle, onSelect }: TreeNodeProps) {
  const isDir = entry.type === 'dir';
  const isExpanded = expanded.has(entry.path);
  const isSelected = selectedPath === entry.path;
  const children = cache.get(entry.path);
  const error = expandErrors.get(entry.path);
  const loading = loadingPaths.has(entry.path);

  return (
    <div>
      <div className={`files-tree-row${isSelected ? ' files-tree-row-selected' : ''}`}>
        {isDir ? (
          <span className="files-chevron" onClick={() => onToggle(entry)}>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="files-tree-spacer" />
        )}
        {isDir ? <Folder size={13} color="var(--kind-tool)" /> : <FileIcon size={13} color="var(--text-secondary)" />}
        <span className="files-name" onClick={() => onSelect(entry)}>{entry.name}</span>
      </div>
      {isDir && isExpanded && (
        <div className="files-tree-children">
          {error ? (
            <div className="files-tree-note files-tree-note-error">{error}</div>
          ) : loading ? (
            <div className="files-tree-note files-tree-note-loading">loading…</div>
          ) : (
            (children || []).map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                cache={cache}
                expanded={expanded}
                expandErrors={expandErrors}
                loadingPaths={loadingPaths}
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
