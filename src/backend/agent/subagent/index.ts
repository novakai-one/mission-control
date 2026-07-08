export interface AgentNode {
  id: string;
  role: string;
  parentAgentId?: string;
  childAgentIds: string[];
}

export class SubagentManager {
  private readonly agentNodeMap = new Map<string, AgentNode>();

  public registerAgent(id: string, role: string, parentAgentId?: string): AgentNode {
    const node: AgentNode = {
      id,
      role,
      parentAgentId,
      childAgentIds: []
    };

    this.agentNodeMap.set(id, node);

    if (parentAgentId) {
      const parentNode = this.agentNodeMap.get(parentAgentId);
      if (parentNode) {
        parentNode.childAgentIds.push(id);
      }
    }

    return node;
  }

  public getAgentTree(rootId: string): AgentNode | undefined {
    return this.agentNodeMap.get(rootId);
  }

  public getParentLink(id: string): string | undefined {
    return this.agentNodeMap.get(id)?.parentAgentId;
  }

  public getChildren(id: string): string[] {
    return this.agentNodeMap.get(id)?.childAgentIds || [];
  }

  public listAllRegistered(): AgentNode[] {
    return Array.from(this.agentNodeMap.values());
  }

  public clear(): void {
    this.agentNodeMap.clear();
  }
}
