/**
 * In-process TTL memoiser for handbook reads.
 *
 * The webapp runs as one long-lived Node server, and handbook data only
 * changes when ingest runs, so a cache per memoised function with a TTL
 * saves the DB round trip on almost every read.
 *
 *  - The cache is per process. A restart or redeploy flushes it.
 *  - There is no remote invalidation. After a re-ingest, entries age
 *    out within MEMO_TTL_MS; restart to flush at once.
 *  - Every caller gets the same cached value, not a copy, so callers
 *    must not mutate it: copy first (`[...rows].sort()`). Outside
 *    production the value is deep-frozen, so a mutation throws in dev
 *    and in tests instead of silently changing what later readers see.
 */

export const MEMO_TTL_MS = 60 * 60 * 1000
// Per-function cap so unbounded key spaces (search queries, arbitrary
// code lists) can't grow memory forever. The cache has two segments of
// half this size each. A new key enters the first; its first hit moves
// it to the second, which evicts least-recently-hit first. One-off keys
// (a single search, one user's plan) therefore only push out other
// one-off keys, never an entry that is read again and again.
export const MEMO_MAX_ENTRIES = 256
export const MEMO_SEGMENT_ENTRIES = MEMO_MAX_ENTRIES / 2

const FREEZE = process.env.NODE_ENV !== "production"

/** Freeze plain objects and arrays all the way down. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value))
    return value
  Object.freeze(value)
  for (const v of Object.values(value)) deepFreeze(v)
  return value
}

type Entry<R> = { at: number; value: Promise<R> }

/** Delete the oldest key once `map` is over its cap; return its entry. */
function trim<R>(map: Map<string, Entry<R>>): [string, Entry<R>] | null {
  if (map.size <= MEMO_SEGMENT_ENTRIES) return null
  const oldest = map.entries().next().value
  if (!oldest) return null
  map.delete(oldest[0])
  return oldest
}

export function cacheHandbook<Args extends readonly unknown[], R>(
  fn: (...args: Args) => Promise<R>
): (...args: Args) => Promise<R> {
  // Keys fetched and not hit since, oldest first, and keys hit since
  // their fetch, least recently hit first. A key is in one at a time.
  const once = new Map<string, Entry<R>>()
  const hot = new Map<string, Entry<R>>()
  return (...args: Args): Promise<R> => {
    const key = JSON.stringify(args)
    const hit = hot.get(key) ?? once.get(key)
    // A hit keeps its fetch time, so the TTL still counts from the
    // fetch however often the key is read.
    if (hit && Date.now() - hit.at < MEMO_TTL_MS) {
      once.delete(key)
      hot.delete(key)
      hot.set(key, hit)
      // The least recently hit key moves back to the first segment. A
      // hit there promotes it again; otherwise one-off keys push it out.
      const demoted = trim(hot)
      if (demoted) once.set(...demoted)
      trim(once)
      return hit.value
    }
    hot.delete(key)
    once.delete(key)
    const value = FREEZE ? fn(...args).then(deepFreeze) : fn(...args)
    // Memoising the promise (not the result) dedupes concurrent
    // callers; drop failures so a transient DB error isn't cached
    // for the next hour.
    value.catch(() => {
      if (once.get(key)?.value === value) once.delete(key)
      if (hot.get(key)?.value === value) hot.delete(key)
    })
    once.set(key, { at: Date.now(), value })
    trim(once)
    return value
  }
}
