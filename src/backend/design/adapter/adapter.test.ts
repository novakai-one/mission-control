import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesignAdapter, designRoot, sanitizeFragment } from './index.js';

function craftedRoot(sceneFile: string, duplicate = false, identity?: { sceneId: string; rootId: string }): string {
  const root = mkdtempSync(join(tmpdir(), 'design-adapter-'));
  const projectDir = join(root, 'projects', 'crafted');
  mkdirSync(projectDir, { recursive: true });
  const reference = { sceneId: identity?.sceneId ?? 'scene-a', rootId: identity?.rootId ?? 'node-a', file: sceneFile };
  writeFileSync(join(projectDir, 'prototype.json'), JSON.stringify({
    formatVersion: 2,
    document: { documentId: 'crafted', revision: 1, schemaVersion: 3 },
    sources: { scenes: duplicate ? [reference, { ...reference, sceneId: 'scene-b' }] : [reference], classes: [] },
  }), 'utf8');
  return root;
}

// Manifest source paths are untrusted: traversal, absolute paths, foreign
// prefixes, and duplicates must be rejected BEFORE any file read — the
// render degrades to an honest stale error, never an out-of-root read.
{
  const hexDigest = 'a'.repeat(64);
  for (const attack of [
    '../../../../etc/passwd',
    `/etc/passwd`,
    `scenes/../secrets.json`,
    `classes/${hexDigest}.json`,
    `scenes/${hexDigest}.txt`,
    `scenes/UPPER${hexDigest.slice(5)}.json`,
  ]) {
    const adapter = new DesignAdapter(craftedRoot(attack));
    const render = await adapter.renderProject('crafted');
    assert.ok(render, `crafted project resolves for ${attack}`);
    assert.equal(render.stale, true, `rejected: ${attack}`);
    assert.match(render.error ?? '', /invalid source path/);
  }
  const adapter = new DesignAdapter(craftedRoot(`scenes/${hexDigest}.json`, true));
  const render = await adapter.renderProject('crafted');
  assert.equal(render?.stale, true);
  assert.match(render?.error ?? '', /duplicates source path/);
}

// Hostile scene/root IDs (markup or selector syntax) are rejected at the
// boundary — they must never reach the frontend, which compares them against
// DOM attributes and would otherwise carry injection risk.
{
  const hexDigest = 'b'.repeat(64);
  for (const hostile of [
    { sceneId: 'scene-a', rootId: 'x"]</style><img onerror=alert(1)>' },
    { sceneId: 'scene "a"', rootId: 'node-a' },
    { sceneId: 'scene-a', rootId: 'node a; } * { display: block' },
  ]) {
    const adapter = new DesignAdapter(craftedRoot(`scenes/${hexDigest}.json`, false, hostile));
    const render = await adapter.renderProject('crafted');
    assert.equal(render?.stale, true, `rejected hostile id ${JSON.stringify(hostile)}`);
    assert.match(render?.error ?? '', /invalid id/);
  }
}

// Sanitizer: nothing executable or frame-like crosses the adapter boundary.
{
  const dirty = '<div data-nb-id="node-1" onclick="steal()"><script>evil()</script>'
    + '<iframe src="https://x"></iframe><a href="javascript:run()">go</a>'
    + '<img src="ok.png" onerror=pwn()><p onmouseover=\'x()\'>text</p></div>';
  const clean = sanitizeFragment(dirty);
  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('<iframe'), false);
  assert.equal(/\bon[a-z]+\s*=/.test(clean), false);
  assert.equal(clean.includes('javascript:'), false);
  assert.equal(clean.includes('data-nb-id="node-1"'), true, 'benign attributes survive');
  assert.equal(clean.includes('ok.png'), true, 'benign sources survive');
  assert.equal(clean.includes('text'), true, 'text content survives');
}

// data-goto interaction edges (the format's declared link grammar) survive.
{
  const clean = sanitizeFragment('<button data-goto="scene-library" data-nb-id="node-2">Open</button>');
  assert.equal(clean.includes('data-goto="scene-library"'), true);
}

// Unknown project ids resolve to null, and traversal never escapes the root.
{
  const adapter = new DesignAdapter('/nonexistent-root');
  assert.equal(adapter.available(), false);
  assert.equal(await adapter.renderProject('anything'), null);
  assert.equal(await adapter.renderProject('../../../etc'), null);
}

// Smoke test against the real sibling checkout when present (CI-safe skip).
const root = designRoot();
if (existsSync(root)) {
  const adapter = new DesignAdapter(root);
  const projects = await adapter.listProjects();
  assert.equal(projects.length > 0, true, 'discovers at least one format-v2 project');

  const demo = projects.find((project) => project.id === 'source-v2-demo');
  if (demo) {
    const render = await adapter.renderProject(demo.id);
    assert.ok(render);
    assert.equal(render.stale, false);
    assert.equal(render.scenes.length > 0, true);
    assert.equal(render.fragment.includes(`data-nb-id="${render.scenes[0].rootId}"`), true, 'fragment carries scene roots');
    assert.equal(render.css.length > 0, true);
    assert.equal(render.revision.length, 12);

    // Second render after a failure path: unknown files serve the last good copy.
    const missing = await adapter.renderProject('no-such-project');
    assert.equal(missing, null);
  }
  console.log(`design adapter: ok (${projects.length} projects discovered)`);
} else {
  console.log('design adapter: ok (sanitizer + discovery guards; sibling checkout absent)');
}
