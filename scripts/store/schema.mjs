// Schema law for .novakai/stores — INTERNAL to scripts/store/ (facade: store.mjs).
// Sources: AGENTS.md store conventions + Chief rulings Q1–Q5 pinned verbatim in
// .novakai/work/mission_store-validator/authorization.md. KIND_RULES implements
// the rulings' exact words, not any paraphrase.

/** filename → kinds allowed in that store */
export const STORE_KINDS = Object.freeze({
  'decisions.jsonl': Object.freeze(['decision']),
  'requests.jsonl': Object.freeze(['request']),
  'missions.jsonl': Object.freeze(['mission']),
  'tasks.jsonl': Object.freeze(['task']),
  'captains-log.jsonl': Object.freeze(['log']),
  'learnings.jsonl': Object.freeze(['learning']),
  'okrs.jsonl': Object.freeze(['objective', 'kr']),
  'projects.jsonl': Object.freeze(['project']),
  'issues.jsonl': Object.freeze(['issue']),
});

// Ruling 6 (Chief, 2026-07-21): REF_KINDS = task|mission|project|doc|decision|log|exp|objective|request|issue|session
export const REF_KINDS = Object.freeze(['task', 'mission', 'project', 'doc', 'decision', 'log', 'exp', 'objective', 'request', 'issue', 'session']);

/** Ref kinds whose targets live in these stores; doc/exp/session are declared-unchecked. */
export const RESOLVABLE_REF_KINDS = Object.freeze(['task', 'mission', 'project', 'decision', 'log', 'objective', 'request', 'issue']);

const SLUG = '[A-Za-z0-9][A-Za-z0-9_.-]*';

// Ruling 1: DEC-YYYY-MM-DD-NNN canonical for decision. Ruling 2: okr_* for objective.
const ID_PATTERNS = Object.freeze({
  decision: /^DEC-\d{4}-\d{2}-\d{2}-\d{3}$/,
  objective: new RegExp(`^okr_${SLUG}$`),
  project: new RegExp(`^proj_${SLUG}$`),
});

export function idPattern(kind) {
  return ID_PATTERNS[kind] ?? new RegExp(`^${kind}_${SLUG}$`);
}

// Ruling 3: ts REQUIRED on new writes, ISO-8601 with offset (Z accepted as explicit UTC).
export const TS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)$/;

// Ruling 5: kinds with no documented status set get shape-only enforcement
// (statusSet: null); status census is audit info, never a violation.
export const KIND_RULES = Object.freeze({
  decision: Object.freeze({ required: Object.freeze(['title', 'body']), statusSet: null }),
  request: Object.freeze({
    required: Object.freeze(['question', 'options']),
    arrays: Object.freeze(['options']),
    statusSet: Object.freeze(['pending', 'answered']),
  }),
  mission: Object.freeze({ required: Object.freeze(['title', 'owner']), statusSet: null }),
  task: Object.freeze({ required: Object.freeze(['title']), statusSet: Object.freeze(['todo', 'done']) }),
  log: Object.freeze({ required: Object.freeze(['body']), statusSet: null }),
  learning: Object.freeze({ required: Object.freeze(['body']), statusSet: null }),
  objective: Object.freeze({
    required: Object.freeze(['title', 'horizon']),
    enums: Object.freeze({ horizon: Object.freeze(['now', 'next', 'later']) }),
    statusSet: null,
  }),
  kr: Object.freeze({ required: Object.freeze(['objective', 'body']), statusSet: null }),
  project: Object.freeze({ required: Object.freeze(['title', 'status', 'path']), statusSet: null }),
  issue: Object.freeze({ required: Object.freeze([]), statusSet: null }),
});

// Ruling 4: tombstone = status "refiled" + scalar refiledTo (title optional).
export const TOMBSTONE_STATUS = 'refiled';
export const TOMBSTONE_TARGET_KINDS = Object.freeze(['mission', 'task']);

/** Evidence on a learning must include at least one ref to one of these kinds. */
export const EVIDENCE_TARGET_KINDS = Object.freeze(['log', 'mission']);
