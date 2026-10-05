/**
 * In-process TTL memoiser for handbook reads.
 *
 * The webapp runs as one long-lived Node server, and handbook data only
 * changes when ingest runs, so a Map per memoised function with a TTL
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
// code lists) can't grow memory forever. Eviction is oldest-inserted:
// a hit does not move a key, only a refetch does.
export const MEMO_MAX_ENTRIES = 256

const FREEZE = process.env.NODE_ENV !== "production"

/** Freeze plain objects and arrays all the way down. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value))
    return value
  Object.freeze(value)
  for (const v of Object.values(value)) deepFreeze(v)
  return value
}

export function cacheHandbook<Args extends readonly unknown[], R>(
  fn: (...args: Args) => Promise<R>
): (...args: Args) => Promise<R> {
  const cache = new Map<string, { at: number; value: Promise<R> }>()
  return (...args: Args): Promise<R> => {
    const key = JSON.stringify(args)
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.value
    const value = FREEZE ? fn(...args).then(deepFreeze) : fn(...args)
    // Memoising the promise (not the result) dedupes concurrent
    // callers; drop failures so a transient DB error isn't cached
    // for the next hour.
    value.catch(() => {
      if (cache.get(key)?.value === value) cache.delete(key)
    })
    cache.delete(key)
    if (cache.size >= MEMO_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { at: Date.now(), value })
    return value
  }
}
