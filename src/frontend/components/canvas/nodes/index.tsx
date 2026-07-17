import React from 'react';
import { Handle, NodeResizer, Position, type NodeProps, type Node } from '@xyflow/react';
import type { ArchitectureNodeData } from '../../../lib/canvasProjection/index.js';
import './index.css';

type ArchitectureFlowNode = Node<ArchitectureNodeData, 'architecture'>;
type ScopeFlowNode = Node<ArchitectureNodeData, 'scope'>;
type CommentFlowNode = Node<ArchitectureNodeData, 'comment'>;

/** Selectable architecture node — the API card: label, interfaces, types. */
export function ArchitectureNode({ data, selected }: NodeProps<ArchitectureFlowNode>) {
  const { node, interfaces, types, preferences, selection, select } = data;
  const showInterfaces = preferences.nodes.showInterfaces === 'always'
    || (preferences.nodes.showInterfaces === 'selected' && selected);
  const portsClass = preferences.nodes.showPorts === 'always' ? 'ports-always' : '';

  return (
    <article className={`canvas-arch-node kind-${node.kind} ${portsClass}`}>
      <NodeResizer isVisible={selected} minHeight={80} minWidth={160} />
      <Handle type="target" position={Position.Left} />
      <header className="canvas-node-header">
        <span className="canvas-node-label">{node.label}</span>
        {preferences.nodes.showKinds && <span className="canvas-node-kind">{node.kind}</span>}
      </header>
      {preferences.nodes.showDescriptions && node.description && (
        <p className="canvas-node-description">{node.description}</p>
      )}
      {showInterfaces && interfaces.length > 0 && (
        <div className="canvas-interface-list">
          {interfaces.map((item) => (
            <button
              className={selection?.kind === 'interface' && selection.id === item.id ? 'is-selected' : ''}
              key={item.id}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); select({ kind: 'interface', id: item.id }); }}
              type="button"
            >
              <span className="canvas-iface-name">{item.name}({item.accepts.join(', ')})</span>
              <span>→ {item.returns.length ? item.returns.join(', ') : 'void'}</span>
            </button>
          ))}
        </div>
      )}
      {preferences.nodes.showTypes && types.length > 0 && (
        <div className="canvas-type-list">
          {types.map((item) => (
            <button
              className={selection?.kind === 'type' && selection.id === item.id ? 'is-selected' : ''}
              key={item.id}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); select({ kind: 'type', id: item.id }); }}
              type="button"
            >{item.name}</button>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

/** Quiet scope container; click the title to select, then resize. */
export function ScopeNode({ data, selected }: NodeProps<ScopeFlowNode>) {
  return (
    <section className="canvas-scope-node">
      <NodeResizer isVisible={selected} minHeight={160} minWidth={320} />
      <span
        onClick={(event) => { event.stopPropagation(); data.select({ kind: 'node', id: data.node.id }); }}
      >{data.node.label}</span>
    </section>
  );
}

/** Selectable freeform comment; resizable while selected. */
export function CommentNode({ data, selected }: NodeProps<CommentFlowNode>) {
  return (
    <aside className="canvas-comment-node">
      <NodeResizer isVisible={selected} minHeight={60} minWidth={160} />
      {data.node.label}
    </aside>
  );
}
