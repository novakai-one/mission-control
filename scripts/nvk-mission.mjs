#!/usr/bin/env node
// nvk-mission — file a mission end-to-end through the store engine.
//   create --dir <storeDir> --id mission_<slug> --title "..." --owner <name>
//          [--status todo] [--priority <p>] [--notes "..."] [--project proj_<slug>]
//          [--ref <kind>=<value>[|<label>]]... [--team-name "..."] [--team-id team_<slug>]
//          [--task "<title>" --agent agent_<id>]... [--baseline <file>] [--dry-run]
// One filing = mission row + optional team row + optional task rows, appended in
// ref-dependency order (mission → team → tasks) so every ref resolves at its
// append moment. Thin-adapter law (nvk-store.mjs precedent): no validation is
// re-implemented here — the engine's appendLine is the only judge. The store is
// append-only: there is no rollback; the preflight refuses id collisions before
// the first byte, and a later failure reports PARTIAL FILING honestly.
// M1 (validate.mjs validateTaskAuthority, write-strict): a new mission task must
// ref exactly one agreeing agent — so --task requires --agent, and filing tasks
// for a BRAND-NEW mission only works once its agents exist (file mission + team
// → spawn agents → file tasks). The engine, not this adapter, judges agreement.
// Exit codes: 0 filed clean · 1 rejected (stderr has why) · 2 refused/usage.
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLine, readStoreDir, StoreValidationError, StoreRefusalError } from '../src/backend/stores/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const options = { verb, refs: [], tasks: [] };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--dir') options.dir = rest[++i];
    else if (rest[i] === '--id') options.id = rest[++i];
    else if (rest[i] === '--title') options.title = rest[++i];
    else if (rest[i] === '--owner') options.owner = rest[++i];
    else if (rest[i] === '--status') options.status = rest[++i];
    else if (rest[i] === '--priority') options.priority = rest[++i];
    else if (rest[i] === '--notes') options.notes = rest[++i];
    else if (rest[i] === '--project') options.project = rest[++i];
    else if (rest[i] === '--ref') options.refs.push(rest[++i]);
    else if (rest[i] === '--team-name') options.teamName = rest[++i];
    else if (rest[i] === '--team-id') options.teamId = rest[++i];
    else if (rest[i] === '--task') options.tasks.push(rest[++i]);
    else if (rest[i] === '--agent') options.agent = rest[++i];
    else if (rest[i] === '--baseline') options.baseline = rest[++i];
    else if (rest[i] === '--dry-run') options.dryRun = true;
    else fail(2, `unknown argument: ${rest[i]}`);
  }
  return options;
}

/** --ref <kind>=<value>[|<label>] — first '=' splits kind, last '|' splits label. */
function parseRef(raw) {
  const eq = raw.indexOf('=');
  if (eq < 1) fail(2, `--ref must be <kind>=<value>[|<label>]: ${raw}`);
  const kind = raw.slice(0, eq);
  const rest = raw.slice(eq + 1);
  const pipe = rest.lastIndexOf('|');
  if (pipe === -1) return { kind, value: rest };
  return { kind, value: rest.slice(0, pipe), label: rest.slice(pipe + 1) };
}

/** One filing = one ts; every row shares it. */
function buildRows(options) {
  const ts = new Date().toISOString();
  const slug = options.id.replace(/^mission_/, '');
  const refs = [];
  if (options.project) refs.push({ kind: 'project', value: options.project });
  for (const raw of options.refs) refs.push(parseRef(raw));
  const mission = {
    id: options.id, kind: 'mission', ts, title: options.title,
    status: options.status ?? 'todo',
    ...(options.priority !== undefined ? { priority: options.priority } : {}),
    owner: options.owner,
    ...(refs.length > 0 ? { refs } : {}),
    ...(options.notes !== undefined ? { notes: options.notes } : {}),
  };
  const rows = [{ storeFile: 'missions.jsonl', block: mission }];
  if (options.teamName !== undefined) {
    rows.push({ storeFile: 'teams.jsonl', block: {
      id: options.teamId ?? `team_${slug}`, kind: 'team', ts, name: options.teamName,
      refs: [{ kind: 'mission', value: options.id }],
    } });
  }
  options.tasks.forEach((title, index) => {
    rows.push({ storeFile: 'tasks.jsonl', block: {
      id: `task_${slug}-${index + 1}`, kind: 'task', ts, title, status: 'todo', updated: ts,
      refs: [{ kind: 'mission', value: options.id }, { kind: 'agent', value: options.agent }],
    } });
  });
  return rows;
}

