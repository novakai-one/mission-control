// Pure lease math. A lease is just a deadline; the broker renews it on use and
// reclaims the instance once it lapses.

/** ISO instant `ttlMs` after `now`. */
export function leaseExpiresAt(now: Date, ttlMs: number): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

/** True once the deadline has been reached (equal instant counts as expired). */
export function isLeaseExpired(session: { leaseExpiresAt: string }, now: Date): boolean {
  return new Date(session.leaseExpiresAt).getTime() <= now.getTime();
}
