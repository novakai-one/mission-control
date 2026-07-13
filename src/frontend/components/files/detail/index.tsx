import type { MouseEvent } from 'react';
import type { FsEntry, RepoInfo } from '../index.js';
import './index.css';

interface DetailProps {
  selected: FsEntry | null;
  repoInfo: RepoInfo | null;
  repoLoading: boolean;
  isActive: boolean;
  canSetActive: boolean;
  settingActive: boolean;
  activeError: string | null;
  onSetActive: () => void;
  onOpenAgents: () => void;
  onDeselect: () => void;
}

interface Field {
  label: string;
  value: string;
  mono: boolean;
}

/** Field grid rows in design order; null-valued cells are dropped so the grid
 * reflows (docs/files-redesign.md §3 render contract). */
function buildFields(info: RepoInfo | null): Field[] {
  const rows: (Field | null)[] = [
    info?.branch ? { label: 'BRANCH', value: info.branch, mono: true } : null,
    info?.language ? { label: 'LANGUAGE', value: `${info.language.name} · ${info.language.pct}%`, mono: true } : null,
    info?.trackedFiles != null ? { label: 'FILES', value: `${info.trackedFiles} tracked`, mono: true } : null,
    info?.lastCommit ? { label: 'LAST COMMIT', value: info.lastCommit, mono: false } : null,
  ];
  return rows.filter((row): row is Field => row != null);
}

export function Detail(props: DetailProps) {
  const { selected, repoInfo } = props;
  if (!selected) {
    return (
      <div className="fd-detail fd-detail-empty">
        <div className="fd-empty-tile">◈</div>
        <span className="fd-empty-title">Select a repo to point your agents at</span>
        <span className="fd-empty-hint">Choose a folder from the tree to inspect it and set it active</span>
      </div>
    );
  }

  const name = repoInfo?.name ?? selected.name;
  const fields = buildFields(repoInfo);

  // Clicking the central workspace background (anywhere in the detail column
  // outside the card) deselects. The card itself — including its controls —
  // is preserved so interacting with the selection doesn't clear it.
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest('.fd-card')) props.onDeselect();
  };

  return (
    <div className="fd-detail" onClick={handleBackdropClick}>
      <div className="fd-card">
        {props.isActive && (
          <div className="fd-eyebrow fd-eyebrow-active">
            <span className="fd-eyebrow-dot">●</span>ACTIVE REPOSITORY
          </div>
        )}

        <div className="fd-hero">
          <h2 className="fd-title">{name}</h2>
          {repoInfo?.branch && <span className="fd-branch">⎇ {repoInfo.branch}</span>}
        </div>

        {repoInfo?.description && <p className="fd-desc">{repoInfo.description}</p>}

        {fields.length > 0 && (
          <>
            <hr className="fd-divider" />
            <div className="fd-grid">
              {fields.map((field) => (
                <div className="fd-field" key={field.label}>
                  <span className="fd-field-label">{field.label}</span>
                  <span className={field.mono ? 'fd-field-value fd-mono' : 'fd-field-value'}>{field.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="fd-action">
          {props.isActive ? (
            <button className="fd-cta" onClick={props.onOpenAgents}>Open Agents Tab →</button>
          ) : (
            <button
              className="fd-cta"
              onClick={props.onSetActive}
              disabled={!props.canSetActive || props.settingActive}
            >
              {props.settingActive ? 'Setting…' : '★ Set as Active Repo'}
            </button>
          )}
          {props.isActive && (
            <span className="fd-hint">{name} is now the active repo for all agents.</span>
          )}
          {props.activeError && <span className="fd-error">{props.activeError}</span>}
        </div>
      </div>
    </div>
  );
}
