#!/usr/bin/env node
// nvk-store — the sanctioned way in and the honest mirror of .novakai/stores.
//   audit  --dir <storeDir> [--jsonl]                  read-only, stdout-only
//   append --dir <storeDir> --store <file> [--line s]  one raw JSON line (or stdin)
// Exit codes: 0 clean/accepted · 1 findings/rejected · 2 refused/unusable input.
// Audit output goes to stdout ONLY — no output-file option exists, so no audit
// artifact can ever resolve into the store directory (SC3 by construction).
import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDir, appendLine, StoreValidationError, StoreRefusalError } from './store/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const options = { verb };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--dir') options.dir = rest[++i];
    else if (rest[i] === '--store') options.store = rest[++i];
    else if (rest[i] === '--line') options.line = rest[++i];
    else if (rest[i] === '--baseline') options.baseline = rest[++i];
    else if (rest[i] === '--jsonl') options.jsonl = true;
    else {
      console.error(`unknown argument: ${rest[i]}`);
      process.exit(2);
    }
  }
  return options;
}

/**
 * F1 containment: id enrollment targets the repo baseline ONLY when the append
 * dir IS this repo's canonical .novakai/stores — an append into any other dir
 * (temp fixtures, foreign checkouts) must never touch it. An explicit
 * --baseline always wins.
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

async function readStdinRaw() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let text = Buffer.concat(chunks).toString('utf8');
  if (text.endsWith('\n')) text = text.slice(0, -1); // strip exactly one trailing newline
  return text;
}

function printHumanAudit(dir, audit, checksums) {
  console.log(`store audit — ${dir}`);
  console.log(`files: ${Object.keys(checksums).length}, findings: ${audit.findings.length} findings`);
  const byStore = {};
  for (const finding of audit.findings) {
    byStore[finding.storeFile] = byStore[finding.storeFile] ?? [];
    byStore[finding.storeFile].push(finding);
  }
  for (const [storeFile, findings] of Object.entries(byStore)) {
    console.log(`\n${storeFile} (${findings.length})`);
    for (const finding of findings) {
      console.log(`  :${finding.line ?? '?'} ${finding.recordId ?? '(no id)'} [${finding.code}] ${finding.message}`);
    }
  }
  if (Object.keys(audit.countsByCode).length > 0) {
    console.log(`\ncounts by code: ${JSON.stringify(audit.countsByCode)}`);
  }
  console.log(`status census (info): ${JSON.stringify(audit.statusCensus)}`);
  console.log('\nsha256 (SC4-verified stable during read):');
  for (const [file, hash] of Object.entries(checksums)) console.log(`  ${hash}  ${file}`);
}

function printJsonlAudit(dir, audit, checksums) {
  const runSlug = randomUUID().slice(0, 8);
  const runId = `audit-run_${runSlug}`;
  const ts = new Date().toISOString();
  console.log(JSON.stringify({
    id: runId,
    kind: 'audit-run',
    ts,
    storeDir: dir,
    files: Object.keys(checksums).length,
    findings: audit.findings.length,
    countsByCode: audit.countsByCode,
    countsByStore: audit.countsByStore,
    statusCensus: audit.statusCensus,
    checksums,
    schemaVersion: 1,
  }));
  audit.findings.forEach((finding, index) => {
    console.log(JSON.stringify({
      id: `audit-finding_${runSlug}-${index + 1}`,
      kind: 'audit-finding',
      ts,
      run: runId,
      store: finding.storeFile,
      ...(finding.recordId !== undefined ? { recordId: finding.recordId } : {}),
      ...(finding.line !== undefined ? { line: finding.line } : {}),
      code: finding.code,
      message: finding.message,
    }));
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.verb === 'audit') {
    if (!options.dir || !existsSync(options.dir) || !statSync(options.dir).isDirectory()) {
      console.error(`audit: store directory not found: ${options.dir ?? '(missing --dir)'}`);
      process.exit(2);
    }
    const { audit, checksums } = auditDir(options.dir);
    if (options.jsonl) printJsonlAudit(options.dir, audit, checksums);
    else printHumanAudit(options.dir, audit, checksums);
    process.exit(audit.findings.length > 0 ? 1 : 0);
  }
  if (options.verb === 'append') {
    if (!options.dir || !options.store) {
      console.error('append: --dir and --store are required');
      process.exit(2);
    }
    const rawLine = options.line ?? await readStdinRaw();
    try {
      const result = appendLine(options.dir, options.store, rawLine, {
        baselinePath: resolveEnrollmentBaseline(options),
      });
      console.log(JSON.stringify({ appended: result.id, store: result.storeFile, bytes: result.bytesAppended }));
      process.exit(0);
    } catch (error) {
      if (error instanceof StoreValidationError) {
        for (const violation of error.violations) {
          console.error(`[${violation.code}] ${violation.message}`);
        }
        process.exit(1);
      }
      if (error instanceof StoreRefusalError) {
        console.error(`refused: ${error.message}`);
        process.exit(2);
      }
      throw error;
    }
  }
  console.error('usage: nvk-store.mjs audit --dir <storeDir> [--jsonl] | append --dir <storeDir> --store <file> [--line <raw>] [--baseline <file>]');
  process.exit(2);
}

await main();
