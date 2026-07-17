// The quiet sections below the dimension rows: where to look (cause-symptom
// overlap files with their reasons), trend signals with honest gated /
// unconfigured states, pain without a structural cause, and the analyzer's
// caveats. Everything here is the analyzer's own words.
import React from 'react';
import {
  signalDetail, signalTitle, visibleSignals, type AnalyticsVerdict,
} from '../../../lib/analyticsModel/index.js';
import './index.css';

function WhereToLook({ verdict }: { verdict: AnalyticsVerdict }) {
  if (verdict.whereToLook.length === 0) return null;
  return (
    <section className="an-section">
      <h2>Where to look</h2>
      <ul className="an-cases">
        {verdict.whereToLook.map((entry) => (
          <li key={entry.path}>
            <span className="an-case-path">{entry.path}</span>
            <span className="an-case-reasons">{entry.reasons.join(', ')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Signals({ verdict }: { verdict: AnalyticsVerdict }) {
  const signals = visibleSignals(verdict);
  if (signals.length === 0) return null;
  return (
    <section className="an-section">
      <h2>Signals</h2>
      <ul className="an-signals">
        {signals.map((signal) => (
          <li key={signal.metric} className={signal.status === 'ok' ? '' : 'an-signal-off'}>
            <span className="an-signal-name">{signalTitle(signal.metric)}</span>
            <span className="an-signal-detail">{signalDetail(signal)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProcessPain({ verdict }: { verdict: AnalyticsVerdict }) {
  if (verdict.processPain.length === 0) return null;
  return (
    <section className="an-section">
      <h2>Pain without a structural cause</h2>
      <ul className="an-pain">
        {verdict.processPain.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}

function Caveats({ verdict }: { verdict: AnalyticsVerdict }) {
  if (verdict.caveats.length === 0) return null;
  return (
    <ul className="an-caveats">
      {verdict.caveats.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}

export function ResultSections({ verdict }: { verdict: AnalyticsVerdict }) {
  return (
    <>
      <WhereToLook verdict={verdict} />
      <Signals verdict={verdict} />
      <ProcessPain verdict={verdict} />
      <Caveats verdict={verdict} />
    </>
  );
}
