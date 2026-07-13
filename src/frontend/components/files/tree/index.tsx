import { PanelGlyph } from '../../ui/index.js';
import type { FsEntry } from '../index.js';
import './index.css';

interface RailProps {
  onCollapse: () => void;
  pathBarValue: string;
  onPathChange: (value: string) => void;
  onPathSubmit: () => void;
  onUp: () => void;
  upDisabled: boolean;
  onRefresh: () => void;
  rootError: string | null;
  entries: FsEntry[];
  cache: Map<string, FsEntry[]>;
  expanded: Set<string>;
  expandErrors: Map<string, string>;
  loadingPaths: Set<string>;
  selectedPath: string | null;
  activeRepo: string | null;
  onToggle: (entry: FsEntry) => void;
  onSelect: (entry: FsEntry) => void;
  showHidden: boolean;
  onShowHiddenToggle: (next: boolean) => void;
}

export function Rail(props: RailProps) {
  const hasSelection = props.selectedPath != null;
  return (
    <div className="fd-rail">
      <div className="fd-rail-top">
        <button type="button" className="shell-panel-toggle" onClick={props.onCollapse} aria-label="Collapse file tree" title="Collapse file tree">
          <PanelGlyph open />
        </button>
      </div>
      <div className="fd-pathbar">
        <input
          type="text"
          value={props.pathBarValue}
          onChange={(event) => props.onPathChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') props.onPathSubmit(); }}
          className="fd-pathinput"
          placeholder="~/path/to/dir"
        />
        <button className="fd-pathbtn" onClick={props.onUp} disabled={props.upDisabled} title="Up">↑</button>
        <button className="fd-pathbtn" onClick={props.onRefresh} title="Refresh">↻</button>
      </div>
      {props.rootError && <div className="fd-error">{props.rootError}</div>}

      <div className="fd-tree" data-has-selection={hasSelection || undefined}>
        {props.entries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            cache={props.cache}
            expanded={props.expanded}
            expandErrors={props.expandErrors}
            loadingPaths={props.loadingPaths}
            selectedPath={props.selectedPath}
            activeRepo={props.activeRepo}
            onToggle={props.onToggle}
            onSelect={props.onSelect}
          />
        ))}
      </div>

      {props.activeRepo && (
        <div className="fd-legend">
          <span className="fd-legend-dot">●</span>
          <span className="fd-legend-label">active repo</span>
        </div>
      )}

      <label className="fd-hidden">
        <input
          type="checkbox"
          checked={props.showHidden}
          onChange={(event) => props.onShowHiddenToggle(event.target.checked)}
        />
        show hidden
      </label>
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
  activeRepo: string | null;
  onToggle: (entry: FsEntry) => void;
  onSelect: (entry: FsEntry) => void;
}

function TreeNode(props: TreeNodeProps) {
  const { entry } = props;
  const isDir = entry.type === 'dir';
  const isExpanded = props.expanded.has(entry.path);
  const isSelected = props.selectedPath === entry.path;
  const isActive = props.activeRepo === entry.path;
  const children = props.cache.get(entry.path);
  const error = props.expandErrors.get(entry.path);
  const loading = props.loadingPaths.has(entry.path);

  const rowClass = ['fd-row'];
  if (isSelected) rowClass.push('fd-row-selected');
  if (isActive) rowClass.push('fd-row-active');

  return (
    <div>
      <div className={rowClass.join(' ')}>
        <span className="fd-glyph" onClick={() => props.onToggle(entry)}>
          {isDir ? (isExpanded ? '⌄' : '›') : '·'}
        </span>
        <span className="fd-name u-truncate" onClick={() => props.onSelect(entry)}>{entry.name}</span>
        {isActive && <span className="fd-row-dot">●</span>}
      </div>
      {isDir && isExpanded && (
        <div className="fd-children">
          {error ? (
            <div className="fd-note fd-note-error">{error}</div>
          ) : loading ? (
            <div className="fd-note">loading…</div>
          ) : (
            (children ?? []).map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                cache={props.cache}
                expanded={props.expanded}
                expandErrors={props.expandErrors}
                loadingPaths={props.loadingPaths}
                selectedPath={props.selectedPath}
                activeRepo={props.activeRepo}
                onToggle={props.onToggle}
                onSelect={props.onSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
