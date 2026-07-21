import assert from 'node:assert/strict';
import { parseSnapshot, buildIndex, validateBlock } from './validate.mjs';

// --- helpers -----------------------------------------------------------------

const TS = '2026-07-21T12:00:00+10:00';

/** Minimal fully-valid block per kind (KIND_RULES known-valid shapes). */
const VALID = {
  decision: { id: 'DEC-2026-07-21-001', kind: 'decision', ts: TS, title: 'T', body: 'B' },
  request: { id: 'request_probe', kind: 'request', ts: TS, question: 'Q?', options: ['a', 'b'], status: 'pending' },
  mission: { id: 'mission_probe', kind: 'mission', ts: TS, title: 'T', owner: 'chief-kimi' },
  task: { id: 'task_probe', kind: 'task', ts: TS, title: 'T', status: 'todo' },
  log: { id: 'log_2026-07-21-900', kind: 'log', ts: TS, body: 'observed X' },
  learning: {
    id: 'learning_probe', kind: 'learning', ts: TS, body: 'L',
    evidence: [{ kind: 'log', value: 'log_2026-07-21-900' }],
  },
  objective: { id: 'okr_probe', kind: 'objective', ts: TS, title: 'O', horizon: 'now' },
  kr: { id: 'kr_probe_1', kind: 'kr', ts: TS, objective: 'okr_probe', body: 'K' },
  project: { id: 'proj_probe', kind: 'project', ts: TS, title: 'P', status: 'active', path: '/tmp/x' },
  issue: { id: 'issue_probe', kind: 'issue', ts: TS },
};

const STORE_OF = {
  decision: 'decisions.jsonl', request: 'requests.jsonl', mission: 'missions.jsonl',
  task: 'tasks.jsonl', log: 'captains-log.jsonl', learning: 'learnings.jsonl',
  objective: 'okrs.jsonl', kr: 'okrs.jsonl', project: 'projects.jsonl', issue: 'issues.jsonl',
};

function snapshotOf(blocks) {
  const files = {};
  for (const block of blocks) {
    const file = STORE_OF[block.kind];
    files[file] = (files[file] ?? '') + JSON.stringify(block) + '\n';
  }
  return parseSnapshot(files);
}

function codes(violations) {
  return violations.map((violation) => violation.code).sort();
}

function validateIn(block, extraBlocks = []) {
  const snapshot = snapshotOf([...Object.values(VALID), ...extraBlocks]);
  return validateBlock(block, { storeFile: STORE_OF[block.kind], index: buildIndex(snapshot) });
}

// --- parse + line boundary ---------------------------------------------------

{
  const snapshot = parseSnapshot({ 'tasks.jsonl': 'not json\n' + JSON.stringify(VALID.task) + '\n' });
  const parseViolations = snapshot.files['tasks.jsonl'].violations;
  assert.equal(parseViolations.length, 1);
  assert.equal(parseViolations[0].code, 'PARSE');
  assert.equal(parseViolations[0].line, 1);
  assert.equal(snapshot.files['tasks.jsonl'].records.length, 1); // valid line still parsed
}
{
  // array / scalar lines are PARSE violations too — a line must be one JSON object
  const snapshot = parseSnapshot({ 'tasks.jsonl': '[1,2]\n"str"\n' });
  assert.deepEqual(codes(snapshot.files['tasks.jsonl'].violations), ['PARSE', 'PARSE']);
}
{
  // file whose final line is unterminated → LINE-BOUNDARY
  const snapshot = parseSnapshot({ 'tasks.jsonl': JSON.stringify(VALID.task) });
  assert.deepEqual(codes(snapshot.files['tasks.jsonl'].violations), ['LINE-BOUNDARY']);
}

// --- core shape --------------------------------------------------------------

{
  const violations = validateIn({ ...VALID.task, id: 'task_core-a' });
  assert.deepEqual(violations, []);
}
{
  const { id, ...rest } = VALID.task;
  assert.deepEqual(codes(validateIn(rest)), ['CORE-MISSING']);
}
{
  const { kind, ...rest } = VALID.task;
  assert.ok(codes(validateIn(rest)).includes('CORE-MISSING'));
}
{
  // ts REQUIRED (Chief ruling 3) — created/updated never substitute
  const { ts, ...rest } = { ...VALID.task, id: 'task_core-b', created: TS, updated: TS };
  assert.deepEqual(codes(validateIn(rest)), ['CORE-MISSING']);
}
{
  // ts must be ISO-8601 with offset
  assert.deepEqual(codes(validateIn({ ...VALID.task, id: 'task_core-c', ts: '2026-07-21' })), ['CORE-MISSING']);
  assert.deepEqual(codes(validateIn({ ...VALID.task, id: 'task_core-d', ts: '2026-07-21T12:00:00' })), ['CORE-MISSING']);
  assert.deepEqual(validateIn({ ...VALID.task, id: 'task_core-e', ts: '2026-07-21T02:00:00Z' }), []);
}

