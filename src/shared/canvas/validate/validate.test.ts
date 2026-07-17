import assert from 'node:assert/strict';
import { isArchitectureDocument, isCanvasPreferences } from './index.js';
import { defaultPreferences, emptyArchitecture, point } from '../model/defaults.js';

// The safe defaults must validate — they are the fallbacks on bad reads.
assert.equal(isArchitectureDocument(emptyArchitecture), true);
assert.equal(isCanvasPreferences(defaultPreferences), true);

// A real-shaped document with every dictionary populated validates.
const populated = {
  schemaVersion: 1,
  id: 'novakai-command',
  name: 'Novakai Command',
  revision: 41,
  nodes: {
    'project-scope': {
      id: 'project-scope', kind: 'scope', label: 'Project', position: point(0, 0),
      size: { width: 900, height: 600 }, interfaceIds: [], typeIds: [],
    },
    threads: {
      id: 'threads', kind: 'module', label: 'Threads', description: 'Durable work objectives',
      position: point(432, 12), size: { width: 220, height: 150 }, parentId: 'project-scope',
      interfaceIds: ['threads-list'], typeIds: ['thread-summary'],
    },
  },
  interfaces: {
    'threads-list': { id: 'threads-list', ownerId: 'threads', name: 'list', accepts: ['ProjectId'], returns: ['ThreadSummary[]'] },
  },
  types: {
    'thread-summary': { id: 'thread-summary', name: 'ThreadSummary', fields: ['id', 'title'] },
  },
  wires: {
    'assignment-thread': { id: 'assignment-thread', source: 'project-scope', target: 'threads', label: 'assigns', kind: 'assigns', routing: 'elbow' },
  },
};
assert.equal(isArchitectureDocument(populated), true);

// Broken shapes are rejected: bad kind, missing revision, negative size, bad wire routing.
assert.equal(isArchitectureDocument({ ...populated, revision: -1 }), false);
assert.equal(isArchitectureDocument({ ...populated, nodes: { node: { ...populated.nodes.threads, kind: 'blob' } } }), false);
assert.equal(isArchitectureDocument({ ...populated, nodes: { node: { ...populated.nodes.threads, size: { width: 0, height: 10 } } } }), false);
assert.equal(isArchitectureDocument({ ...populated, wires: { wire: { ...populated.wires['assignment-thread'], routing: 'straight' } } }), false);
assert.equal(isArchitectureDocument(null), false);
assert.equal(isArchitectureDocument([]), false);

// Preferences: enum fields are enforced.
assert.equal(isCanvasPreferences({ ...defaultPreferences, nodes: { ...defaultPreferences.nodes, showInterfaces: 'sometimes' } }), false);
assert.equal(isCanvasPreferences({ ...defaultPreferences, schemaVersion: 2 }), false);

console.log('canvas validate: ok');
