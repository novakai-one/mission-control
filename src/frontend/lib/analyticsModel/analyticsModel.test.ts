import assert from 'node:assert/strict';
import {
  bandClass, dimensionTitle, formatValue, gradeScoreLabel, overallLabel, scoreCaption,
  signalDetail, signalTitle, visibleSignals, type AnalyticsVerdict, type SignalSummary,
} from './index.js';

function verdict(overrides: Partial<AnalyticsVerdict>): AnalyticsVerdict {
  return {
    repo: 'Some-Repo',
    generatedAt: '2026-07-17T10:00:00.000Z',
    healthVerdict: 'Needs attention: complexity.',
    grades: Array.from({ length: 11 }, (_unused, index) => ({
      dimension: `d${index}`, band: 'green' as const, value: 0, detail: '', score: 90,
    })),
    score: { score: 46, reds: 6, ambers: 3, greens: 2, capApplied: false },
    whereToLook: [],
    processPain: [],
    signals: [],
    caveats: [],
    ...overrides,
  };
}

// Sentence-case titles per Analytics' own convention; unknown keys fall back raw.
assert.equal(dimensionTitle('swallowedErrors'), 'Swallowed errors');
assert.equal(dimensionTitle('docCoverage'), 'Doc coverage');
assert.equal(dimensionTitle('someFutureDimension'), 'someFutureDimension');

// The overall explains its own math on screen.
assert.equal(
  scoreCaption(verdict({})),
  'average of 11 dimension scores = 46 · 6 red · 3 amber · 2 green',
);

// The any-red cap never masquerades as the average: the caption names the
// cap and shows the true (uncapped) mean of the dimension scores beside it.
assert.equal(
  scoreCaption(verdict({ score: { score: 79, reds: 1, ambers: 0, greens: 10, capApplied: true } })),
  'capped at 79 by a red dimension — average of 11 dimension scores ≈ 90 · 1 red · 0 amber · 10 green',
);

// A stale grade without a score renders a dash, never "undefined"; and the
// capped caption drops its ≈ average rather than computing one over holes.
assert.equal(gradeScoreLabel({ score: 46 }), '46');
assert.equal(gradeScoreLabel({}), '–');
const staleGrades = verdict({}).grades.map((grade, index) => (index === 0 ? { ...grade, score: undefined } : grade));
assert.equal(
  scoreCaption(verdict({
    grades: staleGrades,
    score: { score: 79, reds: 1, ambers: 0, greens: 10, capApplied: true },
  })),
  'capped at 79 by a red dimension · 1 red · 0 amber · 10 green',
);

// An absent score renders "unconfigured" — never a fake 100 or 0.
assert.equal(scoreCaption(verdict({ score: undefined })), 'unconfigured — the analyzer produced no score');
assert.equal(overallLabel(verdict({ score: undefined })), '—');
assert.equal(overallLabel(verdict({})), '46');

// Display trimming only — integers stay exact, fractions cut to two places.
assert.equal(formatValue(94), '94');
assert.equal(formatValue(26.8342), '26.83');

assert.equal(bandClass('red'), 'an-red');

// Signals: symptom rows always show; ok cause rows are their dimension row
// already; a not-ok signal of any role surfaces with its reason.
const signals: SignalSummary[] = [
  { metric: 'amplification', role: 'symptom', status: 'ok', latest: 3 },
  { metric: 'snapshot.cycles', role: 'cause', status: 'ok' },
  { metric: 'repowise', role: 'cause', status: 'unconfigured', reason: 'no repowise.json' },
  { metric: 'fixDensity', role: 'symptom', status: 'gated', reason: 'commit discipline below 70%' },
];
assert.deepEqual(
  visibleSignals(verdict({ signals })).map((signal) => signal.metric),
  ['amplification', 'repowise', 'fixDensity'],
);
assert.equal(signalTitle('churnConcentration'), 'Churn concentration');
assert.equal(signalDetail(signals[0]), '3');
assert.equal(
  signalDetail({ metric: 'rework', role: 'symptom', status: 'ok', latest: 0.117647, direction: 'rising' }),
  '0.12 · rising',
);
assert.equal(signalDetail(signals[3]), 'gated — commit discipline below 70%');
assert.equal(
  signalDetail({ metric: 'amplification', role: 'symptom', status: 'ok' }),
  'no data yet',
);

console.log('analyticsModel: ok');
