// Design Guild rigor gate — mechanical checks (C1, C11, C12, C16 + hook audit).
// Run in-page via: tools/browse eval "$(cat docs/design-guild-gate-checks.js)"
// Returns JSON. Owner: Design Guild · fable. Contract: docs/design-guild-gate.md
(() => {
  const GOLD = [[208, 161, 75], [226, 186, 110]]; // #d0a14b, #e2ba6e
  const SAGE = [120, 168, 134]; // #78a886
  // Ratified person tints (M3) — identity-bound to durable Person id, never attention.
  const TINTS = {
    maya: [126, 169, 184], atlas: [168, 154, 198], nova: [201, 154, 164],
    sage: [147, 164, 208], orbit: [198, 161, 132], ede: [162, 179, 137],
    juno: [193, 153, 187], chris: [217, 212, 204],
  };
  const PALETTE = [
    [13, 13, 15], [37, 37, 41], [27, 27, 30], [18, 18, 20], [41, 41, 45], // bg + panels
    [236, 236, 238], [162, 162, 170], [139, 139, 148], // ink
    ...GOLD, SAGE, ...Object.values(TINTS),
    [0, 0, 0], [255, 255, 255], // pure black/white tolerated only at alpha extremes
  ];
  const TOL = 14; // per-channel distance tolerance
  const parse = (s) => {
    const m = s && s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const near = (c, ref) =>
    Math.abs(c.r - ref[0]) <= TOL && Math.abs(c.g - ref[1]) <= TOL && Math.abs(c.b - ref[2]) <= TOL;
  const isGold = (c) => c && c.a > 0.25 && GOLD.some((g) => near(c, g));
  const inPalette = (c) => !c || c.a <= 0.05 || PALETTE.some((p) => near(c, p));
  const isWordmark = (el) =>
    !!el.closest('[data-wordmark]') || />_\s*novakai/i.test((el.textContent || '').slice(0, 40)) ||
    // the ">_" glyph is often its own span — test the parent's assembled text too
    (el.parentElement && />_\s*novakai/i.test((el.parentElement.textContent || '').slice(0, 40)));

  const all = [...document.querySelectorAll('*')];
  const goldEls = [];
  const offPalette = new Set();
  const badRadius = [];
  const badFonts = new Set();
  // Chris ruling (M3): mono ONLY in the wordmark — terminal/diff/evidence included.
  const MONO_OK = (el) => !!el.closest('[data-wordmark],.wordmark,.brand') ||
    (el.parentElement && />_\s*novakai/i.test((el.parentElement.textContent || '').slice(0, 40)));

  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;

    const colors = [cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderBottomColor,
      cs.borderLeftColor, cs.borderRightColor, cs.outlineColor].map(parse);
    const shadowGold = /rgb/.test(cs.boxShadow) && GOLD.some((g) =>
      cs.boxShadow.includes(`${g[0]}, ${g[1]}, ${g[2]}`));

    // C1 — gold census. Text-color gold only counts when the element has direct text.
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const goldHere =
      (colors[0] && isGold(colors[0]) && hasOwnText) ||
      colors.slice(1).some(isGold) || shadowGold;
    if (goldHere && !isWordmark(el)) {
      // collapse nested gold (a gold border + its gold text child = one signal)
      if (!goldEls.some((g) => g.contains(el))) goldEls.push(el);
    }

    // C12 — palette sweep (bg + text only; borders often derive from bg blends)
    for (const c of [colors[0], colors[1]]) {
      if (c && c.a > 0.25 && !inPalette(c) && !isGold(c) && !near(c, SAGE)) {
        offPalette.add(`${el.tagName.toLowerCase()} rgb(${c.r},${c.g},${c.b})`);
      }
    }

    // C12 — radius ≤ 8px (full-round dots ≤ 12px box exempt: presence dots)
    const rad = parseFloat(cs.borderTopLeftRadius);
    if (rad > 8 && !(rad >= r.width / 2 && r.width <= 14)) {
      badRadius.push(`${el.tagName.toLowerCase()}.${el.className && el.className.baseVal !== undefined ? '' : String(el.className).split(' ')[0]} ${rad}px`);
    }

    // C12 — Inter everywhere; mono only wordmark/terminal
    const ff = cs.fontFamily.toLowerCase();
    if (/mono|courier|menlo/.test(ff) && hasOwnText && !MONO_OK(el)) {
      badFonts.add(`${el.tagName.toLowerCase()}: ${cs.fontFamily.slice(0, 40)}`);
    }
  }

  // C16 — directive copy grep
  const DIRECTIVE = /needs? (your|you)|attention|pending decision|look here|action required|waiting for you|review now/i;
  const directiveHits = all
    .filter((el) => !/^(STYLE|SCRIPT|NOSCRIPT)$/.test(el.tagName))
    .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && DIRECTIVE.test(n.textContent)))
    .map((el) => (el.textContent || '').trim().slice(0, 60));

  // C11 — decorated rows (badge/chip/pill/dot census on repeated row-ish elements)
  const decorated = all.filter((el) => {
    const cls = String(el.className);
    return /badge|chip|pill|status-dot|tag\b/i.test(cls);
  });

  // C12 (M3) — Inter must actually render, not just be declared. Compare measured
  // widths: if 'Inter, monospace' collapses to monospace metrics, Inter isn't real.
  const cv = document.createElement('canvas').getContext('2d');
  const probe = 'Hamburgefonstiv 1234 — Novakai';
  cv.font = '16px Inter, monospace'; const wInter = cv.measureText(probe).width;
  cv.font = '16px monospace'; const wMono = cv.measureText(probe).width;
  const interReal = Math.abs(wInter - wMono) > 1 && (document.fonts ? document.fonts.check('16px Inter') : true);

  // C22 — frame everything (nested hierarchy, codex ruling). Page bg is gutter
  // only. Identity-based, not color-based: on a subtle ramp the deepest panel sits
  // 3-5/channel from the page bg, so color proximity can't separate them. Instead:
  // walk up to the first PAINTED element (bg alpha > 0.25). If that element is the
  // page shell (covers ~the whole viewport, or body/html), the zone sits flat on
  // the page; if it's a smaller container, the zone is framed. Survives token drift
  // (calibrated on variant B #0b0b0d/#101012 AND brand #0d0d0f/#121214).
  const vw = innerWidth, vh = innerHeight;
  const paintedAnchor = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.25) return n;
    }
    return document.documentElement;
  };
  const isPageShell = (el) => {
    if (el === document.body || el === document.documentElement) return true;
    const r = el.getBoundingClientRect();
    return r.width >= vw * 0.92 && r.height >= vh * 0.92;
  };
  // Loophole guard (codex: "border alone passes nothing" — same for paint): a zone
  // painted imperceptibly close (±2/channel) to the page shell's own bg is still flat.
  const shellBg = parse(getComputedStyle(paintedAnchor(document.body)).backgroundColor) ||
    { r: 13, g: 13, b: 15 };
  const onPage = (el) => {
    const a = paintedAnchor(el);
    if (isPageShell(a)) return true;
    const c = parse(getComputedStyle(a).backgroundColor);
    return !!c && Math.abs(c.r - shellBg.r) <= 2 && Math.abs(c.g - shellBg.g) <= 2 &&
      Math.abs(c.b - shellBg.b) <= 2;
  };
  const showsPageBg = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return !el || onPage(el);
  };
  // Gutter-vs-flat discriminator: a transparent layout wrapper whose framed children
  // cover it (page bg = gutters only) is LEGAL; a zone whose interior mostly shows
  // page bg is FLAT. Sample a 5x4 interior grid.
  const pageFrac = (r) => {
    let hit = 0, n = 0;
    for (let i = 1; i <= 5; i++) for (let j = 1; j <= 4; j++) {
      const x = r.left + (r.width * i) / 6, y = r.top + (r.height * j) / 5;
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      n++; if (showsPageBg(x, y)) hit++;
    }
    return n ? hit / n : 0;
  };
  const flatZones = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    const zoneSized = r.width >= 240 && r.height >= 160 &&
      !(r.width >= vw * 0.92 && r.height >= vh * 0.92); // app shell exempt — it IS the page
    if (!zoneSized || el.children.length < 2) continue;
    if (onPage(el) && pageFrac(r) > 0.35) {
      if (!flatZones.some((z) => z.contains(el))) flatZones.push(el);
    }
  }
  // Global exposure: fraction of a 24x16 viewport grid showing page bg (gutters+margins
  // should keep this small; a flat build pushes it toward 1).
  let expHit = 0, expN = 0;
  for (let i = 1; i <= 24; i++) for (let j = 1; j <= 16; j++) {
    expN++; if (showsPageBg((vw * i) / 25, (vh * j) / 17)) expHit++;
  }
  const pageBgExposure = +(expHit / expN).toFixed(3);
  // Advisory: child surface darker than its parent surface (drawer law: children lighter).
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const isGray = (c) => Math.abs(c.r - c.g) <= 8 && Math.abs(c.g - c.b) <= 8;
  const darkerChildren = [];
  for (const el of all) {
    const own = parse(getComputedStyle(el).backgroundColor);
    if (!own || own.a <= 0.25 || !isGray(own) || isPageShell(el)) continue;
    let anc = null;
    for (let n = el.parentElement; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.25) { anc = c; break; }
    }
    if (anc && isGray(anc) && lum(own) < lum(anc) - 3) {
      darkerChildren.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(lum(own))}<${Math.round(lum(anc))}`);
    }
  }
  // C22a — selection/active/unread states must never carry gold.
  const selGold = all
    .filter((el) => el.matches('[aria-selected="true"],[class*="selected"],[class*="active"],[class*="unread"]'))
    .filter((el) => {
      const cs = getComputedStyle(el);
      return [cs.color, cs.backgroundColor, cs.borderTopColor, cs.outlineColor]
        .map(parse).some(isGold) || GOLD.some((g) => cs.boxShadow.includes(`${g[0]}, ${g[1]}, ${g[2]}`));
    })
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);

  // Strict bg-token census (codex Drop-1 lesson: #2b2b30 vs ratified #29292d is
  // 2/channel — invisible at TOL 14). Panel SURFACES must use exact ramp tokens.
  const RAMP = [[13, 13, 15], [18, 18, 20], [27, 27, 30], [37, 37, 41], [41, 41, 45]];
  const offRamp = new Set();
  for (const el of all) {
    const c = parse(getComputedStyle(el).backgroundColor);
    if (!c || c.a <= 0.9 || !isGray(c)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24) continue; // surfaces, not hairlines/glyph boxes
    if (lum(c) > 80) continue; // ink-on-light exceptions stay C12's job
    if (!RAMP.some((t) => Math.abs(c.r - t[0]) <= 2 && Math.abs(c.g - t[1]) <= 2 && Math.abs(c.b - t[2]) <= 2)) {
      offRamp.add(`rgb(${c.r},${c.g},${c.b}) ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
    }
  }

  const body = getComputedStyle(document.body);
  return JSON.stringify({
    url: location.href,
    composition: document.querySelector('[data-composition]')?.getAttribute('data-composition') ?? null,
    pinned: !!document.querySelector('[data-pinned]'),
    slate: document.querySelector('[data-slate]')?.textContent?.trim() ?? null,
    C1_goldCount: goldEls.length,
    C1_goldEls: goldEls.slice(0, 5).map((e) => `${e.tagName.toLowerCase()} "${(e.textContent || '').trim().slice(0, 40)}"`),
    C1_dataGoldCount: document.querySelectorAll('[data-gold]').length,
    C11_decoratedCount: decorated.length,
    C12_bodyBg: body.backgroundColor,
    C12_interReal: interReal,
    C12_offPalette: [...offPalette].slice(0, 12),
    C12_badRadius: badRadius.slice(0, 8),
    C12_badFonts: [...badFonts].slice(0, 8),
    C16_directiveCopy: directiveHits.slice(0, 8),
    C12_offRampSurfaces: [...offRamp].slice(0, 10),
    C22_pageBgExposure: pageBgExposure,
    C22_flatZoneCount: flatZones.length,
    C22_flatZones: flatZones.slice(0, 8).map((e) =>
      `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`),
    C22_darkerChildren: darkerChildren.slice(0, 8),
    C22a_goldInSelection: selGold.slice(0, 8),
    // Tint law: clay (orbit) may tint text/avatar, NEVER a fill; and any tinted element
    // must belong to that person (binding checked per-element against actor context).
    C12_tintReport: (() => {
      const out = [];
      for (const el of all) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 1) continue;
        for (const [person, t] of Object.entries(TINTS)) {
          const fg = parse(cs.color), bg = parse(cs.backgroundColor);
          const fgHit = fg && fg.a > 0.25 && near(fg, t);
          const bgHit = bg && bg.a > 0.25 && near(bg, t);
          if (!fgHit && !bgHit) continue;
          const ctx = el.closest('[data-person],[data-actor-id],[data-person-id],[data-actor]');
          const who = ctx && (ctx.getAttribute('data-person') || ctx.getAttribute('data-actor-id') || ctx.getAttribute('data-person-id') || ctx.getAttribute('data-actor'));
          const isFill = bgHit && (r.width > 40 || r.height > 40); // bigger than avatar = fill
          if ((who && who !== person) || (person === 'orbit' && isFill)) {
            out.push(`${person}-tint on ${el.tagName.toLowerCase()} bound=${who || 'unbound'}${isFill ? ' FILL' : ''}`);
          }
        }
      }
      return out.slice(0, 10);
    })(),
    C13_scripts: [...document.querySelectorAll('script[src],link[rel=stylesheet][href],img[src^="http"]')].map((e) => e.src || e.href).slice(0, 8),
    C13_networkRequests: performance.getEntriesByType('resource').map((e) => e.name)
      .filter((n) => !n.startsWith('data:')).slice(0, 10),
  }, null, 2);
})()
