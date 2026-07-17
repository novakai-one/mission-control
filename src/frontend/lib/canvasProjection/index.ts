import type { Edge, Node } from '@xyflow/react';
import type {
  ArchitectureDocument, CanvasNode, CanvasPreferences, InterfaceObject, Selection, TypeObject,
} from '../../../shared/canvas/model/types.js';

/** Presentation data required by architecture nodes. */
export interface ArchitectureNodeData extends Record<string, unknown> {
  node: CanvasNode;
  interfaces: InterfaceObject[];
  types: TypeObject[];
  preferences: CanvasPreferences;
  selection: Selection;
  select: (selection: Selection) => void;
}

/** Presentation data required by elbow wires. */
export interface ArchitectureEdgeData extends Record<string, unknown> {
  label: string;
  preferences: CanvasPreferences;
  select: () => void;
}

function selectedOwner(document: ArchitectureDocument, selection: Selection): string | null {
  if (!selection) return null;
  if (selection.kind === 'node') return selection.id;
  if (selection.kind === 'interface') return document.interfaces[selection.id]?.ownerId ?? null;
  if (selection.kind === 'type') {
    return Object.values(document.nodes).find((node) => node.typeIds.includes(selection.id))?.id ?? null;
  }
  return null;
}

function connectedIds(document: ArchitectureDocument, selection: Selection): Set<string> {
  const owner = selectedOwner(document, selection);
  if (!selection || (!owner && selection.kind !== 'wire')) return new Set();
  if (selection.kind === 'wire') {
    const wire = document.wires[selection.id];
    return wire ? new Set([wire.source, wire.target]) : new Set();
  }
  const related = new Set([owner as string]);
  Object.values(document.wires).forEach((wire) => {
    if (wire.source === owner) related.add(wire.target);
    if (wire.target === owner) related.add(wire.source);
  });
  return related;
}

interface NodeContext {
  document: ArchitectureDocument;
  preferences: CanvasPreferences;
  selection: Selection;
  select: (next: Selection) => void;
  connected: Set<string>;
}

function nodeFlowType(node: CanvasNode): 'comment' | 'scope' | 'architecture' {
  return node.kind === 'comment' ? 'comment' : node.kind === 'scope' ? 'scope' : 'architecture';
}

/** A selected scope rises above the interaction layers so its resize handles
 * are reachable; its body stays click-through (pointer-events). */
function nodeZIndex(node: CanvasNode, isSelected: boolean): number {
  if (node.kind === 'scope') return isSelected ? 4 : -1;
  return node.kind === 'comment' ? 3 : 2;
}

function nodeClassName(node: CanvasNode, context: NodeContext): string {
  const dimmable = context.preferences.wires.dimUnrelated && context.selection && node.kind !== 'scope';
  return dimmable && !context.connected.has(node.id) ? 'is-dimmed' : '';
}

function nodeData(node: CanvasNode, context: NodeContext): ArchitectureNodeData {
  const { document, preferences, selection, select } = context;
  return {
    node,
    interfaces: node.interfaceIds.flatMap((id) => document.interfaces[id] ? [document.interfaces[id]] : []),
    types: node.typeIds.flatMap((id) => document.types[id] ? [document.types[id]] : []),
    preferences,
    selection,
    select,
  };
}

function projectNode(node: CanvasNode, context: NodeContext): Node<ArchitectureNodeData> {
  const isSelected = context.selection?.kind === 'node' && context.selection.id === node.id;
  return {
    id: node.id,
    type: nodeFlowType(node),
    position: node.position,
    parentId: node.parentId,
    extent: node.parentId ? ('parent' as const) : undefined,
    width: node.size.width,
    height: node.size.height,
    selected: isSelected,
    className: nodeClassName(node, context),
    zIndex: nodeZIndex(node, isSelected),
    data: nodeData(node, context),
  };
}

/** Projects canonical nodes into React Flow nodes. */
export function projectNodes(
  document: ArchitectureDocument,
  preferences: CanvasPreferences,
  selection: Selection,
  select: (next: Selection) => void,
): Node<ArchitectureNodeData>[] {
  const context: NodeContext = {
    document, preferences, selection, select, connected: connectedIds(document, selection),
  };
  return Object.values(document.nodes).map((node) => projectNode(node, context));
}

/** Projects canonical wires into React Flow edges. */
export function projectEdges(
  document: ArchitectureDocument,
  preferences: CanvasPreferences,
  selection: Selection,
  select: (next: Selection) => void,
): Edge<ArchitectureEdgeData>[] {
  const connected = connectedIds(document, selection);
  return Object.values(document.wires).map((wire) => ({
    id: wire.id,
    source: wire.source,
    target: wire.target,
    type: 'elbow',
    selected: selection?.kind === 'wire' && selection.id === wire.id,
    zIndex: selection?.kind === 'wire' && selection.id === wire.id ? 1000 : 0,
    className: preferences.wires.dimUnrelated && selection
      && (!connected.has(wire.source) || !connected.has(wire.target)) ? 'is-dimmed' : '',
    data: { label: wire.label, preferences, select: () => select({ kind: 'wire', id: wire.id }) },
  }));
}
