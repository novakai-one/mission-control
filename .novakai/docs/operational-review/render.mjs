#!/usr/bin/env node
// Operational-review renderer — turns a report directory's report.jsonl
// (typed blocks, one JSON object per line) into a self-contained report.html
// with the house look: dark #0d0d0f, one gold signal, sage wins, Inter, calm.
//
//   node render.mjs <report-dir>          → writes <report-dir>/report.html
//
// Section types (block kind:"section", rendered in `order`): prose, stats,
// timeline, figures, finding, chain, latency, rows, play, table. Content
// blocks point at their section via `section`. Images in figures are read
// from the report dir and inlined as data URIs, so the output runs anywhere
// (file://, artifact CSP, tunnel post).

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? '.');
const lines = readFileSync(join(dir, 'report.jsonl'), 'utf8').split('\n').filter(Boolean);
const blocks = lines.map((l, i) => {
  try { return JSON.parse(l); } catch (e) { throw new Error(`report.jsonl line ${i + 1}: ${e.message}`); }
});

const review = blocks.find((b) => b.kind === 'review');
if (!review) throw new Error('report.jsonl needs exactly one kind:"review" block');
const sections = blocks.filter((b) => b.kind === 'section').sort((a, b) => a.order - b.order);
const of = (sectionId, kind) =>
  blocks.filter((b) => b.section === sectionId && (!kind || b.kind === kind))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dataUri = (rel) => {
  const buf = readFileSync(join(dir, rel));
  const ext = rel.split('.').pop().toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
};

// Timeline geometry: clock strings + dayOffset → % of the axis span.
const mins = (hhmm, dayOffset = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return dayOffset * 1440 + h * 60 + m;
};
const axis = review.timelineAxis; // { start:"19:00", end:"08:00", endDayOffset:1, ticks:["19:00",...] }
const axisStart = mins(axis.start, 0);
const axisSpan = mins(axis.end, axis.endDayOffset ?? 0) - axisStart;
const pct = (hhmm, dayOffset) => ((mins(hhmm, dayOffset) - axisStart) / axisSpan) * 100;

const renderers = {
  prose: (s) => of(s.id, 'prose').map((p) => `<p${p.lead ? ' class="lead"' : ''}>${p.html}</p>`).join('\n'),

  stats: (s) => `<div class="stats">${of(s.id, 'stat').map((x) =>
    `<div class="stat"><div class="v">${esc(x.v)}</div><div class="k">${esc(x.k)}</div></div>`).join('')}</div>`,

  timeline: (s) => {
    const ticks = axis.ticks.map((t) =>
      `<span style="left:${pct(t.at ?? t, t.dayOffset ?? (mins(t.at ?? t) < axisStart ? 1 : 0)).toFixed(1)}%">${esc(t.label ?? t.at ?? t)}</span>`).join('');
    const rows = of(s.id, 'span').map((r) => {
      const left = pct(r.start, r.startDay ?? 0);
      const width = Math.max(pct(r.end, r.endDay ?? r.startDay ?? 0) - left, 0.6);
      const anchorRight = r.anchorRight ? ' transform:translateX(-100%);' : '';
      const barLeft = r.anchorRight ? Math.min(left + width, 99) : left;
      return `<div class="tl-row"><div class="tl-who"><b>${esc(r.who)}</b> · ${esc(r.what)}</div><div class="tl-track">` +
        `<div class="tl-bar${r.tone ? ' ' + r.tone : ''}" style="left:${barLeft.toFixed(1)}%; width:${width.toFixed(1)}%;${anchorRight}">` +
        `<span${r.anchorRight ? ' class="flip"' : ''}>${esc(r.label)}</span></div></div></div>`;
    }).join('\n');
    const note = s.note ? `<div class="tl-note">${s.note}</div>` : '';
    return `<div class="tl"><div class="tl-inner"><div class="tl-scale">${ticks}</div>\n${rows}\n${note}</div></div>`;
  },

  figures: (s) => `<div class="figgrid">${of(s.id, 'figure').map((f) =>
    `<figure${f.wide ? ' class="wide"' : ''}><img src="${dataUri(f.img)}" alt="${esc(f.alt ?? '')}">` +
    `<figcaption><b>${esc(f.capTitle)}</b> · ${f.cap}</figcaption></figure>`).join('\n')}</div>`,

  finding: (s) => of(s.id, 'finding').map((f) =>
    `<div class="finding"><div class="fk">${esc(f.label)}</div><div class="fv">${f.headline}</div><div class="fd">${f.detail}</div></div>`).join('\n'),

  callout: (s) => of(s.id, 'callout').map((c) =>
    `<div class="callout"><p>${c.html}</p></div>`).join('\n'),

  chain: (s) => `<div class="chain">${of(s.id, 'chain-link').map((l) => {
    const mark = l.status === 'ok' ? '✓' : l.status === 'part' ? '◐' : '✗';
    return `<div class="link"><div class="st ${l.status}">${mark}</div><h4>${esc(l.title)}</h4><p>${l.body}</p></div>`;
  }).join('')}</div>`,

  latency: (s) => `<div class="lat">${of(s.id, 'latency').map((r) =>
    `<div class="lat-row"><div class="lat-who">${esc(r.who)}</div><div class="lat-track"><div class="lat-fill" style="width:${r.pct}%"></div></div><div class="lat-val">${esc(r.label)}</div></div>`).join('\n')}` +
    (s.note ? `<div class="lat-cap">${s.note}</div>` : '') + `</div>`,

  rows: (s) => `<div class="rows">${of(s.id, 'row').map((r) =>
    `<details class="row ${r.tone}"${r.open ? ' open' : ''}><summary><span class="m">${r.tone === 'win' ? '✓' : esc(String(r.mark ?? ''))}</span>` +
    `<span class="t">${esc(r.title)}</span><span class="d">${esc(r.tag ?? '')}</span></summary>` +
    `<div class="body">${r.body}</div></details>`).join('\n')}</div>`,

  play: (s) => `<div class="play">${of(s.id, 'play-step').map((p) =>
    `<div class="step"><h4>${esc(p.title)}</h4><p>${p.body}${p.save ? ` <span class="save">${esc(p.save)}</span>` : ''}</p></div>`).join('\n')}</div>`,

  table: (s) => {
    const rows = of(s.id, 'table-row');
    const head = s.columns.map((c) => `<th>${esc(c)}</th>`).join('');
    const body = rows.map((r) => `<tr>${r.cells.map((c, i) => `<td>${i === 0 ? `<b>${c}</b>` : c}</td>`).join('')}</tr>`).join('');
    return `<div class="tablewrap"><table><tr>${head}</tr>${body}</table></div>`;
  },
};

