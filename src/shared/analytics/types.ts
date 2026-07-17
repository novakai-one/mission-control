/**
 * Wire contract between the AnalyticsHub and the Analytics studio lens.
 * These mirror the sibling Novakai-Analytics pipeline's verdicts.json shape
 * (its src/types.ts Verdict) — Command consumes the analyzer's output files
 * verbatim and never re-implements any scoring math.
 */

/** Absolute quality band, graded by the analyzer against industry heuristics. */
export type Band = 'green' | 'amber' | 'red';

/** One snapshot dimension's grade as the analyzer produced it. */
export interface DimensionGrade {
  dimension: string;
  band: Band;
  /** The measured number the band was derived from. */
  value: number;
  /** Analyzer's one-liner: what was measured, against what threshold. */
  detail: string;
  /** 0–100 sub-score; the overall is the plain mean of these. Stale outputs
   * from before per-dimension scoring can lack it — render a dash and a
   * rerun hint, never "undefined". */
  score?: number;
}

/** Transparent 0–100 overall score; any red band caps it at 79. */
export interface ScoreBreakdown {
  score: number;
  reds: number;
  ambers: number;
  greens: number;
  capApplied: boolean;
}

/** A file where structural cause and cost symptom overlap. */
export interface RefactorCase {
  path: string;
  causeScore: number;
  symptomScore: number;
  /** The metrics that put this file here — WHY it is listed. */
  reasons: string[];
}

/** Which way a trend metric is moving across time buckets. */
export type TrendDirection = 'rising' | 'flat' | 'falling';

/** One metric's condensed signal, carried through verbatim. status 'gated' /
 * 'unconfigured' always arrives with a reason — the UI must show it. */
export interface SignalSummary {
  metric: string;
  role: 'cause' | 'symptom';
  status: 'ok' | 'gated' | 'unconfigured';
  reason?: string;
  direction?: TrendDirection;
  /** Latest bucket value, when status is 'ok' and points exist. */
  latest?: number;
}

/** verdicts.json — the analyzer's final output for one repo. */
export interface AnalyticsVerdict {
  repo: string;
  generatedAt: string;
  healthVerdict: string;
  grades: DimensionGrade[];
  /** Absent when the snapshot was unconfigured — never render a fake number. */
  score?: ScoreBreakdown;
  whereToLook: RefactorCase[];
  /** Symptom pain with no structural cause = process problem, not design. */
  processPain: string[];
  signals: SignalSummary[];
  caveats: string[];
}

/** One entry of a dimension's worst-files list (from series.json perFile). */
export interface WorstFile {
  path: string;
  /** The analyzer's per-file score for that dimension. Higher = worse. */
  value: number;
}

/** Health of one analyzer output file: 'missing' (never written) is a
 * different state from 'corrupt' (written but unreadable/misshapen). */
export type FileHealth = 'ok' | 'missing' | 'corrupt';

/** Analyzed-repo size context from snapshot.json. */
export interface SnapshotContext {
  fileCount: number;
  totalLines: number;
}

/** GET /api/analytics/latest response. result is null when verdicts.json is
 * absent (never run) OR unreadable — files.verdicts tells the two apart. */
export interface AnalyticsLatest {
  repoPath: string;
  running: boolean;
  files: { verdicts: FileHealth; series: FileHealth; snapshot: FileHealth };
  result: {
    verdict: AnalyticsVerdict;
    /** Top offenders per dimension, keyed by DimensionGrade.dimension. */
    worstFiles: Record<string, WorstFile[]>;
    /** Present only when snapshot.json was readable. */
    context?: SnapshotContext;
  } | null;
}

/** 'analytics-event' ws payload: a run started, completed, or failed. */
export interface AnalyticsRunEvent {
  repoPath: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  error?: string;
}
