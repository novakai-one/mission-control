// Analytics lens — Novakai Analytics rehomed as a native studio view. The
// sibling repo's analyzer stays the only source of numbers: this view renders
// its verdicts.json verbatim (scoreboard → dimensions → where to look) and
// asks the AnalyticsHub to run it; 'novakai:analytics-changed' window events
// (relayed from analytics-event ws frames) refresh the result live.
import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchLatest, formatWhen, overallLabel, scoreCaption, startRun,
  type AnalyticsLatest, type AnalyticsRunEvent,
} from '../../lib/analyticsModel/index.js';
import { useAttention } from '../../lib/attention/index.js';
import { DimensionRows } from './rows/index.js';
import { ResultSections } from './sections/index.js';
import './index.css';

/** DashboardShell relays backend analytics-event ws frames as this window event. */
export const ANALYTICS_CHANGED_EVENT = 'novakai:analytics-changed';

function runEventDetail(event: Event): AnalyticsRunEvent | null {
  const detail = (event as CustomEvent).detail as AnalyticsRunEvent | undefined;
  return detail && typeof detail.repoPath === 'string' ? detail : null;
}

/** Size context when snapshot.json was readable; its absence is diagnosed,
 * never papered over. */
function contextLine(latest: AnalyticsLatest): string {
  if (latest.result?.context) {
    const { fileCount, totalLines } = latest.result.context;
    return ` · ${fileCount} files · ${totalLines.toLocaleString()} lines`;
  }
  return latest.files.snapshot === 'ok' ? '' : ` · snapshot.json ${latest.files.snapshot}`;
}

function HeadMeta({ latest }: { latest: AnalyticsLatest | null }) {
  if (latest?.running) return <span className="an-when an-running">analyzing…</span>;
  if (!latest?.result) return null;
  return (
    <span className="an-when">
      analyzed {formatWhen(latest.result.verdict.generatedAt)}{contextLine(latest)}
    </span>
  );
}

function Scoreboard({ latest }: { latest: AnalyticsLatest }) {
  const verdict = latest.result?.verdict;
  if (!verdict) return null;
  return (
    <div className="an-score">
      <div className="an-score-figure">
        <span className="an-score-num">{overallLabel(verdict)}</span>
        <span className="an-score-denom">/100</span>
      </div>
      <div className="an-score-text">
        <p className="an-verdict">{verdict.healthVerdict}</p>
        <p className="an-score-math">{scoreCaption(verdict)}</p>
      </div>
    </div>
  );
}

/** Never-run and corrupt-output are different states with different copy. */
function EmptyState({ latest, error }: { latest: AnalyticsLatest | null; error: string | null }) {
  if (error !== null) return <div className="an-empty"><p>{error}</p></div>;
  if (latest === null) return <div className="an-empty"><p>Loading…</p></div>;
  if (latest.running) return <div className="an-empty"><p className="an-running">analyzing…</p></div>;
  if (latest.files.verdicts === 'corrupt') {
    return (
      <div className="an-empty">
        <p>The last analysis output is unreadable (verdicts.json is corrupt).</p>
        <p className="an-empty-hint">Run the analysis again to replace it.</p>
      </div>
    );
  }
  return (
    <div className="an-empty">
      <p>No analysis yet for this repo.</p>
      <p className="an-empty-hint">Run analysis to grade it across 11 structural dimensions.</p>
    </div>
  );
}

function useAnalytics(repoPath: string | null) {
  const [latest, setLatest] = useState<AnalyticsLatest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!repoPath) return;
    fetchLatest(repoPath)
      .then((data) => { setLatest(data); setError(null); })
      .catch(() => setError('The analytics backend is unreachable.'));
  }, [repoPath]);

  useEffect(() => {
    setLatest(null);
    setError(null);
    setRunError(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onRunEvent(event: Event): void {
      const detail = runEventDetail(event);
      if (!detail || detail.repoPath !== repoPath) return;
      if (detail.status === 'failed') setRunError(detail.error ?? 'analysis failed');
      if (detail.status === 'completed') setRunError(null);
      refresh();
    }
    window.addEventListener(ANALYTICS_CHANGED_EVENT, onRunEvent);
    return () => window.removeEventListener(ANALYTICS_CHANGED_EVENT, onRunEvent);
  }, [repoPath, refresh]);

  async function runAnalysis(): Promise<void> {
    if (!repoPath) return;
    setRunError(null);
    const outcome = await startRun(repoPath);
    if (!outcome.accepted) setRunError(outcome.error ?? 'could not start the analysis');
    refresh();
  }

  return { latest, error, runError, runAnalysis };
}

/** The Analytics studio lens: repo health, rendered exactly as the sibling
 * analyzer graded it. */
export function AnalyticsView({ repoPath }: { repoPath: string | null }) {
  const { latest, error, runError, runAnalysis } = useAnalytics(repoPath);
  // Amber invariant: gold belongs to the app-wide attention engine — exactly
  // one holder. This action may take gold only when nothing else holds it
  // (or is settling); otherwise the no-result primary renders quiet.
  const attention = useAttention();
  if (!repoPath) {
    return (
      <section className="analytics-view">
        <div className="an-empty"><p>Select a project to analyze.</p></div>
      </section>
    );
  }
  const result = latest?.result ?? null;
  // Primary only when there is nothing to read yet: running it IS the view's
  // one action. Gold if free, quiet (panel + ink) while gold is held.
  const isPrimary = result === null && latest !== null && !latest.running;
  const goldFree = attention.goldId === null && attention.settlingId === null;
  const runClass = isPrimary
    ? `an-run ${goldFree ? 'an-run-primary' : 'an-run-quiet'}`
    : 'an-run';
  return (
    <section className="analytics-view">
      <header className="an-head">
        <div className="an-head-id">
          <h1>Repo health</h1>
          <span className="an-repo">{repoPath}</span>
        </div>
        <div className="an-head-meta">
          <HeadMeta latest={latest} />
          <button type="button" className={runClass} disabled={latest?.running ?? false} onClick={() => void runAnalysis()}>
            Run analysis
          </button>
        </div>
      </header>
      {runError !== null && <p className="an-run-error">{runError}</p>}
      <div className="an-body">
        {result === null ? (
          <EmptyState latest={latest} error={error} />
        ) : (
          <>
            <Scoreboard latest={latest as AnalyticsLatest} />
            <DimensionRows
              grades={result.verdict.grades}
              worstFiles={result.worstFiles}
              seriesHealth={(latest as AnalyticsLatest).files.series}
            />
            <ResultSections verdict={result.verdict} />
          </>
        )}
      </div>
    </section>
  );
}
