#!/usr/bin/env node
// Evidence collector A3 (mission_cli-process-map): static census of the
// durable-store write surface. Extracts (a) every ObjectModel public method
// and which store file it touches, (b) the store engine's exported
// primitives, (c) the schema layer's recognized stores / kinds / validation
// codes. Static only — nothing is executed against a live store.
//
//   node docs/reports/mission-lifecycle-map/evidence/store-census.mjs [repoRoot]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const read = (rel) => readFileSync(join(root, rel), 'utf8').split('\n');

// (a) ObjectModel: public method → store files it appends/transitions.
const omRel = 'src/backend/objectModel/index.ts';
const om = read(omRel);
const methods = [];
let current = null;
om.forEach((line, index) => {
  const cite = `${omRel}:${index + 1}`;
  const method = line.match(/^  (?:private )?(\w+)\(/);
  if (method) {
    current = { method: method[1], private: /private /.test(line), cite, stores: [] };
    methods.push(current);
  }
  if (current) {
    for (const match of line.matchAll(/this\.(append|transition|record|storeRecords)\('([\w.]+jsonl)'/g)) {
      current.stores.push({ op: match[1], file: match[2], cite });
    }
  }
});

// (b) store engine exports.
const engineRel = 'src/backend/stores/store.mjs';
const engine = read(engineRel)
  .map((line, index) => ({ line, cite: `${engineRel}:${index + 1}` }))
  .filter(({ line }) => /^export (function|class|const)/.test(line))
  .map(({ line, cite }) => ({ export: line.match(/^export (?:function|class|const) (\w+)/)[1], cite }));

// (c) schema layer: recognized stores, kinds, ref kinds, validation codes.
const schemaRel = 'src/backend/stores/schema.mjs';
const validateRel = 'src/backend/stores/validate.mjs';
const schemaText = read(schemaRel).join('\n') + '\n' + read(validateRel).join('\n');
const codes = [...new Set([...schemaText.matchAll(/code: '([\w-]+)'/g)].map((m) => m[1]))];
const storeFiles = [...new Set([...schemaText.matchAll(/'([\w-]+\.jsonl)'/g)].map((m) => m[1]))];
const kinds = [...new Set([...schemaText.matchAll(/kind:?\s*'(\w+)'|'(\w+)':\s*\{/g)].map((m) => m[1] ?? m[2]))];

console.log(JSON.stringify({
  generated: new Date().toISOString(),
  method: 'static parse: ObjectModel method→store map, store.mjs exports, schema/validate recognized stores + validation codes',
  objectModel: { file: omRel, methods },
  engine: { file: engineRel, exports: engine },
  schema: { files: [schemaRel, validateRel], validationCodes: codes, storeFiles, kindTokens: kinds },
}, null, 2));
