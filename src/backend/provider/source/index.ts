import type { SessionReference, ProviderId } from '../../../shared/project/schema.js';
import type { SessionSnapshot } from '../../../shared/provider/schema.js';

/** Reads one provider-owned conversation without changing its source file. */
export interface ProviderSessionSource {
  readonly provider: ProviderId;
  read(reference: SessionReference): SessionSnapshot;
}

/** Missing provider transcript referenced by a Novakai thread. */
export class SessionNotFoundError extends Error {
  constructor(provider: ProviderId, sessionId: string) {
    super(`${provider} session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}
