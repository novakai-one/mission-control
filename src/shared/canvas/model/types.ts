/** Canvas vocabulary ported from Novakai Canvas — stable, serialisable, shared
 * by the backend document store and the frontend view. The JSON documents are
 * authored by the ./canvas CLI in the Novakai-Canvas repo; this module must
 * stay wire-compatible with it. */

export type NodeKind = 'scope' | 'module' | 'object' | 'runtime' | 'resource' | 'comment';
export type WireKind = 'owns' | 'references' | 'assigns' | 'queries' | 'executes';

export interface Position { x: number; y: number; }
export interface Size { width: number; height: number; }

/** One positioned, selectable architecture object. */
export interface CanvasNode {
  id: string;
  kind: NodeKind;
  label: string;
  description?: string;
  position: Position;
  size: Size;
  parentId?: string;
  interfaceIds: string[];
  typeIds: string[];
}

/** One selectable interface exposed by a node — the API-card row. */
export interface InterfaceObject {
  id: string;
  ownerId: string;
  name: string;
  accepts: string[];
  returns: string[];
}

/** One selectable shared type definition. */
export interface TypeObject {
  id: string;
  name: string;
  fields: string[];
}

export interface CanvasWire {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: WireKind;
  routing: 'elbow';
}

/** Canonical serialisable architecture map. `revision` is the CAS token. */
export interface ArchitectureDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  nodes: Record<string, CanvasNode>;
  interfaces: Record<string, InterfaceObject>;
  types: Record<string, TypeObject>;
  wires: Record<string, CanvasWire>;
}

/** User-controlled visual and interaction preferences (no revision, no CAS). */
export interface CanvasPreferences {
  schemaVersion: 1;
  appearance: { density: 'compact' | 'comfortable'; radius: number };
  canvas: { showGrid: boolean; snapToGrid: boolean; gridSize: number; showControls: boolean };
  nodes: {
    showKinds: boolean;
    showDescriptions: boolean;
    showInterfaces: 'always' | 'selected' | 'never';
    showTypes: boolean;
    showPorts: 'always' | 'hover';
  };
  wires: {
    showLabels: 'always' | 'selected' | 'never';
    width: number;
    dimUnrelated: boolean;
  };
  panel: { width: number; defaultTab: 'inspect' | 'preferences' | 'json'; showEmptyFields: boolean };
  files: { autoSave: boolean; saveDelay: number };
}

/** Universal selection reference. */
export type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'interface'; id: string }
  | { kind: 'type'; id: string }
  | { kind: 'wire'; id: string }
  | null;

/** Complete set of supported domain intentions. */
export type CanvasCommand =
  | { kind: 'node.add'; node: CanvasNode }
  | { kind: 'node.move'; id: string; position: Position }
  | { kind: 'node.resize'; id: string; size: Size }
  | { kind: 'node.update'; id: string; patch: Partial<Pick<CanvasNode, 'label' | 'description' | 'kind'>> }
  | { kind: 'node.remove'; id: string }
  | { kind: 'wire.add'; wire: CanvasWire }
  | { kind: 'wire.update'; id: string; patch: Partial<Pick<CanvasWire, 'label' | 'kind'>> }
  | { kind: 'wire.remove'; id: string };
