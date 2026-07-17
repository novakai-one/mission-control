import type { ArchitectureDocument, CanvasCommand } from '../model/types.js';

type NodeCommand = Extract<CanvasCommand, { kind: `node.${string}` }>;
type WireCommand = Extract<CanvasCommand, { kind: `wire.${string}` }>;

function applyNodeCommand(next: ArchitectureDocument, command: NodeCommand): void {
  switch (command.kind) {
    case 'node.add': next.nodes[command.node.id] = command.node; break;
    case 'node.move': if (next.nodes[command.id]) next.nodes[command.id].position = command.position; break;
    case 'node.resize': if (next.nodes[command.id]) next.nodes[command.id].size = command.size; break;
    case 'node.update': if (next.nodes[command.id]) Object.assign(next.nodes[command.id], command.patch); break;
    case 'node.remove':
      delete next.nodes[command.id];
      next.wires = Object.fromEntries(
        Object.entries(next.wires).filter(([, wire]) => wire.source !== command.id && wire.target !== command.id),
      );
      break;
  }
}

function applyWireCommand(next: ArchitectureDocument, command: WireCommand): void {
  switch (command.kind) {
    case 'wire.add': next.wires[command.wire.id] = command.wire; break;
    case 'wire.update': if (next.wires[command.id]) Object.assign(next.wires[command.id], command.patch); break;
    case 'wire.remove': delete next.wires[command.id]; break;
  }
}

/** Applies one intention without mutating the previous document. */
export function applyCanvasCommand(
  document: ArchitectureDocument,
  command: CanvasCommand,
): ArchitectureDocument {
  const next = structuredClone(document);
  if (command.kind.startsWith('node.')) applyNodeCommand(next, command as NodeCommand);
  else applyWireCommand(next, command as WireCommand);
  next.revision += 1;
  return next;
}
