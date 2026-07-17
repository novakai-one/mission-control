// Canvas view — Novakai Canvas rehomed as a native studio lens. The document
// is authored by the ./canvas CLI (or dragged here); revision CAS keeps both
// writers coherent and 'novakai:canvas-changed' window events (relayed from
// the backend's canvas-event ws frames) reload external edits live.
import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  createCanvasEngine, createHttpCanvasRepository, fetchCanvasPreferences, useCanvasEngine,
  type CanvasEngine,
} from '../../lib/canvasEngine/index.js';
import { projectEdges, projectNodes } from '../../lib/canvasProjection/index.js';
import { defaultPreferences, emptyArchitecture, point } from '../../../shared/canvas/model/defaults.js';
import type { ArchitectureDocument, CanvasNode, Selection } from '../../../shared/canvas/model/types.js';
import { ArchitectureNode, CommentNode, ScopeNode } from './nodes/index.js';
import { ElbowEdge } from './edges/index.js';
import './index.css';

/** DashboardShell relays backend canvas-event ws frames as this window event. */
export const CANVAS_CHANGED_EVENT = 'novakai:canvas-changed';

const nodeTypes = { architecture: ArchitectureNode, comment: CommentNode, scope: ScopeNode };
const edgeTypes = { elbow: ElbowEdge };

function createNode(document: ArchitectureDocument, kind: 'module' | 'comment'): CanvasNode {
  const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;
  const count = Object.keys(document.nodes).length;
  return {
    id,
    kind,
    label: kind === 'comment' ? 'Add context here' : 'New module',
    position: kind === 'comment'
      ? point(1240, 280 + (count % 4) * 130)
      : point(120 + (count % 4) * 230, 260 + (count % 3) * 150),
    size: kind === 'comment' ? { width: 240, height: 100 } : { width: 200, height: 110 },
    interfaceIds: [],
    typeIds: [],
  };
}

function applyNodeChanges(engine: CanvasEngine, changes: NodeChange[]): void {
  changes.forEach((change) => {
    if (change.type === 'position' && change.position) {
      engine.execute({ kind: 'node.move', id: change.id, position: change.position });
    }
    // Only user-driven resizes (NodeResizer sets resizing) — never React Flow's
    // initial DOM measurements, which would rewrite every stored size on load.
    if (change.type === 'dimensions' && change.dimensions && change.resizing) {
      engine.execute({ kind: 'node.resize', id: change.id, size: change.dimensions });
    }
    if (change.type === 'remove') engine.execute({ kind: 'node.remove', id: change.id });
  });
}

function connect(engine: CanvasEngine, connection: Connection): string | null {
  if (!connection.source || !connection.target) return null;
  const id = `wire-${crypto.randomUUID().slice(0, 8)}`;
  engine.execute({
    kind: 'wire.add',
    wire: { id, source: connection.source, target: connection.target, label: 'connects', kind: 'references', routing: 'elbow' },
  });
  return id;
}

/** The lens mounts hidden (display:none), so React Flow's initial fitView
 * measures a zero-size container. Refit once the lens is actually visible
 * AND the document has content — after React Flow's ResizeObserver has seen
 * the real dimensions — then never again, preserving the user's pan/zoom
 * across tab switches. */
function FitOnReveal({ visible, nodeCount, primaryId }: { visible: boolean; nodeCount: number; primaryId: string | null }) {
  const { fitView } = useReactFlow();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !visible || nodeCount === 0) return;
    fitted.current = true;
    // A timeout, not useNodesInitialized: a lens born display:none measures
    // its nodes at zero and React Flow never re-reports initialization after
    // reveal — verified empirically. The beat lets the ResizeObserver see the
    // real container. Reveal frames the primary scope at readable zoom —
    // whole-document fit is soup; the fit control still zooms out to all.
    const timer = window.setTimeout(() => {
      void fitView(primaryId
        ? { nodes: [{ id: primaryId }], padding: 0.08, maxZoom: 0.9 }
        : { padding: 0.12, maxZoom: 1 });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [visible, nodeCount, primaryId, fitView]);
  return null;
}

/** The topmost root scope — documents read top-down, so the overview map
 * Chris authored first sits highest on the canvas. */
function primaryScopeId(document: ArchitectureDocument): string | null {
  const scopes = Object.values(document.nodes).filter((node) => node.kind === 'scope' && !node.parentId);
  const best = scopes.reduce<CanvasNode | null>(
    (leader, scope) => (leader && leader.position.y <= scope.position.y ? leader : scope),
    null,
  );
  return best?.id ?? null;
}

