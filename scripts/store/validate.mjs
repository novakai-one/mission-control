// Pure validation core for .novakai/stores — no filesystem, no process state.
// Operates on supplied snapshots; the impure edges live in store.mjs (facade).
import {
  STORE_KINDS, REF_KINDS, RESOLVABLE_REF_KINDS, KIND_RULES, TS_PATTERN,
  idPattern, TOMBSTONE_STATUS, TOMBSTONE_TARGET_KINDS, EVIDENCE_TARGET_KINDS,
} from './schema.mjs';

/**
 * @typedef {{code: string, message: string, storeFile: string, recordId?: string, line?: number}} Violation
 * @typedef {{line: number, raw: string, block: object}} StoreRecord
 * @typedef {{files: {[storeFile: string]: {records: StoreRecord[], violations: Violation[]}}}} Snapshot
 */

/** Parse raw store texts ({filename: text}) into a Snapshot. Pure. */
export function parseSnapshot(files) {
  const snapshot = { files: {} };
  for (const [storeFile, text] of Object.entries(files)) {
    const records = [];
    const violations = [];
    const lines = text.split('\n');
    if (text.length > 0 && !text.endsWith('\n')) {
      violations.push({
        code: 'LINE-BOUNDARY',
        message: 'file does not end with a newline — final line is unterminated',
        storeFile,
        line: lines.length,
      });
    } else {
      lines.pop(); // drop the empty tail after the final newline
    }
    lines.forEach((raw, i) => {
      if (raw.trim() === '') return;
      const line = i + 1;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        violations.push({ code: 'PARSE', message: `invalid JSON: ${error.message}`, storeFile, line });
        return;
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        violations.push({ code: 'PARSE', message: 'line is not a single JSON object', storeFile, line });
        return;
      }
      records.push({ line, raw, block: parsed });
    });
    snapshot.files[storeFile] = { records, violations };
  }
  return snapshot;
}

/** Index every id occurrence — ALL occurrences are kept so duplicates stay visible. */
export function buildIndex(snapshot) {
  const index = new Map();
  for (const [storeFile, { records }] of Object.entries(snapshot.files)) {
    for (const record of records) {
      const id = record.block.id;
      if (typeof id !== 'string' || id === '') continue;
      if (!index.has(id)) index.set(id, []);
      index.get(id).push({ storeFile, line: record.line, block: record.block });
    }
  }
  return index;
}

function resolveTarget(index, value, expectedKinds, addViolation, label) {
  const occurrences = index.get(value);
  if (!occurrences || occurrences.length === 0) {
    addViolation('REF-DANGLING', `${label} "${value}" resolves to no record in any store`);
    return;
  }
  if (occurrences.length > 1) {
    addViolation('REF-AMBIGUOUS', `${label} "${value}" matches ${occurrences.length} records (duplicated id)`);
    return;
  }
  const targetKind = occurrences[0].block.kind;
  if (!expectedKinds.includes(targetKind)) {
    addViolation('REF-WRONG-KIND', `${label} "${value}" is kind "${targetKind}", expected ${expectedKinds.join('|')}`);
  }
}

function validateRefs(block, index, addViolation) {
  if (block.refs === undefined) return;
  if (!Array.isArray(block.refs)) {
    addViolation('REF-SHAPE', '"refs" must be an array of typed refs');
    return;
  }
  block.refs.forEach((ref, i) => {
    const label = `refs[${i}]`;
    if (ref === null || typeof ref !== 'object' || Array.isArray(ref)) {
      addViolation('REF-SHAPE', `${label} is not a typed-ref object`);
      return;
    }
    if (!REF_KINDS.includes(ref.kind)) {
      addViolation('REF-SHAPE', `${label} kind "${ref.kind}" not in ${REF_KINDS.join('|')}`);
      return;
    }
    if (typeof ref.value !== 'string' || ref.value === '') {
      addViolation('REF-SHAPE', `${label} "value" must be a non-empty string`);
      return;
    }
    if (ref.label !== undefined && typeof ref.label !== 'string') {
      addViolation('REF-SHAPE', `${label} "label" must be a string when present`);
    }
    if (ref.kind === 'project' && !ref.value.startsWith('proj_')) {
      addViolation('REF-SHAPE', `${label} project refs must use the full proj_* id (AGENTS.md ref-integrity)`);
      return;
    }
    if (RESOLVABLE_REF_KINDS.includes(ref.kind)) {
      resolveTarget(index, ref.value, [ref.kind], addViolation, label);
    }
  });
}

function validateScalarRelation(block, field, expectedKinds, required, index, addViolation) {
  const value = block[field];
  if (value === undefined) {
    if (required) addViolation('RELATION-MISSING', `"${field}" is required${block.status ? ` when status is "${block.status}"` : ''}`);
    return;
  }
  if (typeof value !== 'string' || value === '') {
    addViolation('REF-SHAPE', `"${field}" must be a scalar id string`);
    return;
  }
  resolveTarget(index, value, expectedKinds, addViolation, `"${field}"`);
}