// --- id formats (Chief rulings 1 + 2) ---------------------------------------

{
  assert.deepEqual(codes(validateIn({ ...VALID.task, id: 'wrongprefix_x' })), ['ID-FORMAT']);
  assert.deepEqual(codes(validateIn({ ...VALID.decision, id: 'decision_x' })), ['ID-FORMAT']); // DEC-* is canonical
  assert.deepEqual(validateIn({ ...VALID.decision, id: 'DEC-2026-07-21-002' }), []);
  assert.deepEqual(codes(validateIn({ ...VALID.objective, id: 'objective_x', title: 'O' })), ['ID-FORMAT']); // okr_* is canonical
  assert.deepEqual(validateIn({ ...VALID.objective, id: 'okr_other' }), []);
  assert.deepEqual(codes(validateIn({ ...VALID.project, id: 'project_x' })), ['ID-FORMAT']); // full proj_*
  assert.deepEqual(codes(validateIn({ ...VALID.task, id: 'task_' })), ['ID-FORMAT']); // empty slug
}

// --- wrong store -------------------------------------------------------------

{
  const snapshot = snapshotOf(Object.values(VALID));
  const index = buildIndex(snapshot);
  const violations = validateBlock({ ...VALID.task, id: 'task_wrong-store' }, { storeFile: 'missions.jsonl', index });
  assert.deepEqual(codes(violations), ['WRONG-STORE']);
  // unknown store file name is WRONG-STORE at validation level too
  const unknownStore = validateBlock({ ...VALID.task, id: 'task_unknown-store' }, { storeFile: 'nope.jsonl', index });
  assert.deepEqual(codes(unknownStore), ['WRONG-STORE']);
}

// --- statuses (documented sets enforce; ruling 5 = shape-only for the rest) --

{
  assert.deepEqual(codes(validateIn({ ...VALID.task, id: 'task_status-a', status: 'doing' })), ['STATUS-UNKNOWN']);
  assert.deepEqual(codes(validateIn({ ...VALID.request, id: 'request_status-a', status: 'open' })), ['STATUS-UNKNOWN']);
  assert.deepEqual(validateIn({ ...VALID.request, id: 'request_status-b', status: 'answered', decision: 'DEC-2026-07-21-001' }), []);
  // shape-only kinds: any string status passes; non-string status is invalid
  assert.deepEqual(validateIn({ ...VALID.mission, id: 'mission_status-a', status: 'retired' }), []);
  assert.deepEqual(codes(validateIn({ ...VALID.mission, id: 'mission_status-b', status: 42 })), ['FIELD-INVALID']);
}

// --- per-kind required fields + horizon --------------------------------------

{
  const { title, ...rest } = { ...VALID.mission, id: 'mission_field-a' };
  assert.deepEqual(codes(validateIn(rest)), ['FIELD-MISSING']);
  const { horizon, ...objectiveRest } = { ...VALID.objective, id: 'okr_field-a' };
  assert.deepEqual(codes(validateIn(objectiveRest)), ['FIELD-MISSING']);
  assert.deepEqual(codes(validateIn({ ...VALID.objective, id: 'okr_field-b', horizon: 'someday' })), ['FIELD-INVALID']);
  const { options, ...requestRest } = { ...VALID.request, id: 'request_field-a' };
  assert.deepEqual(codes(validateIn(requestRest)), ['FIELD-MISSING']);
  assert.deepEqual(codes(validateIn({ ...VALID.request, id: 'request_field-b', options: 'not-an-array' })), ['FIELD-INVALID']);
}

// --- tombstone (Chief ruling 4: status refiled + scalar refiledTo, title optional) --

{
  const tombstone = { id: 'task_tomb-a', kind: 'task', ts: TS, status: 'refiled', refiledTo: 'mission_probe', updated: TS };
  assert.deepEqual(validateIn(tombstone), []);
  // refiled without refiledTo is not a tombstone — RELATION-MISSING
  const half = { id: 'task_tomb-b', kind: 'task', ts: TS, status: 'refiled', updated: TS };
  assert.deepEqual(codes(validateIn(half)), ['RELATION-MISSING']);
  // refiledTo must be a scalar id string, not a typed ref object
  const refObject = { ...tombstone, id: 'task_tomb-c', refiledTo: { kind: 'mission', value: 'mission_probe' } };
  assert.ok(codes(validateIn(refObject)).includes('REF-SHAPE'));
  // dangling tombstone target
  const dangling = { ...tombstone, id: 'task_tomb-d', refiledTo: 'mission_ghost' };
  assert.deepEqual(codes(validateIn(dangling)), ['REF-DANGLING']);
  // tombstone target must be mission|task
  const wrongKind = { ...tombstone, id: 'task_tomb-e', refiledTo: 'log_2026-07-21-900' };
  assert.deepEqual(codes(validateIn(wrongKind)), ['REF-WRONG-KIND']);
}

console.log('validate cycle A tests passed');
