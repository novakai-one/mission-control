/** Hand-rolled runtime validation mirroring Novakai Canvas's zod schemas —
 * Command avoids the zod dependency; the ./canvas CLI remains the strict
 * authoring gate, this guards reads and stale writes. */
import type { ArchitectureDocument, CanvasNode, CanvasPreferences, CanvasWire, InterfaceObject, TypeObject } from '../model/types.js';

const NODE_KINDS = new Set(['scope', 'module', 'object', 'runtime', 'resource', 'comment']);
const WIRE_KINDS = new Set(['owns', 'references', 'assigns', 'queries', 'executes']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPosition(value: unknown): boolean {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number';
}

function isSize(value: unknown): boolean {
  return isRecord(value)
    && typeof value.width === 'number' && value.width > 0
    && typeof value.height === 'number' && value.height > 0;
}

function isNode(value: unknown): value is CanvasNode {
  return isRecord(value)
    && nonEmptyString(value.id)
    && NODE_KINDS.has(value.kind as string)
    && typeof value.label === 'string'
    && (value.description === undefined || typeof value.description === 'string')
    && isPosition(value.position)
    && isSize(value.size)
    && (value.parentId === undefined || typeof value.parentId === 'string')
    && isStringArray(value.interfaceIds)
    && isStringArray(value.typeIds);
}

function isInterface(value: unknown): value is InterfaceObject {
  return isRecord(value)
    && nonEmptyString(value.id) && nonEmptyString(value.ownerId)
    && typeof value.name === 'string'
    && isStringArray(value.accepts) && isStringArray(value.returns);
}

function isType(value: unknown): value is TypeObject {
  return isRecord(value)
    && nonEmptyString(value.id) && typeof value.name === 'string' && isStringArray(value.fields);
}

function isWire(value: unknown): value is CanvasWire {
  return isRecord(value)
    && nonEmptyString(value.id) && nonEmptyString(value.source) && nonEmptyString(value.target)
    && typeof value.label === 'string'
    && WIRE_KINDS.has(value.kind as string)
    && value.routing === 'elbow';
}

function isDictionaryOf<T>(value: unknown, check: (item: unknown) => item is T): boolean {
  return isRecord(value) && Object.values(value).every(check);
}

/** Validates an unknown value as an architecture document. */
export function isArchitectureDocument(value: unknown): value is ArchitectureDocument {
  return isRecord(value)
    && value.schemaVersion === 1
    && nonEmptyString(value.id) && nonEmptyString(value.name)
    && typeof value.revision === 'number' && Number.isInteger(value.revision) && value.revision >= 0
    && isDictionaryOf(value.nodes, isNode)
    && isDictionaryOf(value.interfaces, isInterface)
    && isDictionaryOf(value.types, isType)
    && isDictionaryOf(value.wires, isWire);
}

/** Validates an unknown value as canvas preferences. */
export function isCanvasPreferences(value: unknown): value is CanvasPreferences {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  const { appearance, canvas, nodes, wires, panel, files } = value as Record<string, unknown>;
  return isRecord(appearance) && ['compact', 'comfortable'].includes(appearance.density as string)
    && typeof appearance.radius === 'number'
    && isRecord(canvas) && typeof canvas.showGrid === 'boolean' && typeof canvas.snapToGrid === 'boolean'
    && typeof canvas.gridSize === 'number' && typeof canvas.showControls === 'boolean'
    && isRecord(nodes) && typeof nodes.showKinds === 'boolean' && typeof nodes.showDescriptions === 'boolean'
    && ['always', 'selected', 'never'].includes(nodes.showInterfaces as string)
    && typeof nodes.showTypes === 'boolean'
    && ['always', 'hover'].includes(nodes.showPorts as string)
    && isRecord(wires) && ['always', 'selected', 'never'].includes(wires.showLabels as string)
    && typeof wires.width === 'number' && typeof wires.dimUnrelated === 'boolean'
    && isRecord(panel) && typeof panel.width === 'number'
    && ['inspect', 'preferences', 'json'].includes(panel.defaultTab as string)
    && typeof panel.showEmptyFields === 'boolean'
    && isRecord(files) && typeof files.autoSave === 'boolean' && typeof files.saveDelay === 'number';
}
