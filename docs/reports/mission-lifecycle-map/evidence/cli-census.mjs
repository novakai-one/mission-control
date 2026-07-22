#!/usr/bin/env node
// Evidence collector A1 (mission_cli-process-map): static census of every
// nvk-* CLI's verb + flag surface. Parses the scripts' own contract text —
// dispatch comparisons, usage strings, flag literals, header doc comments —
// with file:line citations. Purely static: nothing is executed, so
// daemon-starting verbs (watchdog watch, oversee watch) are never triggered.
//
//   node docs/reports/mission-lifecycle-map/evidence/cli-census.mjs [repoRoot]
//
// Output: JSON on stdout (redirect to cli-census.json to refresh evidence).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const scriptsDir = join(root, 'scripts');

const cliFiles = readdirSync(scriptsDir).filter((f) => f.startsWith('nvk-') && f.endsWith('.mjs'));
const teamDir = join(scriptsDir, 'team');
const teamFiles = readdirSync(teamDir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));

function census(filePath, relPath) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const entry = { file: relPath, verbs: [], flags: [], usage: [], headerDoc: [], exports: [] };
  const seenVerbs = new Set();
  const seenFlags = new Set();
  lines.forEach((line, index) => {
    const cite = `${relPath}:${index + 1}`;
    // Dispatch comparisons: <anyCmdVar> ===/!== 'x' (covers cmd, command,
    // roomCommand, mode, sub…), plus default verbs from `shift() ?? 'x'`.
    for (const match of line.matchAll(/(?:cmd|sub|command|verb|action|mode)\s*[!=]==?\s*'([a-z][\w-]*)'/gi)) {
      if (!seenVerbs.has(match[1])) { seenVerbs.add(match[1]); entry.verbs.push({ verb: match[1], cite }); }
    }
    for (const match of line.matchAll(/\.shift\(\)\s*\?\?\s*'([a-z][\w-]*)'/g)) {
      if (!seenVerbs.has(match[1])) { seenVerbs.add(match[1]); entry.verbs.push({ verb: match[1], cite, via: 'default' }); }
    }
    for (const match of line.matchAll(/^\s*case '([a-z][\w-]*)':/g)) {
      if (!seenVerbs.has(match[1])) { seenVerbs.add(match[1]); entry.verbs.push({ verb: match[1], cite, via: 'case' }); }
    }
    // Flag literals
    for (const match of line.matchAll(/'(--[a-z][\w-]*)'/g)) {
      if (!seenFlags.has(match[1])) { seenFlags.add(match[1]); entry.flags.push({ flag: match[1], cite }); }
    }
    // Usage strings — the CLI's self-declared contract
    if (/usage:/i.test(line)) entry.usage.push({ text: line.trim().replace(/^.*?(['"`])(.*)\1.*$/, '$2'), cite });
    // Header doc comment (first 25 lines, // comments)
    if (index < 25 && /^\/\//.test(line.trim())) entry.headerDoc.push(line.trim().replace(/^\/\/ ?/, ''));
    // Module exports (for team/ helpers)
    const exp = line.match(/^export (?:async )?(?:function|class|const) (\w+)/);
    if (exp) entry.exports.push({ name: exp[1], cite });
  });
  return entry;
}

const report = {
  generated: new Date().toISOString(),
  method: 'static parse of dispatch comparisons, case labels, --flag literals, usage: strings, header comments, exports',
  clis: cliFiles.map((f) => census(join(scriptsDir, f), `scripts/${f}`)),
  teamHelpers: teamFiles.map((f) => census(join(teamDir, f), `scripts/team/${f}`)),
};
console.log(JSON.stringify(report, null, 2));
