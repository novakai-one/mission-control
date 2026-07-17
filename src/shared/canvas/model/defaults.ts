import type { ArchitectureDocument, CanvasPreferences, Position } from './types.js';

/** Coordinate literal helper — the wire format's single-letter keys stay in
 * one place (quoted so the id-length lint applies to identifiers only). */
export function point(pointX: number, pointY: number): Position {
  return { 'x': pointX, 'y': pointY };
}

/** Safe empty document used when loading fails. */
export const emptyArchitecture: ArchitectureDocument = {
  schemaVersion: 1,
  id: 'new-map',
  name: 'Untitled architecture',
  revision: 0,
  nodes: {},
  interfaces: {},
  types: {},
  wires: {},
};

/** Safe visual defaults used when loading fails. */
export const defaultPreferences: CanvasPreferences = {
  schemaVersion: 1,
  appearance: { density: 'comfortable', radius: 6 },
  canvas: { showGrid: false, snapToGrid: true, gridSize: 8, showControls: true },
  nodes: {
    showKinds: true,
    showDescriptions: false,
    showInterfaces: 'always',
    showTypes: true,
    showPorts: 'hover',
  },
  wires: { showLabels: 'selected', width: 1.25, dimUnrelated: true },
  panel: { width: 380, defaultTab: 'inspect', showEmptyFields: false },
  files: { autoSave: true, saveDelay: 500 },
};