/**
 * Refuse-before-first-byte: the engine would catch a team/task id collision only
 * AFTER the mission row landed (append-only, no rollback) — so collisions across
 * the whole planned filing are checked against one snapshot up front. No store
 * law is re-implemented: existence is a fact of the snapshot, not a judgment.
 */
function preflight(dir, rows) {
  const snapshot = readStoreDir(realpathSync(dir));
  const existing = new Set();
  for (const file of Object.values(snapshot.files)) {
    for (const record of file.records) {
      if (typeof record.block.id === 'string') existing.add(record.block.id);
    }
  }
  const problems = [];
  const planned = new Set();
  for (const { block } of rows) {
    if (existing.has(block.id)) problems.push(`id "${block.id}" already exists in the store`);
    if (planned.has(block.id)) problems.push(`id "${block.id}" appears twice in this filing`);
    planned.add(block.id);
  }
  return problems;
}

/**
 * F1 containment — twin of resolveEnrollmentBaseline in scripts/nvk-store.mjs
 * (duplicated: that file is outside this mission's ownership fence; the shared
 * scripts/ lib is recorded DRY debt). Explicit --baseline always wins; default
 * enrollment fires ONLY when --dir IS this repo's canonical stores dir.
 */
function resolveEnrollmentBaseline(options) {
  if (options.baseline) return options.baseline;
  const repoBaseline = path.join(ROOT, 'stores-baseline.json');
  if (!existsSync(repoBaseline)) return undefined;
  try {
    const canonical = realpathSync(path.join(ROOT, '.novakai', 'stores'));
    return realpathSync(options.dir) === canonical ? repoBaseline : undefined;
  } catch {
    return undefined; // canonical dir absent (worktrees) — never enroll by default
  }
}

function create(options) {
  for (const flag of ['dir', 'id', 'title', 'owner']) {
    if (options[flag] === undefined) fail(2, `create: --${flag} is required`);
  }
  if (!options.id.startsWith('mission_')) fail(2, `create: --id must start with "mission_": ${options.id}`);
  if (options.teamId !== undefined && options.teamName === undefined) {
    fail(2, 'create: --team-id requires --team-name');
  }
  if (options.tasks.length > 0 && options.agent === undefined) {
    fail(2, 'create: --task requires --agent (M1: a new mission task must ref exactly one agent)');
  }
  let rows;
  try {
    rows = buildRows(options);
    const problems = preflight(options.dir, rows);
    if (problems.length > 0) {
      for (const problem of problems) console.error(problem);
      process.exit(1);
    }
  } catch (error) {
    fail(2, `refused: ${error.message}`);
  }
  if (options.dryRun) {
    for (const { storeFile, block } of rows) {
      console.log(JSON.stringify({ wouldAppend: block.id, store: storeFile, line: JSON.stringify(block) }));
    }
    process.exit(0);
  }
  const baselinePath = resolveEnrollmentBaseline(options);
  const appended = [];
  for (const { storeFile, block } of rows) {
    try {
      const result = appendLine(options.dir, storeFile, JSON.stringify(block), { baselinePath });
      appended.push(result.id);
      console.log(JSON.stringify({ appended: result.id, store: storeFile, bytes: result.bytesAppended }));
    } catch (error) {
      if (appended.length > 0) {
        console.error(`PARTIAL FILING: already appended ${appended.join(', ')} — the store is append-only; fix the rejected row and complete the filing via scripts/nvk-store.mjs append`);
      }
      if (error instanceof StoreValidationError) {
        for (const violation of error.violations) console.error(`[${violation.code}] ${violation.message}`);
        process.exit(1);
      }
      if (error instanceof StoreRefusalError) fail(2, `refused: ${error.message}`);
      throw error;
    }
  }
  process.exit(0);
}

const options = parseArgs(process.argv.slice(2));
if (options.verb === 'create') create(options);
fail(2, 'usage: nvk-mission.mjs create --dir <storeDir> --id mission_<slug> --title "..." --owner <name> [--status <s>] [--priority <p>] [--notes "..."] [--project proj_<slug>] [--ref <kind>=<value>[|<label>]]... [--team-name "..."] [--team-id team_<slug>] [--task "<title>" --agent agent_<id>]... [--baseline <file>] [--dry-run]');
