import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type {
  AnalyticsLatest, AnalyticsVerdict, FileHealth, SnapshotContext, WorstFile,
} from '../../../shared/analytics/types.js';

/** The sibling Novakai-Analytics checkout stays the analyzer's source of
 * truth — Command shells out to it and only ever reads its output files.
 * NVK_ANALYTICS_REPO rehomes it. */
export function analyticsRepoDir(): string {
  return process.env.NVK_ANALYTICS_REPO
    ?? join(homedir(), 'Programming', 'Novakai-Analytics');
}

/** Where the analyzer is told to write its output for one analyzed repo:
 * .novakai-command/analytics/<repoLabel> — the persisted latest result. */
export function analyticsOutDir(repoPath: string, baseDir = defaultBaseDir()): string {
  return join(baseDir, basename(resolve(repoPath)));
}

function defaultBaseDir(): string {
  return join(process.cwd(), '.novakai-command', 'analytics');
}

/** Which series.json metric carries a dimension's per-file scores. The
 * analyzer writes cause series prefixed "snapshot."; two dimensions have
 * differently-named sources (godModules ← fanIn, interfaceClarity ←
 * shallowModules). propagationCost is deliberately absent: its per-file
 * reachability top-ranks entry points, which is normal, not blame
 * (Novakai-Analytics AGENTS.md). */
const DIMENSION_SERIES: Record<string, string> = {
  cycles: 'snapshot.cycles',
  duplication: 'snapshot.duplication',
  complexity: 'snapshot.complexity',
  giantFiles: 'snapshot.giantFiles',
  giantFunctions: 'snapshot.giantFunctions',
  godModules: 'snapshot.fanIn',
  deadExports: 'snapshot.deadExports',
  swallowedErrors: 'snapshot.swallowedErrors',
  docCoverage: 'snapshot.docCoverage',
  interfaceClarity: 'snapshot.shallowModules',
};

interface SeriesEntry {
  metric: string;
  perFile?: Record<string, number>;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isRecordArray(value: unknown, valid: (entry: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value) && value.every(
    (entry) => typeof entry === 'object' && entry !== null && valid(entry as Record<string, unknown>),
  );
}

function isGrade(entry: Record<string, unknown>): boolean {
  return typeof entry.dimension === 'string'
    && typeof entry.band === 'string'
    && typeof entry.detail === 'string'
    && typeof entry.value === 'number'
    // Stale pre-scoring outputs legitimately lack score — that is valid
    // data (rendered as a dash), not corruption. A mis-typed score is.
    && (entry.score === undefined || typeof entry.score === 'number');
}

function isRefactorCase(entry: Record<string, unknown>): boolean {
  return typeof entry.path === 'string' && isStringArray(entry.reasons);
}

function isSignal(entry: Record<string, unknown>): boolean {
  return typeof entry.metric === 'string'
    && typeof entry.role === 'string'
    && typeof entry.status === 'string';
}

/** Deep shape check over EVERY collection the view renders. A verdicts.json
 * missing (or mis-typing) any of them is 'corrupt', never 'ok' — the UI
 * must be able to trust files.verdicts === 'ok' completely. */
function isVerdict(value: unknown): value is AnalyticsVerdict {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.repo === 'string'
    && typeof record.generatedAt === 'string'
    && typeof record.healthVerdict === 'string'
    && isRecordArray(record.grades, isGrade)
    && isRecordArray(record.whereToLook, isRefactorCase)
    && isStringArray(record.processPain)
    && isRecordArray(record.signals, isSignal)
    && isStringArray(record.caveats);
}

function isSnapshotContext(value: unknown): value is SnapshotContext {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.fileCount === 'number' && typeof record.totalLines === 'number';
}

/** One output file's read outcome: absent, unparseable, or a value that
 * still has to pass its shape check before the file counts as 'ok'. */
interface FileRead {
  health: FileHealth;
  value: unknown;
}

function checkedHealth(read: FileRead, valid: (value: unknown) => boolean): FileHealth {
  if (read.health !== 'ok') return read.health;
  return valid(read.value) ? 'ok' : 'corrupt';
}

/** Top offenders per dimension from the analyzer's per-file scores (higher =
 * worse). Only dimensions with a non-empty perFile map get a list — an empty
 * list would read as "no offenders", which the data does not say. */
export function worstFilesFrom(series: SeriesEntry[], limit = 8): Record<string, WorstFile[]> {
  const byMetric = new Map(series.map((entry) => [entry.metric, entry.perFile ?? {}]));
  const result: Record<string, WorstFile[]> = {};
  for (const [dimension, metric] of Object.entries(DIMENSION_SERIES)) {
    const perFile = byMetric.get(metric);
    if (perFile === undefined) continue;
    const ranked = Object.entries(perFile)
      .map(([path, value]) => ({ path, value }))
      .sort((first, second) => second.value - first.value)
      .slice(0, limit);
    if (ranked.length > 0) result[dimension] = ranked;
  }
  return result;
}

/** Assembles the result from whichever companion files were readable: a
 * broken series.json costs the worst-files lists, a broken snapshot.json
 * costs the size context — the verdict itself still renders. */
function buildResult(
  verdict: AnalyticsVerdict,
  series: FileRead,
  snapshot: FileRead,
  files: { series: FileHealth; snapshot: FileHealth },
): NonNullable<AnalyticsLatest['result']> {
  const worstFiles = files.series === 'ok' ? worstFilesFrom(series.value as SeriesEntry[]) : {};
  return {
    verdict,
    worstFiles,
    ...(files.snapshot === 'ok' ? { context: contextFrom(snapshot.value as SnapshotContext) } : {}),
  };
}

function contextFrom(snapshot: SnapshotContext): SnapshotContext {
  return { fileCount: snapshot.fileCount, totalLines: snapshot.totalLines };
}

/** Reads the analyzer's persisted output files for one repo. Pure reader —
 * all numbers come from disk; nothing is recomputed or defaulted. */
export class AnalyticsStore {
  constructor(private readonly baseDir = defaultBaseDir()) {}

  outDir(repoPath: string): string {
    return analyticsOutDir(repoPath, this.baseDir);
  }

  async loadLatest(repoPath: string, running: boolean): Promise<AnalyticsLatest> {
    const resolved = resolve(repoPath);
    const directory = this.outDir(resolved);
    const verdicts = await this.readJson(join(directory, 'verdicts.json'));
    const series = await this.readJson(join(directory, 'series.json'));
    const snapshot = await this.readJson(join(directory, 'snapshot.json'));
    const files = {
      verdicts: checkedHealth(verdicts, isVerdict),
      series: checkedHealth(series, (value) => Array.isArray(value)),
      snapshot: checkedHealth(snapshot, isSnapshotContext),
    };
    const base = { repoPath: resolved, running, files };
    if (files.verdicts !== 'ok') return { ...base, result: null };
    return { ...base, result: buildResult(verdicts.value as AnalyticsVerdict, series, snapshot, files) };
  }

  /** Missing and corrupt are different diagnoses; never collapse them. */
  private async readJson(filePath: string): Promise<FileRead> {
    let rawText: string;
    try {
      rawText = await readFile(filePath, 'utf8');
    } catch {
      return { health: 'missing', value: null };
    }
    try {
      return { health: 'ok', value: JSON.parse(rawText) as unknown };
    } catch {
      return { health: 'corrupt', value: null };
    }
  }
}
