// Pure allocation decision: reuse a healthy session, otherwise launch a fresh
// instance. Kept free of I/O so it is fully testable; the broker supplies the
// impure `instanceAlive` liveness check.
import { isLeaseExpired } from './lease.js';
import type { Allocation, Session } from './types.js';

export function decideAllocation(
  existing: Session | undefined,
  instanceAlive: boolean,
  now: Date,
): Allocation {
  if (
    existing
    && existing.status === 'active'
    && instanceAlive
    && !isLeaseExpired(existing, now)
  ) {
    return { kind: 'reuse', session: existing };
  }
  return { kind: 'launch' };
}