function validateEvidence(block, index, addViolation) {
  const evidence = block.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) {
    addViolation('RELATION-MISSING', 'a learning must carry a non-empty "evidence" array (AGENTS.md: evidence ref to a log entry or mission)');
    return;
  }
  let anchored = false;
  evidence.forEach((ref, i) => {
    const label = `evidence[${i}]`;
    if (ref === null || typeof ref !== 'object' || !REF_KINDS.includes(ref.kind) || typeof ref.value !== 'string' || ref.value === '') {
      addViolation('REF-SHAPE', `${label} is not a valid typed ref`);
      return;
    }
    if (EVIDENCE_TARGET_KINDS.includes(ref.kind)) {
      anchored = true;
      resolveTarget(index, ref.value, [ref.kind], addViolation, label);
    } else if (RESOLVABLE_REF_KINDS.includes(ref.kind)) {
      resolveTarget(index, ref.value, [ref.kind], addViolation, label);
    }
  });
  if (!anchored) {
    addViolation('RELATION-MISSING', `evidence must include at least one ref of kind ${EVIDENCE_TARGET_KINDS.join('|')}`);
  }
}

function validateNestedKrs(block, addViolation) {
  for (const [field, value] of Object.entries(block)) {
    if (!Array.isArray(value)) continue;
    if (value.some((item) => item !== null && typeof item === 'object' && item.kind === 'kr')) {
      addViolation('KR-SHAPE', `objective field "${field}" nests kr blocks — KRs are flat blocks in okrs.jsonl (AGENTS.md)`);
    }
  }
}

/**
 * Validate one block in the context of a store file and a cross-store id index.
 * Duplicate-id detection is contextual (audit/candidate), not part of this check.
 * @returns {Violation[]}
 */
export function validateBlock(block, { storeFile, index = new Map() }) {
  const violations = [];
  const recordId = typeof block.id === 'string' && block.id !== '' ? block.id : undefined;
  const addViolation = (code, message) => violations.push({ code, message, storeFile, recordId });

  if (recordId === undefined) addViolation('CORE-MISSING', '"id" is required and must be a non-empty string');
  const kind = block.kind;
  if (typeof kind !== 'string' || kind === '') {
    addViolation('CORE-MISSING', '"kind" is required and must be a non-empty string');
    return violations;
  }
  if (typeof block.ts !== 'string' || !TS_PATTERN.test(block.ts)) {
    addViolation('CORE-MISSING', '"ts" is required on every new write, ISO-8601 with offset (Chief ruling 3 — created/updated never substitute)');
  }
  if (recordId !== undefined && !idPattern(kind).test(recordId)) {
    addViolation('ID-FORMAT', `id "${recordId}" does not match the canonical shape for kind "${kind}" (${idPattern(kind)})`);
  }

  const allowedKinds = STORE_KINDS[storeFile];
  if (!allowedKinds) {
    addViolation('WRONG-STORE', `"${storeFile}" is not a recognized store file`);
  } else if (!allowedKinds.includes(kind)) {
    addViolation('WRONG-STORE', `kind "${kind}" is not allowed in ${storeFile} (allowed: ${allowedKinds.join(', ')})`);
  }

  validateRefs(block, index, addViolation);

  const rules = KIND_RULES[kind];
  if (!rules) return violations; // unknown kind already flagged via WRONG-STORE

  if (block.status === TOMBSTONE_STATUS) {
    // Ruling 4: tombstone = status "refiled" + scalar refiledTo; title optional.
    validateScalarRelation(block, 'refiledTo', TOMBSTONE_TARGET_KINDS, true, index, addViolation);
    return violations;
  }

  for (const field of rules.required) {
    if (block[field] === undefined) addViolation('FIELD-MISSING', `"${field}" is required for kind "${kind}"`);
  }
  for (const field of rules.arrays ?? []) {
    if (block[field] !== undefined && !Array.isArray(block[field])) {
      addViolation('FIELD-INVALID', `"${field}" must be an array`);
    }
  }
  for (const [field, allowed] of Object.entries(rules.enums ?? {})) {
    if (block[field] !== undefined && !allowed.includes(block[field])) {
      addViolation('FIELD-INVALID', `"${field}" must be one of ${allowed.join('|')}`);
    }
  }
  if (block.status !== undefined) {
    if (rules.statusSet) {
      if (!rules.statusSet.includes(block.status)) {
        addViolation('STATUS-UNKNOWN', `status "${block.status}" not in the documented set for kind "${kind}" (${rules.statusSet.join('|')}, or "${TOMBSTONE_STATUS}" as a tombstone)`);
      }
    } else if (typeof block.status !== 'string') {
      addViolation('FIELD-INVALID', '"status" must be a string');
    }
  }

  if (kind === 'learning') validateEvidence(block, index, addViolation);
  if (kind === 'kr' && block.objective !== undefined) {
    validateScalarRelation(block, 'objective', ['objective'], false, index, addViolation);
  }
  if (kind === 'request' && block.status === 'answered') {
    validateScalarRelation(block, 'decision', ['decision'], true, index, addViolation);
  }
  if (kind === 'objective') validateNestedKrs(block, addViolation);

  return violations;
}
