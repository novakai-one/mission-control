#!/usr/bin/env node
// Evidence collector A2 (mission_cli-process-map): static census of the
// backend HTTP surface. Scans src/backend/**/*.ts for Express route
// declarations (app/router .get/.post/.put/.delete/.patch with a quoted
// path) and router mounts (app.use('/path', …)), emitting method, path,
// and file:line. Static only — no server is started or probed.
//
//   node docs/reports/mission-lifecycle-map/evidence/route-census.mjs [repoRoot]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const backendDir = join(root, 'src', 'backend');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'tests' || name === 'node_modules' ? [] : walk(full);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : [];
  });
}

const routes = [];
const mounts = [];
for (const file of walk(backendDir)) {
  const rel = relative(root, file);
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    const cite = `${rel}:${index + 1}`;
    for (const match of line.matchAll(/\b(\w+)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g)) {
      if (match[3].startsWith('/')) routes.push({ method: match[2].toUpperCase(), path: match[3], receiver: match[1], cite });
    }
    for (const match of line.matchAll(/\b(\w+)\.use\(\s*['"`](\/[^'"`]*)['"`]/g)) {
      mounts.push({ receiver: match[1], path: match[2], cite });
    }
  });
}

routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
console.log(JSON.stringify({
  generated: new Date().toISOString(),
  method: 'static scan of src/backend/**/*.ts (tests excluded) for <recv>.<verb>(quoted-path) and <recv>.use(quoted-path)',
  routeCount: routes.length, routes, mounts,
}, null, 2));
