// C — Team messaging studio, ported from the approved HTML composition.
// This is a view over the canonical tunnel feed, roster, cursors and delivery
// receipts; it owns no message store.
import React, { useEffect, useMemo, useState } from 'react';
import type { ProjectRecord } from '../../../../shared/project/schema.js';
import type { AgentInfo } from '../../../lib/agentSocket/index.js';
import {
  buildAttentionQueue,
  updateAttentionQueue,
} from '../../../lib/attention/index.js';
import { buildTargets } from '../../../lib/mentions/index.js';
import { useTunnelFeed } from '../../../lib/tunnelModel/index.js';
import { TunnelMessenger } from '../../studio/chat/tunnel/index.js';
import './index.css';

interface MessagesViewProps {
  agents: AgentInfo[];
  projects: ProjectRecord[];
  project: ProjectRecord | null;
  openRequest?: MessagesOpenRequest | null;
}

export interface MessagesOpenRequest {
  id: string;
  nonce: number;
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '').join('');
}

export function MessagesView({ agents, projects, project, openRequest }: MessagesViewProps) {
  const { feed, loadConversation } = useTunnelFeed();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const targets = useMemo(
    () => buildTargets(agents, projects.flatMap((entry) => entry.threads)),
    [agents, projects],
  );
  const running = agents.filter((agent) => agent.status === 'running');
  const failed = feed.filter((entry) => entry.status === 'failed').length;

  useEffect(() => {
    updateAttentionQueue(buildAttentionQueue(null, feed, dismissed));
  }, [feed, dismissed]);

  return (
    <section className="messages-view">
      <aside className="messages-workspaces" aria-label="Workspaces">
        <div className="messages-mark">N</div>
        {projects.slice(0, 5).map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === project?.id ? 'messages-workspace is-active' : 'messages-workspace'}
            title={entry.name}
          >
            {initials(entry.name)}
          </button>
        ))}
      </aside>

      <TunnelMessenger
        feed={feed}
        agents={agents}
        targets={targets}
        onResolve={(itemId) => setDismissed((current) => new Set(current).add(itemId))}
        onLoadConversation={loadConversation}
        openRequest={openRequest}
      />

      <aside className="messages-inspector">
        <section>
          <span className="messages-kicker">Room activity</span>
          <div className="messages-stats">
            <div><strong>{running.length}</strong><span>agents active</span></div>
            <div><strong>{failed}</strong><span>failed routes</span></div>
          </div>
        </section>
        <section>
          <span className="messages-kicker">Live squad</span>
          <div className="messages-agents">
            {running.slice(0, 6).map((agent) => (
              <button type="button" key={agent.agentId} className="messages-agent">
                <span>{initials(agent.title)}</span>
                <div>
                  <strong>{agent.title}</strong>
                  <small>{agent.provider} · {agent.status}</small>
                </div>
              </button>
            ))}
            {running.length === 0 && <p>No agents running</p>}
          </div>
        </section>
        <section>
          <span className="messages-kicker">Shared work</span>
          <div className="messages-artifacts">
            {(project?.threads ?? []).slice(0, 5).map((thread) => (
              <button type="button" key={thread.id}>
                <span>□</span>
                <div>
                  <strong>{thread.title}</strong>
                  <small>{thread.sessionReferences.length} attached sessions</small>
                </div>
              </button>
            ))}
            {!project?.threads.length && <p>No project threads</p>}
          </div>
        </section>
      </aside>
    </section>
  );
}
