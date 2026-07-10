import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File as FileIcon, ArrowUp, RefreshCw, Star, GitBranch } from 'lucide-react';
import { toDisplayPath } from '../index.js';

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
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{
        display: 'flex', flexDirection: 'column', width: '320px', flexShrink: 0,
        borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)',
        overflow: 'hidden',
      }}>
        {/* Path bar */}
        <div style={{ padding: '0.7rem 0.7rem 0.4rem' }}>
          <input
            type="text"
            value={pathBarValue}
            onChange={(e) => setPathBarValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePathBarSubmit(); }}
            style={inputStyle}
            placeholder="~/path/to/dir"
          />
          {rootError && (
            <div style={{ fontSize: '0.6rem', color: '#c97a7a', marginTop: '0.3rem' }}>
              {rootError}
            </div>
          )}
        </div>

        {/* Buttons row */}
        <div style={{ display: 'flex', gap: '0.4rem', padding: '0 0.7rem 0.6rem' }}>
          <button onClick={handleUp} disabled={upBtnDisabled} style={{ ...btnStyle, opacity: upBtnDisabled ? 0.4 : 1, cursor: upBtnDisabled ? 'not-allowed' : 'pointer' }} title="Up">
            <ArrowUp size={12} />
          </button>
          <button onClick={handleRefresh} style={btnStyle} title="Refresh">
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.5rem' }}>
          {rootAbs && (cache.get(rootAbs) || []).map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
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
        <div style={{
          position: 'sticky', bottom: 0, borderTop: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-secondary)', padding: '0.6rem 0.7rem',
          display: 'flex', flexDirection: 'column', gap: '0.35rem',
        }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            selected: {selected ? toDisplayPath(selected.path, homeDir) : '—'}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
            <GitBranch size={10} />
            {selected ? (gitRoot ? `repo: ${toDisplayPath(gitRoot, homeDir)}` : 'no git root') : 'no selection'}
          </span>
          <button
            onClick={handleSetActive}
            disabled={!canSetActive || settingActive}
            style={{
              ...btnStyle, justifyContent: 'center', gap: '0.35rem', padding: '0.4rem 0.6rem',
              opacity: !canSetActive || settingActive ? 0.4 : 1,
              cursor: !canSetActive || settingActive ? 'not-allowed' : 'pointer',
            }}
          >
            <Star size={12} /> Set as Active Repo
          </button>
          {activeError && (
            <div style={{ fontSize: '0.6rem', color: '#c97a7a' }}>
              {activeError}
            </div>
          )}
        </div>

        {/* Show hidden */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.7rem',
          fontSize: '0.6rem', color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => handleShowHiddenToggle(e.target.checked)}
          />
          show hidden
        </label>
      </div>

      {/* Primary area */}
      <div style={{
        display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '0.5rem', backgroundColor: 'var(--bg-primary)',
      }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
          {selected ? toDisplayPath(selected.path, homeDir) : 'select a file or folder'}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>primary view TBD</span>
      </div>
    </div>
  );
}

interface TreeNodeProps {
  entry: FsEntry;
  depth: number;
  cache: Map<string, FsEntry[]>;
  expanded: Set<string>;
  expandErrors: Map<string, string>;
  loadingPaths: Set<string>;
  selectedPath: string | null;
  onToggle: (entry: FsEntry) => void;
  onSelect: (entry: FsEntry) => void;
}

function TreeNode({ entry, depth, cache, expanded, expandErrors, loadingPaths, selectedPath, onToggle, onSelect }: TreeNodeProps) {
  const isDir = entry.type === 'dir';
  const isExpanded = expanded.has(entry.path);
  const isSelected = selectedPath === entry.path;
  const children = cache.get(entry.path);
  const error = expandErrors.get(entry.path);
  const loading = loadingPaths.has(entry.path);

  return (
    <div>
      <div
        className={`files-tree-row${isSelected ? ' files-tree-row-selected' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {isDir ? (
          <span className="files-chevron" onClick={() => onToggle(entry)}>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span style={{ width: '14px', flexShrink: 0 }} />
        )}
        {isDir ? <Folder size={13} color="#c9b57a" /> : <FileIcon size={13} color="var(--text-secondary)" />}
        <span className="files-name" onClick={() => onSelect(entry)}>{entry.name}</span>
      </div>
      {isDir && isExpanded && (
        <div>
          {error ? (
            <div style={{ paddingLeft: `${(depth + 1) * 14 + 4}px`, fontSize: '0.6rem', color: '#c97a7a' }}>{error}</div>
          ) : loading ? (
            <div style={{ paddingLeft: `${(depth + 1) * 14 + 4}px`, fontSize: '0.6rem', color: 'var(--text-muted)' }}>loading…</div>
          ) : (
            (children || []).map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
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

const inputStyle: React.CSSProperties = {
  width: '100%', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
  border: '1px solid var(--border-color)', borderRadius: '6px',
  padding: '0.4rem 0.6rem', fontSize: '0.68rem', outline: 'none',
};

const btnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
  borderRadius: '6px', fontSize: '0.68rem', padding: '0.35rem 0.5rem', cursor: 'pointer',
};