/** The Canvas studio lens. Always mounted so pan/zoom and selection survive
 * tab switches; hides itself via CSS like AgentsView. */
export function CanvasView({ visible }: { visible: boolean }) {
  const repository = useMemo(() => createHttpCanvasRepository(), []);
  const engine = useMemo(() => createCanvasEngine(emptyArchitecture, repository), [repository]);
  const document = useCanvasEngine(engine);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [selection, setSelection] = useState<Selection>(null);
  const [saveStatus, setSaveStatus] = useState('Saved');
  const loaded = useRef(false);

  // Initial load + live reload when the ./canvas CLI (or any external writer)
  // touches the data files.
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      void engine.reload();
      void fetchCanvasPreferences().then(setPreferences);
    }
    const onExternalChange = (): void => { void engine.reload(); };
    window.addEventListener(CANVAS_CHANGED_EVENT, onExternalChange);
    return () => window.removeEventListener(CANVAS_CHANGED_EVENT, onExternalChange);
  }, [engine]);

  // Debounced autosave; on stale-revision the CLI won — reload their version.
  useEffect(() => {
    if (!preferences.files.autoSave) return;
    if (document.revision === engine.persistedRevision()) return;
    setSaveStatus('Saving');
    const timer = window.setTimeout(() => {
      void engine.save().then(() => setSaveStatus('Saved')).catch((error: unknown) => {
        if (error instanceof Error && error.message === 'stale-revision') {
          void engine.reload().then(() => setSaveStatus('Saved'));
          return;
        }
        setSaveStatus('Local changes');
      });
    }, preferences.files.saveDelay);
    return () => window.clearTimeout(timer);
  }, [document, engine, preferences.files.autoSave, preferences.files.saveDelay]);

  const select = useCallback((next: Selection) => setSelection(next), []);
  const nodes = useMemo(
    () => projectNodes(document, preferences, selection, select),
    [document, preferences, selection, select],
  );
  const edges = useMemo(
    () => projectEdges(document, preferences, selection, select),
    [document, preferences, selection, select],
  );

  const addNode = (kind: 'module' | 'comment'): void => {
    const node = createNode(document, kind);
    engine.execute({ kind: 'node.add', node });
    select({ kind: 'node', id: node.id });
  };

  return (
    <div
      className="canvas-view"
      // eslint-disable-next-line no-restricted-syntax -- visibility + radius are runtime values (always-mounted lens, user preference)
      style={{ display: visible ? undefined : 'none', '--canvas-radius': `${preferences.appearance.radius}px` } as CSSProperties}
    >
      <ReactFlowProvider>
        <ReactFlow
          colorMode="dark" deleteKeyCode={['Backspace', 'Delete']} edgeTypes={edgeTypes} edges={edges}
          // No fitView prop: it re-fires when nodes initialize and would race
          // FitOnReveal's deliberate primary-scope framing.
          elementsSelectable minZoom={0.1}
          nodeTypes={nodeTypes} nodes={nodes} nodesConnectable nodesDraggable
          onConnect={(connection) => { const id = connect(engine, connection); if (id) select({ kind: 'wire', id }); }}
          onEdgeClick={(_event, edge) => select({ kind: 'wire', id: edge.id })}
          onNodeClick={(_event, node) => select({ kind: 'node', id: node.id })}
          onNodesChange={(changes) => applyNodeChanges(engine, changes)} onPaneClick={() => select(null)}
          selectionOnDrag snapGrid={[preferences.canvas.gridSize, preferences.canvas.gridSize]}
          snapToGrid={preferences.canvas.snapToGrid}
        >
          <FitOnReveal visible={visible} nodeCount={Object.keys(document.nodes).length} primaryId={primaryScopeId(document)} />
          {preferences.canvas.showGrid && <Background color="#26262b" gap={preferences.canvas.gridSize * 2} variant={BackgroundVariant.Dots} />}
          {preferences.canvas.showControls && <Controls position="bottom-left" showInteractive={false} />}
        </ReactFlow>
      </ReactFlowProvider>
      <div className="canvas-toolbar">
        <div className="canvas-file-identity"><span>{document.name}</span><small>r{document.revision}</small></div>
        <div className="canvas-toolbar-actions">
          <button onClick={() => addNode('module')} type="button">Node</button>
          <button onClick={() => addNode('comment')} type="button">Comment</button>
        </div>
        <span className={`canvas-save-status${saveStatus === 'Saved' ? ' is-settled' : ''}`}>{saveStatus}</span>
      </div>
    </div>
  );
}
