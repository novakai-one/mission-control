import assert from 'node:assert/strict';
import { applyCanvasCommand } from './index.js';
import { point } from '../model/defaults.js';
import type { ArchitectureDocument } from '../model/types.js';

const base: ArchitectureDocument = {
  schemaVersion: 1,
  id: 'doc',
  name: 'Doc',
  revision: 3,
  nodes: {
    alpha: { id: 'alpha', kind: 'module', label: 'A', position: point(0, 0), size: { width: 200, height: 100 }, interfaceIds: [], typeIds: [] },
    beta: { id: 'beta', kind: 'module', label: 'B', position: point(300, 0), size: { width: 200, height: 100 }, interfaceIds: [], typeIds: [] },
  },
  interfaces: {},
  types: {},
  wires: {
    wire1: { id: 'wire1', source: 'alpha', target: 'beta', label: 'calls', kind: 'references', routing: 'elbow' },
  },
};

// Every command bumps revision and never mutates the input document.
{
  const next = applyCanvasCommand(base, { kind: 'node.move', id: 'alpha', position: point(50, 60) });
  assert.equal(next.revision, 4);
  assert.deepEqual(next.nodes.alpha.position, point(50, 60));
  assert.deepEqual(base.nodes.alpha.position, point(0, 0));
}

// Removing a node cascades to its wires.
{
  const next = applyCanvasCommand(base, { kind: 'node.remove', id: 'alpha' });
  assert.equal(next.nodes.alpha, undefined);
  assert.deepEqual(next.wires, {});
  assert.equal(Object.keys(base.wires).length, 1);
}

// Resize and update patch the right node.
{
  const resized = applyCanvasCommand(base, { kind: 'node.resize', id: 'beta', size: { width: 260, height: 140 } });
  assert.deepEqual(resized.nodes.beta.size, { width: 260, height: 140 });
  const renamed = applyCanvasCommand(base, { kind: 'node.update', id: 'beta', patch: { label: 'Beta' } });
  assert.equal(renamed.nodes.beta.label, 'Beta');
}

// Wire add / update / remove round-trip.
{
  const added = applyCanvasCommand(base, {
    kind: 'wire.add',
    wire: { id: 'wire2', source: 'beta', target: 'alpha', label: 'reads', kind: 'queries', routing: 'elbow' },
  });
  assert.equal(Object.keys(added.wires).length, 2);
  const updated = applyCanvasCommand(added, { kind: 'wire.update', id: 'wire2', patch: { label: 'reads all' } });
  assert.equal(updated.wires.wire2.label, 'reads all');
  const removed = applyCanvasCommand(updated, { kind: 'wire.remove', id: 'wire2' });
  assert.equal(removed.wires.wire2, undefined);
}

console.log('canvas commands: ok');
