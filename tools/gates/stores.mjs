#!/usr/bin/env node
// Store drift gate — fingerprint baseline, not a count (a count lets violations
// migrate; see the ponytail note in standards.mjs). FAILs on any violation
// fingerprint not in the baseline, even when old ones vanished, and on any
// baseline-inventoried id that disappeared (ids never disappear — tombstone).
// Vanished fingerprints are shrink: reported, ratchet down with --update.
// Read-only against the stores; the only file it ever writes is the baseline,
// and only on --update.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDir } from '../../src/backend/stores/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const options = {
    dir: path.join(ROOT, '.novakai', 'stores'),
    baseline: path.join(ROOT, 'stores-baseline.json'),
    update: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') options.dir = argv[++i];
    else if (argv[i] === '--baseline') options.baseline = argv[++i];
    else if (argv[i] === '--update') options.update = true;
    else {
      console.error(`unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  return options;
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const fingerprintOf = (finding) => sha256(
  `${finding.storeFile}\u0000${finding.recordId ?? `line:${finding.line}`}\u0000${finding.code}`,
);

function collectIds(snapshot) {
  const ids = new Set();
  for (const { records } of Object.values(snapshot.files)) {
    for (const record of records) {
      if (typeof record.block.id === 'string' && record.block.id !== '') ids.add(record.block.id);
    }
  }
  return ids;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.dir) || !statSync(options.dir).isDirectory()) {
    console.error(`stores gate: store directory not found: ${options.dir}`);
    process.exit(2);
  }
  const { audit, snapshot } = auditDir(options.dir);
  const currentIds = collectIds(snapshot);
  const fingerprints = new Map(); // fingerprint → representative finding
  for (const finding of audit.findings) {
    fingerprints.set(fingerprintOf(finding), finding);
  }

  if (options.update || !existsSync(options.baseline)) {
    if (!options.update) {
      console.error(`stores gate: no baseline at ${options.baseline} — run with --update to enroll the current census`);
      process.exit(2);
    }
    writeFileSync(options.baseline, JSON.stringify({
      version: 1,
      fingerprints: [...fingerprints.keys()].sort(),
      ids: [...currentIds].sort(),
    }) + '\n');
    console.log(`baseline written: ${fingerprints.size} fingerprints, ${currentIds.size} ids`);
    return;
  }

  const baseline = JSON.parse(readFileSync(options.baseline, 'utf8'));
  const baselineFingerprints = new Set(baseline.fingerprints);
  const fresh = [...fingerprints.entries()].filter(([fingerprint]) => !baselineFingerprints.has(fingerprint));
  const missingIds = baseline.ids.filter((id) => !currentIds.has(id));
  const vanished = baseline.fingerprints.filter((fingerprint) => !fingerprints.has(fingerprint));

  if (fresh.length > 0 || missingIds.length > 0) {
    if (fresh.length > 0) {
      console.error(`FAIL: ${fresh.length} new violation fingerprint(s) not in baseline:`);
      for (const [, finding] of fresh) {
        console.error(`  ${finding.storeFile}:${finding.line ?? '?'} ${finding.recordId ?? '(no id)'} [${finding.code}] ${finding.message}`);
      }
    }
    if (missingIds.length > 0) {
      console.error(`FAIL: ${missingIds.length} inventoried id(s) disappeared — an id once referenced never disappears; file a tombstone instead:`);
      for (const id of missingIds) console.error(`  ${id}`);
    }
    process.exit(1);
  }
  if (vanished.length > 0) {
    console.log(`PASS: at baseline; ${vanished.length} fingerprint(s) vanished (drift shrunk) — run with --update to ratchet down`);
    return;
  }
  console.log(`PASS: at baseline (${fingerprints.size} known fingerprints, ${currentIds.size} ids inventoried)`);
}

main();
