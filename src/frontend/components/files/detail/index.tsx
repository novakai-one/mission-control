import { toDisplayPath } from '../../index.js';
import type { FsEntry, RepoInfo } from '../index.js';
import './index.css';

interface DetailProps {
  selected: FsEntry | null;
  homeDir: string | null;
  repoInfo: RepoInfo | null;
  repoLoading: boolean;
  isActive: boolean;
  canSetActive: boolean;
  settingActive: boolean;
  activeError: string | null;
  onSetActive: () => void;
  onOpenAgents: () => void;
}

interface Field {
  label: string;
  value: string;
  mono: boolean;
}

function gitLine(info: RepoInfo): string {
  if (!info.isGitRepo) return 'not a git repository';
  if (info.dirty == null) return 'git repository';
  return `git repository · ${info.dirty ? 'dirty' : 'clean'}`;
}

/** Field grid rows in design order; null-valued cells are dropped so the grid
 * reflows (docs/files-redesign.md §3 render contract). */
function buildFields(info: RepoInfo | null, pathDisplay: string): Field[] {
  const rows: (Field | null)[] = [
    { label: 'PATH', value: pathDisplay, mono: true },
    info ? { label: 'GIT', value: gitLine(info), mono: false } : null,
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
  const pathDisplay = toDisplayPath(repoInfo?.path ?? selected.path, props.homeDir);
  const fields = buildFields(repoInfo, pathDisplay);

  return (
    <div className="fd-detail">
      <div className="fd-card">
        {props.isActive ? (
          <div className="fd-eyebrow fd-eyebrow-active">
            <span className="fd-eyebrow-dot">●</span>ACTIVE REPOSITORY
          </div>
        ) : (
          <div className="fd-eyebrow">REPOSITORY</div>
        )}

        <div className="fd-hero">
          <h2 className="fd-title">{name}</h2>
          {repoInfo?.branch && <span className="fd-branch">⎇ {repoInfo.branch}</span>}
        </div>

        {repoInfo?.description && <p className="fd-desc">{repoInfo.description}</p>}

        <hr className="fd-divider" />

        <div className="fd-grid">
          {fields.map((field) => (
            <div className="fd-field" key={field.label}>
              <span className="fd-field-label">{field.label}</span>
              <span className={field.mono ? 'fd-field-value fd-mono' : 'fd-field-value'}>{field.value}</span>
            </div>
          ))}
        </div>

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
          <span className="fd-hint">
            {props.isActive
              ? `${name} is now the active repo for all agents.`
              : 'Sets the repo your agents will run in.'}
          </span>
          {props.activeError && <span className="fd-error">{props.activeError}</span>}
        </div>
      </div>
    </div>
  );
}
