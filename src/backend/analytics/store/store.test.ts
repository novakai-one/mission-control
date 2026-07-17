import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnalyticsStore, analyticsOutDir, worstFilesFrom } from './index.js';

// Production-shaped fixtures: metric names carry the "snapshot." prefix, and
// two dimensions read differently-named sources (godModules ← fanIn,
// interfaceClarity ← shallowModules).
const series: { metric: string; perFile: Record<string, number> }[] = [
  { metric: 'snapshot.complexity', perFile: { 'a.ts': 12, 'b.ts': 77, 'c.ts': 3 } },
  { metric: 'snapshot.fanIn', perFile: { 'hub.ts': 40 } },
  { metric: 'snapshot.shallowModules', perFile: {} },
  { metric: 'churnConcentration', perFile: { 'hot.ts': 9 } },
];

const worst = worstFilesFrom(series, 2);
// Sorted worst-first (higher = worse), capped at top N.
assert.deepEqual(worst.complexity, [{ path: 'b.ts', value: 77 }, { path: 'a.ts', value: 12 }]);
// godModules reads snapshot.fanIn.
assert.deepEqual(worst.godModules, [{ path: 'hub.ts', value: 40 }]);
// An empty perFile map yields no list — never an empty "no offenders" claim.
assert.equal('interfaceClarity' in worst, false);
// Symptom series and propagationCost never produce dimension lists.
assert.equal('churnConcentration' in worst, false);
assert.equal('propagationCost' in worst, false);

// outDir keys by repo basename under the store's base dir.
assert.equal(analyticsOutDir('/Users/x/Programming/Some-Repo', '/base'), '/base/Some-Repo');

// loadLatest: no files on disk → never-run, explicitly 'missing' everywhere.
const baseDir = mkdtempSync(join(tmpdir(), 'analytics-store-'));
const store = new AnalyticsStore(baseDir);
const repoPath = '/Users/x/Programming/Some-Repo';
const neverRan = await store.loadLatest(repoPath, false);
assert.equal(neverRan.result, null);
assert.deepEqual(neverRan.files, { verdicts: 'missing', series: 'missing', snapshot: 'missing' });

// A persisted output set round-trips verbatim, signals and context included.
const verdict = {
  repo: 'Some-Repo',
  generatedAt: '2026-07-17T10:00:00.000Z',
  healthVerdict: 'Needs attention: complexity.',
  grades: [{ dimension: 'complexity', band: 'red', value: 12, detail: 'debt 12 per 1k lines', score: 40 }],
  score: { score: 40, reds: 1, ambers: 0, greens: 0, capApplied: false },
  whereToLook: [],
  processPain: [],
  signals: [
    { metric: 'amplification', role: 'symptom', status: 'ok', latest: 3 },
    { metric: 'repowise', role: 'cause', status: 'unconfigured', reason: 'no repowise.json' },
  ],
  caveats: ['fewer than 3 time buckets — trends unreliable'],
};
const outDir = store.outDir(repoPath);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'verdicts.json'), JSON.stringify(verdict), 'utf8');
writeFileSync(join(outDir, 'series.json'), JSON.stringify(series), 'utf8');
writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify({ fileCount: 248, totalLines: 33333 }), 'utf8');
const latest = await store.loadLatest(repoPath, true);
assert.equal(latest.running, true);
assert.deepEqual(latest.files, { verdicts: 'ok', series: 'ok', snapshot: 'ok' });
assert.equal(latest.result?.verdict.healthVerdict, 'Needs attention: complexity.');
assert.equal(latest.result?.verdict.score?.score, 40);
assert.equal(latest.result?.verdict.signals[1].reason, 'no repowise.json');
assert.deepEqual(latest.result?.context, { fileCount: 248, totalLines: 33333 });
assert.deepEqual(latest.result?.worstFiles.godModules, [{ path: 'hub.ts', value: 40 }]);

// Corrupt companions are diagnosed, not silently dropped: the verdict still
// renders, worst-files/context degrade, and files says exactly what broke.
writeFileSync(join(outDir, 'series.json'), 'not json', 'utf8');
writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify({ wrong: true }), 'utf8');
const degraded = await store.loadLatest(repoPath, false);
assert.deepEqual(degraded.files, { verdicts: 'ok', series: 'corrupt', snapshot: 'corrupt' });
assert.deepEqual(degraded.result?.worstFiles, {});
assert.equal(degraded.result?.context, undefined);

// A corrupt verdicts.json is a diagnosable state, distinct from never-run.
writeFileSync(join(outDir, 'verdicts.json'), 'not json', 'utf8');
const corrupt = await store.loadLatest(repoPath, false);
assert.equal(corrupt.result, null);
assert.equal(corrupt.files.verdicts, 'corrupt');

// Shape regressions: a verdict missing or mis-typing ANY collection the view
// renders is corrupt — files.verdicts 'ok' must be fully trustworthy.
const malformed: Record<string, unknown>[] = [
  { ...verdict, grades: undefined },
  { ...verdict, grades: [{ dimension: 'complexity' }] },
  { ...verdict, whereToLook: undefined },
  { ...verdict, whereToLook: [{ path: 'a.ts', reasons: 'complexity' }] },
  { ...verdict, processPain: undefined },
  { ...verdict, processPain: [{ path: 'a.ts' }] },
  { ...verdict, signals: undefined },
  { ...verdict, signals: [{ metric: 'rework' }] },
  { ...verdict, caveats: undefined },
  { ...verdict, caveats: [42] },
];
for (const [index, broken] of malformed.entries()) {
  writeFileSync(join(outDir, 'verdicts.json'), JSON.stringify(broken), 'utf8');
  const outcome = await store.loadLatest(repoPath, false);
  assert.equal(outcome.files.verdicts, 'corrupt', `malformed fixture ${index} must be corrupt`);
  assert.equal(outcome.result, null, `malformed fixture ${index} must not produce a result`);
}

// Data compatibility: a stale grade WITHOUT a score is valid (pre-scoring
// output, rendered as a dash) — but a mis-typed score is still corrupt.
const staleGrade = { dimension: 'cycles', band: 'red', value: 3, detail: '3 import cycles' };
writeFileSync(
  join(outDir, 'verdicts.json'),
  JSON.stringify({ ...verdict, grades: [staleGrade] }),
  'utf8',
);
const stale = await store.loadLatest(repoPath, false);
assert.equal(stale.files.verdicts, 'ok');
assert.equal(stale.result?.verdict.grades[0].score, undefined);
writeFileSync(
  join(outDir, 'verdicts.json'),
  JSON.stringify({ ...verdict, grades: [{ ...staleGrade, score: 'high' }] }),
  'utf8',
);
assert.equal((await store.loadLatest(repoPath, false)).files.verdicts, 'corrupt');

console.log('analytics store: ok');
