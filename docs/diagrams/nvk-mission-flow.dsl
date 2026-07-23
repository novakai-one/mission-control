scope "nvk mission — filing wiring"
  note "One verb replaces the three hand-built JSON lines per mission filing: mission + team + optional task rows, validated refs, baseline enrollment."
  runtime "Operator"
  module "nvk-mission CLI" "scripts/nvk-mission.mjs — thin adapter: parse flags, build rows, order appends mission->team->tasks, map errors to exit 0/1/2"
    create(flags) -> filedRows
  module "Store engine" "src/backend/stores/store.mjs — locked, snapshot-validated, SC5 byte-verified append-only writer"
    readStoreDir(dir) -> Snapshot
    appendLine(dir, storeFile, rawLine, opts) -> AppendResult
    type AppendResult { id, storeFile, bytesAppended }
  module "Schema law" "src/backend/stores/schema.mjs + validate.mjs — STORE_KINDS, KIND_RULES, ref law, M1 task authority"
  module "Stores gate" "tools/gates/stores.mjs — drift ratchet: violation fingerprints + id inventory"
  resource ".novakai/stores"
  resource "gate baseline"
  wire "Operator" -> "nvk-mission CLI" : create --id --title --owner [--team-name] [--task --agent] [--dry-run] [executes]
  wire "nvk-mission CLI" -> "Store engine" : readStoreDir(dir), then appendLine(missions|teams|tasks.jsonl, raw, baselinePath) [executes]
  wire "Store engine" -> "Schema law" : validateCandidate vs STORE_KINDS + KIND_RULES [references]
  wire "Store engine" -> ".novakai/stores" : append raw+LF (SC5) [owns]
  wire "Store engine" -> "gate baseline" : enrollBaselineId(id) [owns]
  wire "Stores gate" -> ".novakai/stores" : auditDir(dir) [queries]
  wire "Stores gate" -> "gate baseline" : fingerprint + id compare [queries]
