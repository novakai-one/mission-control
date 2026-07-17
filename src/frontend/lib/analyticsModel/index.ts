// Presentation model for the Analytics lens: fetch helpers over the
// AnalyticsHub plus the little pure formatters the view renders with. All
// numbers come from the analyzer's output verbatim — nothing is recomputed.
import type {
  AnalyticsLatest, AnalyticsRunEvent, AnalyticsVerdict, Band, SignalSummary,
} from '../../../shared/analytics/types.js';

export type {
  AnalyticsLatest, AnalyticsRunEvent, AnalyticsVerdict, Band, DimensionGrade,
  FileHealth, RefactorCase, ScoreBreakdown, SignalSummary, WorstFile,
} from '../../../shared/analytics/types.js';

/** Sentence-case display titles (Analytics' own convention) keyed by
 * DimensionGrade.dimension; unknown dimensions fall back to their raw key so
 * a new analyzer dimension still renders honestly. */
const DIMENSION_TITLES: Record<string, string> = {
  cycles: 'Import cycles',
  duplication: 'Duplication',
  complexity: 'Complexity',
  giantFiles: 'Giant files',
  giantFunctions: 'Giant functions',
  godModules: 'God modules',
  deadExports: 'Dead exports',
  swallowedErrors: 'Swallowed errors',
  docCoverage: 'Doc coverage',
  interfaceClarity: 'Interface clarity',
  propagationCost: 'Propagation cost',
};

export function dimensionTitle(dimension: string): string {
  return DIMENSION_TITLES[dimension] ?? dimension;
}

/** The math behind the overall, shown on screen — a score that can't explain
 * itself reads as a tool error. When the any-red cap lowered the score, the
 * caption must NOT claim the average equals 79: it names the cap and shows
 * the plain average of the dimension scores next to it. */
export function scoreCaption(verdict: AnalyticsVerdict): string {
  const breakdown = verdict.score;
  if (breakdown === undefined) return 'unconfigured — the analyzer produced no score';
  const counts = `${breakdown.reds} red · ${breakdown.ambers} amber · ${breakdown.greens} green`;
  const total = verdict.grades.length;
  if (!breakdown.capApplied) {
    return `average of ${total} dimension scores = ${breakdown.score} · ${counts}`;
  }
  const scores = verdict.grades
    .map((grade) => grade.score)
    .filter((score): score is number => score !== undefined);
  const mean = scores.length === total && total > 0
    ? Math.round(scores.reduce((subtotal, score) => subtotal + score, 0) / total)
    : null;
  const average = mean === null ? '' : ` — average of ${total} dimension scores ≈ ${mean}`;
  return `capped at ${breakdown.score} by a red dimension${average} · ${counts}`;
}

/** Dimension score for the row: a dash when the analyzer's output predates
 * per-dimension scoring — never the string "undefined". */
export function gradeScoreLabel(grade: { score?: number }): string {
  return grade.score === undefined ? '–' : String(grade.score);
}

/** "unconfigured" when the analyzer withheld the score — never 100, never 0. */
export function overallLabel(verdict: AnalyticsVerdict): string {
  return verdict.score === undefined ? '—' : String(verdict.score.score);
}

export function formatWhen(isoText: string): string {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return isoText;
  return date.toLocaleString(undefined, {
    month: 'short', 'day': 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Per-file values arrive at analyzer precision; trim display noise only. */
export function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function bandClass(band: Band): string {
  return `an-${band}`;
}

const SIGNAL_TITLES: Record<string, string> = {
  amplification: 'Change amplification',
  churnConcentration: 'Churn concentration',
  rework: 'Rework',
  fixDensity: 'Fix density',
  repowise: 'Repowise',
};

export function signalTitle(metric: string): string {
  return SIGNAL_TITLES[metric] ?? metric;
}

/** Signals worth a row: every trend (symptom) metric, plus anything not-ok
 * of either role — a gated or unconfigured input must be shown with its
 * reason. Cause signals with status ok are already on screen as their
 * dimension row, so repeating them would be noise. */
export function visibleSignals(verdict: AnalyticsVerdict): SignalSummary[] {
  return (verdict.signals ?? []).filter(
    (signal) => signal.role === 'symptom' || signal.status !== 'ok',
  );
}

/** One honest line per signal: latest + trend when ok, status + why when not. */
export function signalDetail(signal: SignalSummary): string {
  if (signal.status !== 'ok') {
    return `${signal.status} — ${signal.reason ?? 'no reason given by the analyzer'}`;
  }
  const latest = signal.latest === undefined ? 'no data yet' : formatValue(signal.latest);
  return signal.direction === undefined ? latest : `${latest} · ${signal.direction}`;
}

export async function fetchLatest(repoPath: string): Promise<AnalyticsLatest> {
  const response = await fetch(`/api/analytics/latest?repoPath=${encodeURIComponent(repoPath)}`);
  if (!response.ok) throw new Error(`latest failed: ${response.status}`);
  return await response.json() as AnalyticsLatest;
}

export async function startRun(repoPath: string): Promise<{ accepted: boolean; error?: string }> {
  const response = await fetch('/api/analytics/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath }),
  });
  if (response.ok) return { accepted: true };
  const body = await response.json().catch(() => ({})) as { error?: string };
  return { accepted: false, error: body.error ?? `run failed: ${response.status}` };
}
