import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { ArchitectureEdgeData } from '../../../lib/canvasProjection/index.js';
import './index.css';

type ElbowFlowEdge = Edge<ArchitectureEdgeData, 'elbow'>;

/** Restrained selectable elbow wire renderer. */
export function ElbowEdge(props: EdgeProps<ElbowFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX, sourceY: props.sourceY, sourcePosition: props.sourcePosition,
    targetX: props.targetX, targetY: props.targetY, targetPosition: props.targetPosition,
    borderRadius: 6,
  });
  const visibility = props.data?.preferences.wires.showLabels;
  const showLabel = visibility === 'always' || (visibility === 'selected' && props.selected);
  return (
    <>
      {/* eslint-disable-next-line no-restricted-syntax -- stroke width is a user preference resolved at render time */}
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={{ strokeWidth: props.data?.preferences.wires.width }} />
      {showLabel && props.data?.label && (
        <EdgeLabelRenderer>
          <button
            className={`canvas-wire-label nodrag nopan${props.selected ? ' is-selected' : ''}`}
            onClick={(event) => { event.stopPropagation(); props.data?.select(); }}
            // eslint-disable-next-line no-restricted-syntax -- label position comes from the computed edge path each render
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              zIndex: props.selected ? 1001 : undefined,
            }}
            type="button"
          >{props.data.label}</button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
