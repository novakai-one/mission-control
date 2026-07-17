// The 11 dimension rows in the calm grammar: score number (the only colored
// element, carrying the analyzer's band), name, a thin bar, the analyzer's
// detail sentence. Clicking a row reveals its worst-files list slowly.
import React, { useState, type CSSProperties } from 'react';
import {
  bandClass, dimensionTitle, formatValue, gradeScoreLabel,
  type DimensionGrade, type FileHealth, type WorstFile,
} from '../../../lib/analyticsModel/index.js';
import './index.css';

interface DimensionRowsProps {
  grades: DimensionGrade[];
  worstFiles: Record<string, WorstFile[]>;
  /** Health of series.json — when it broke, say so instead of an empty list. */
  seriesHealth: FileHealth;
}

/** Honest copy for a dimension with nothing to expand. */
function emptyReason(dimension: string, seriesHealth: FileHealth): string {
  if (seriesHealth !== 'ok') return `per-file detail unavailable — series.json is ${seriesHealth}`;
  if (dimension === 'propagationCost') {
    return 'no per-file blame here — reachability top-ranks entry points, which is normal';
  }
  return 'the analyzer reported no per-file scores for this dimension';
}

function WorstList({ files, dimension, seriesHealth }: {
  files: WorstFile[] | undefined;
  dimension: string;
  seriesHealth: FileHealth;
}) {
  if (!files || files.length === 0) {
    return <p className="an-worst-none">{emptyReason(dimension, seriesHealth)}</p>;
  }
  return (
    <ul className="an-worst">
      {files.map((file) => (
        <li key={file.path}>
          <span className="an-worst-path">{file.path}</span>
          <span className="an-worst-value">{formatValue(file.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function DimensionRow({ grade, files, seriesHealth }: {
  grade: DimensionGrade;
  files: WorstFile[] | undefined;
  seriesHealth: FileHealth;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="an-dim">
      <button
        type="button"
        className="an-dim-row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`an-dim-score ${bandClass(grade.band)}`}>{gradeScoreLabel(grade)}</span>
        <span className="an-dim-name">{dimensionTitle(grade.dimension)}</span>
        <span className="an-dim-bar">
          {/* A stale grade without a score gets no fill at all — a zero-width bar would claim "0". */}
          {grade.score !== undefined && (
            // eslint-disable-next-line no-restricted-syntax -- the fill width is the score itself, a runtime value
            <i style={{ '--an-fill': `${grade.score}%` } as CSSProperties} />
          )}
        </span>
        <span className="an-dim-detail">{grade.detail}</span>
      </button>
      <div className={open ? 'an-dim-reveal an-open' : 'an-dim-reveal'}>
        <div className="an-dim-reveal-inner">
          {grade.score === undefined && (
            <p className="an-worst-none">score unavailable — this result predates per-dimension scoring; rerun the analysis</p>
          )}
          <WorstList files={files} dimension={grade.dimension} seriesHealth={seriesHealth} />
        </div>
      </div>
    </li>
  );
}

export function DimensionRows({ grades, worstFiles, seriesHealth }: DimensionRowsProps) {
  return (
    <ul className="an-dims">
      {grades.map((grade) => (
        <DimensionRow
          key={grade.dimension}
          grade={grade}
          files={worstFiles[grade.dimension]}
          seriesHealth={seriesHealth}
        />
      ))}
    </ul>
  );
}