const sectionHtml = sections.map((s) => {
  const fn = renderers[s.type];
  if (!fn) throw new Error(`unknown section type "${s.type}" (${s.id})`);
  const label = s.label ? `<div class="seclabel">${esc(s.label)}</div>\n` : '';
  const tight = s.tight ? ' style="margin-top:20px"' : '';
  return `<section${tight}>\n${label}${fn(s)}\n</section>`;
}).join('\n\n');

const css = `
  :root {
    --bg:#0d0d0f; --panel:#1b1b1e; --panel-deep:#121214; --panel-light:#252529;
    --ink:#ececee; --muted:#a2a2aa; --faint:#8b8b94;
    --hairline:rgba(255,255,255,0.08); --hairline-strong:rgba(255,255,255,0.14);
    --gold:#d0a14b; --gold-bright:#e2ba6e; --gold-ink:#17130b; --sage:#78a886;
    --bar:#4a4a52; --bar-soft:#333338; --shadow:0 1px 2px rgba(0,0,0,0.4);
  }
  @media (prefers-color-scheme: light) { :root {
    --bg:#f2f0eb; --panel:#ffffff; --panel-deep:#e9e6df; --panel-light:#f8f7f3;
    --ink:#1b1b1e; --muted:#5d5c63; --faint:#8b8a91;
    --hairline:rgba(20,18,10,0.10); --hairline-strong:rgba(20,18,10,0.18);
    --gold:#a87c2e; --gold-bright:#8a641f; --gold-ink:#ffffff; --sage:#4e7d5c;
    --bar:#b9b6ae; --bar-soft:#d4d1c9; --shadow:0 1px 2px rgba(30,25,10,0.08);
  } }
  :root[data-theme="dark"] {
    --bg:#0d0d0f; --panel:#1b1b1e; --panel-deep:#121214; --panel-light:#252529;
    --ink:#ececee; --muted:#a2a2aa; --faint:#8b8b94;
    --hairline:rgba(255,255,255,0.08); --hairline-strong:rgba(255,255,255,0.14);
    --gold:#d0a14b; --gold-bright:#e2ba6e; --gold-ink:#17130b; --sage:#78a886;
    --bar:#4a4a52; --bar-soft:#333338; --shadow:0 1px 2px rgba(0,0,0,0.4);
  }
  :root[data-theme="light"] {
    --bg:#f2f0eb; --panel:#ffffff; --panel-deep:#e9e6df; --panel-light:#f8f7f3;
    --ink:#1b1b1e; --muted:#5d5c63; --faint:#8b8a91;
    --hairline:rgba(20,18,10,0.10); --hairline-strong:rgba(20,18,10,0.18);
    --gold:#a87c2e; --gold-bright:#8a641f; --gold-ink:#ffffff; --sage:#4e7d5c;
    --bar:#b9b6ae; --bar-soft:#d4d1c9; --shadow:0 1px 2px rgba(30,25,10,0.08);
  }
  * { box-sizing:border-box; }
  body { background:var(--bg); color:var(--ink); font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    font-size:15px; line-height:1.55; margin:0; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:940px; margin:0 auto; padding:40px 28px 80px; }
  .wordmark { font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; color:var(--gold); letter-spacing:0.02em; }
  header .kicker { margin-top:34px; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--faint); font-weight:600; }
  h1 { font-size:32px; font-weight:650; letter-spacing:-0.015em; margin:6px 0 10px; text-wrap:balance; }
  .sub { color:var(--muted); max-width:64ch; margin:0; }
  .sub .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; color:var(--faint); }
  section { margin-top:52px; }
  .seclabel { font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--faint); font-weight:600;
    margin-bottom:14px; display:flex; align-items:center; gap:10px; }
  .seclabel::after { content:""; flex:1; height:1px; background:var(--hairline); }
  p { max-width:68ch; } p.lead { font-size:16.5px; max-width:62ch; } strong { font-weight:600; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(128px,1fr)); gap:8px; }
  .stat { background:var(--panel); border:1px solid var(--hairline); border-radius:6px; padding:12px 14px 10px; }
  .stat .v { font-size:21px; font-weight:650; font-variant-numeric:tabular-nums; letter-spacing:-0.01em; }
  .stat .k { font-size:11.5px; color:var(--faint); margin-top:2px; line-height:1.35; }
  .tl { background:var(--panel); border:1px solid var(--hairline); border-radius:6px; padding:18px 18px 8px; overflow-x:auto; }
  .tl-inner { min-width:720px; }
  .tl-scale { position:relative; height:18px; margin-left:218px; margin-bottom:6px; }
  .tl-scale span { position:absolute; transform:translateX(-50%); font-size:10.5px; color:var(--faint); font-variant-numeric:tabular-nums; }
  .tl-row { display:flex; align-items:center; gap:10px; margin-bottom:7px; }
  .tl-who { width:208px; flex:none; font-size:12px; color:var(--muted); text-align:right; line-height:1.3; }
  .tl-who b { color:var(--ink); font-weight:600; }
  .tl-track { position:relative; flex:1; height:20px; }
  .tl-track::before { content:""; position:absolute; inset:9px 0; height:1px; background:var(--hairline); }
  .tl-bar { position:absolute; top:2px; height:16px; border-radius:4px; background:var(--bar); min-width:5px; }
  .tl-bar.soft { background:var(--bar-soft); } .tl-bar.gold { background:var(--gold); }
  .tl-bar span { position:absolute; left:100%; top:50%; transform:translate(7px,-50%); font-size:10.5px; color:var(--faint);
    white-space:nowrap; font-variant-numeric:tabular-nums; }
  .tl-bar span.flip { left:auto; right:100%; transform:translate(-7px,-50%); }
  .tl-note { font-size:12px; color:var(--faint); margin:12px 0 8px; } .tl-note b { color:var(--gold); font-weight:600; }
  .figgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  @media (max-width:700px) { .figgrid { grid-template-columns:1fr; } }
  figure { margin:0; background:var(--panel); border:1px solid var(--hairline); border-radius:6px; padding:10px; }
  figure img { width:100%; display:block; border-radius:4px; }
  figcaption { font-size:11.5px; color:var(--faint); margin-top:8px; line-height:1.4; }
  figcaption b { color:var(--muted); font-weight:600; }
  figure.wide { grid-column:1 / -1; }
  .callout { background:var(--panel); border:1px solid var(--hairline); border-left:3px solid var(--sage); border-radius:6px; padding:14px 18px; }
  .callout p { margin:0; max-width:72ch; font-size:15px; }
  .finding { background:var(--gold); color:var(--gold-ink); border-radius:6px; padding:18px 20px; margin:22px 0; box-shadow:var(--shadow); }
  .finding .fk { font-size:11px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; opacity:0.75; }
  .finding .fv { font-size:19px; font-weight:650; margin-top:4px; letter-spacing:-0.01em; text-wrap:balance; }
  .finding .fd { font-size:13.5px; margin-top:8px; opacity:0.9; max-width:70ch; }
  .chain { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }
  @media (max-width:760px) { .chain { grid-template-columns:1fr 1fr; } }
  .link { background:var(--panel); border:1px solid var(--hairline); border-radius:6px; padding:12px 12px 10px; }
  .link .st { font-size:15px; font-weight:700; }
  .link .st.ok { color:var(--sage); } .link .st.part { color:var(--muted); } .link .st.dead { color:var(--faint); }
  .link h4 { margin:6px 0 4px; font-size:12.5px; font-weight:600; }
  .link p { margin:0; font-size:11.5px; color:var(--faint); line-height:1.45; }
  .lat { background:var(--panel); border:1px solid var(--hairline); border-radius:6px; padding:16px 18px 10px; }
  .lat-row { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
  .lat-who { width:150px; flex:none; font-size:12px; color:var(--muted); text-align:right; font-variant-numeric:tabular-nums; }
  .lat-track { flex:1; height:14px; position:relative; }
  .lat-fill { position:absolute; top:0; left:0; height:14px; border-radius:0 4px 4px 0; background:var(--bar); }
  .lat-val { font-size:11px; color:var(--faint); width:118px; flex:none; font-variant-numeric:tabular-nums; }
  .lat-cap { font-size:12px; color:var(--faint); margin:10px 0 4px; }
  .rows { display:flex; flex-direction:column; gap:8px; }
  details.row { background:var(--panel); border:1px solid var(--hairline); border-radius:6px; }
  details.row summary { list-style:none; cursor:pointer; padding:12px 16px; display:flex; align-items:baseline; gap:12px; }
  details.row summary::-webkit-details-marker { display:none; }
  details.row summary .m { flex:none; font-weight:700; font-size:13px; width:16px; text-align:center; }
  details.row.win summary .m { color:var(--sage); } details.row.gap summary .m { color:var(--faint); }
  details.row summary .t { font-weight:600; font-size:14px; }
  details.row summary .d { color:var(--faint); font-size:12.5px; margin-left:auto; flex:none; padding-left:12px; }
  details.row .body { border-top:1px solid var(--hairline); padding:12px 16px 14px 44px; font-size:13px; color:var(--muted);
    background:var(--panel-deep); border-radius:0 0 6px 6px; }
  details.row .body p { margin:0 0 8px; max-width:74ch; } details.row .body p:last-child { margin-bottom:0; }
  .q { border-left:2px solid var(--hairline-strong); padding:2px 0 2px 12px; margin:8px 0; color:var(--muted); font-size:12.5px; }
  .q .who { color:var(--faint); font-size:11px; text-transform:uppercase; letter-spacing:0.1em; font-weight:600; }
  .play { counter-reset:step; display:flex; flex-direction:column; gap:8px; }
  .step { background:var(--panel); border:1px solid var(--hairline); border-radius:6px; padding:13px 16px 13px 52px; position:relative; }
  .step::before { counter-increment:step; content:counter(step); position:absolute; left:16px; top:13px; width:22px; height:22px;
    border-radius:4px; background:var(--panel-light); border:1px solid var(--hairline); font-size:12px; font-weight:650;
    display:flex; align-items:center; justify-content:center; color:var(--muted); font-variant-numeric:tabular-nums; }
  .step h4 { margin:0 0 3px; font-size:14px; font-weight:600; }
  .step p { margin:0; font-size:13px; color:var(--muted); max-width:76ch; }
  .step .save { color:var(--sage); font-weight:600; }
  code, .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.92em; }
  code { background:var(--panel-light); border:1px solid var(--hairline); border-radius:4px; padding:1px 5px; color:var(--muted); }
  table { border-collapse:collapse; width:100%; font-size:12.5px; }
  .tablewrap { overflow-x:auto; background:var(--panel); border:1px solid var(--hairline); border-radius:6px; padding:6px 14px 10px; }
  th { text-align:left; color:var(--faint); font-size:11px; letter-spacing:0.08em; text-transform:uppercase; font-weight:600;
    padding:10px 14px 6px 0; border-bottom:1px solid var(--hairline); }
  td { padding:7px 14px 7px 0; border-bottom:1px solid var(--hairline); color:var(--muted); font-variant-numeric:tabular-nums; vertical-align:top; }
  tr:last-child td { border-bottom:none; } td b { color:var(--ink); font-weight:600; }
  footer { margin-top:64px; padding-top:18px; border-top:1px solid var(--hairline); font-size:12px; color:var(--faint); }
  footer .mono { font-size:11px; } footer p { max-width:none; margin:4px 0; }
  @media (prefers-reduced-motion:no-preference) {
    details.row .body { animation:unfold 0.35s ease; }
    @keyframes unfold { from { opacity:0; } to { opacity:1; } }
  }
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(review.title)}</title><style>${css}</style></head><body>
<div class="wrap">
<header>
  <div class="wordmark">&gt;_ novakai</div>
  <div class="kicker">${esc(review.kicker)}</div>
  <h1>${esc(review.title)}</h1>
  <p class="sub">${review.subtitle}
  <span class="mono">${esc(review.subMeta)}</span></p>
</header>

${sectionHtml}

<footer>
${review.footer.map((f) => `  <p>${f}</p>`).join('\n')}
</footer>
</div>
</body></html>
`;

writeFileSync(join(dir, 'report.html'), html);
console.log(`rendered ${join(dir, 'report.html')} (${html.length} bytes, ${sections.length} sections, ${blocks.length} blocks)`);
