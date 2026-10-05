/**
 * Per-user limit on review writes (saves and deletes). Each write calls
 * classifier.dev and clears cached pages, so a user may write at most
 * once every 5 seconds and 30 times in 24 hours. Deletes count too, so
 * deleting and writing again does not reset the count.
 *
 * MonMap runs as one self-hosted Node process, so an in-memory map is
 * enough. A restart clears it, which only ever lets a user write more.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Past this many tracked users, drop everyone with no write in 24 hours. */
const SWEEP_AT = 5_000

export interface WriteLimit {
  /** The shortest time between two writes by one user. */
  gapMs: number
  /** The most writes by one user in 24 hours. */
  perDay: number
}

/**
 * Returns `take(userId)`, which records a write and returns true, or
 * returns false without recording when the user is over the limit.
 */
export function createWriteLimiter({ gapMs, perDay }: WriteLimit) {
  const writes = new Map<string, number[]>()
  return function take(userId: string, now = Date.now()): boolean {
    if (writes.size > SWEEP_AT) {
      for (const [id, times] of writes) {
        if (now - (times.at(-1) ?? 0) >= DAY_MS) writes.delete(id)
      }
    }
    const recent = (writes.get(userId) ?? []).filter((t) => now - t < DAY_MS)
    const last = recent.at(-1)
    const allowed =
      (last === undefined || now - last >= gapMs) && recent.length < perDay
    if (allowed) recent.push(now)
    if (recent.length > 0) writes.set(userId, recent)
    else writes.delete(userId)
    return allowed
  }
}

export const takeReviewWrite = createWriteLimiter({
  gapMs: 5_000,
  perDay: 30,
})
