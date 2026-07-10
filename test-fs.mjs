import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listDir, resolveGitRoot, clampToHome, PathDeniedError } from './src/backend/fs/explorer.ts';

const home = os.homedir();

// 1. listDir on ~/Programming excludes node_modules and dotfiles when showHidden=false
{
  const result = listDir(path.join(home, 'Programming'), false);
  assert.ok(Array.isArray(result.entries) && result.entries.length > 0, 'expected entries');
  assert.ok(
    !result.entries.some((e) => e.name === 'node_modules'),
    'node_modules must be excluded'
  );
  assert.ok(
    !result.entries.some((e) => e.name.startsWith('.')),
    'hidden entries must be excluded'
  );
}

// 2. clampToHome validation
{
  assert.strictEqual(clampToHome('/etc'), null, '/etc must be denied');
  assert.strictEqual(clampToHome(home + '/../..'), null, 'traversal above home must be denied');
  assert.strictEqual(
    clampToHome('~/Programming'),
    home + '/Programming',
    '~ expansion must resolve to home/Programming'
  );
}

// 3. dash-name regression guard: no '-' -> '/' transformation anywhere
{
  const raw = '~/Programming/novakai-seam';
  const clamped = clampToHome(raw);
  assert.strictEqual(clamped, home + '/Programming/novakai-seam', 'clampToHome must preserve dashes');
  const listing = listDir(clamped, false);
  assert.strictEqual(listing.path, home + '/Programming/novakai-seam', 'listDir path must be byte-identical, no dash decoding');
}

// 4. resolveGitRoot walks up to the mission-control repo root
{
  const result = resolveGitRoot(path.join(home, 'Programming/mission-control/package.json'));
  assert.ok(result.gitRoot && result.gitRoot.endsWith('/mission-control'), `expected gitRoot ending in /mission-control, got ${result.gitRoot}`);
}

// 5. listDir always includes '.claude' even when hidden entries are excluded
{
  const result = listDir(path.join(home, 'Programming/novakai'), false);
  assert.ok(
    result.entries.some((e) => e.name === '.claude'),
    '.claude must always be included'
  );
}

// 6. symlink escape guard: a link under $HOME pointing outside it is denied
{
  const linkPath = path.join(home, '.mc-audit-tmp-link');
  try {
    fs.symlinkSync('/etc', linkPath);
    assert.strictEqual(clampToHome(linkPath), null, 'symlink escaping home must be denied');
    assert.throws(() => listDir(linkPath, false), PathDeniedError, 'listDir on escaping symlink must throw PathDeniedError');
  } finally {
    try { fs.unlinkSync(linkPath); } catch { /* already gone */ }
  }
}

console.log('ALL PASS');
