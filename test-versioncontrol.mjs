import assert from 'node:assert';
import { languageFromFiles, isDirtyPorcelain, getRepoInfo } from './src/backend/versionControl/index.ts';

// 1. Extension → language map: dominant by tracked-FILE-COUNT, pct of all files.
{
  const files = ['a.ts', 'b.ts', 'c.tsx', 'd.js', 'readme.md'];
  const lang = languageFromFiles(files);
  assert.strictEqual(lang.name, 'TypeScript', 'TypeScript dominates 3/5');
  assert.strictEqual(lang.pct, 60, 'pct = 3/5 = 60');
}

// 2. Unknown extensions are ignored; pct is still over ALL tracked files.
{
  const files = ['main.py', 'util.py', 'data.bin', 'notes.xyz'];
  const lang = languageFromFiles(files);
  assert.strictEqual(lang.name, 'Python', 'Python is the only known language');
  assert.strictEqual(lang.pct, 50, 'pct = 2/4 over all tracked files, not just known ones');
}

// 3. No known languages / empty input degrades to null.
{
  assert.strictEqual(languageFromFiles([]), null, 'empty file list ⇒ null');
  assert.strictEqual(languageFromFiles(['a.bin', 'b.xyz']), null, 'no known ext ⇒ null');
}

// 4. porcelain → dirty: any output ⇒ dirty; blank/whitespace ⇒ clean.
{
  assert.strictEqual(isDirtyPorcelain(' M src/x.ts\n'), true, 'modified file ⇒ dirty');
  assert.strictEqual(isDirtyPorcelain('?? new.ts\n'), true, 'untracked file ⇒ dirty');
  assert.strictEqual(isDirtyPorcelain(''), false, 'empty porcelain ⇒ clean');
  assert.strictEqual(isDirtyPorcelain('   \n  \n'), false, 'whitespace-only ⇒ clean');
}

// 5. Independent degradation: this repo is git ⇒ isGitRepo true, name resolves,
//    and git fields are either a value or independently null (never a throw).
{
  const info = await getRepoInfo(process.cwd());
  assert.strictEqual(info.isGitRepo, true, 'repo cwd is a git repo');
  assert.ok(typeof info.name === 'string' && info.name.length > 0, 'name resolved');
  assert.ok(info.gitRoot !== null, 'gitRoot resolved for a git repo');
  // Each field is independently either the right type or null.
  assert.ok(info.branch === null || typeof info.branch === 'string', 'branch: string|null');
  assert.ok(info.dirty === null || typeof info.dirty === 'boolean', 'dirty: boolean|null');
  assert.ok(info.trackedFiles === null || typeof info.trackedFiles === 'number', 'trackedFiles: number|null');
  assert.ok(info.language === null || typeof info.language.name === 'string', 'language: {name}|null');
}

console.log('test-versioncontrol: all assertions passed');
