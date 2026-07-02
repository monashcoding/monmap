/**
 * In-process TTL memoiser for handbook reads.
 *
 * This replaces `unstable_cache`: on Vercel every unstable_cache
 * read/write is billed as an ISR read/write, and because cache keys
 * include the call arguments, high-cardinality callers (search
 * strings, per-graph code lists) generated hundreds of thousands of
 * ISR writes a month — 5× the free-tier quota. Handbook data is
 * static between ingest runs, so a per-instance Map with a TTL gets
 * the same DB-load win at zero platform cost.
 *
 * Trade-offs vs the data cache:
 *  - Per serverless instance, so cold instances refetch from Neon.
 *    Fluid compute keeps instances warm across requests, which is
 *    where the repeat traffic is.
 *  - No remote invalidation. After a re-ingest, entries age out
 *    within MEMO_TTL_MS; redeploy to flush immediately.
 */

const MEMO_TTL_MS = 60 * 60 * 1000
// Per-function cap so unbounded key spaces (search queries, arbitrary
// code lists) can't grow memory forever. Eviction is oldest-inserted,
// which is close enough to LRU for a TTL this short.
const MEMO_MAX_ENTRIES = 256

export function cacheHandbook<Args extends readonly unknown[], R>(
  fn: (...args: Args) => Promise<R>
): (...args: Args) => Promise<R> {
  const cache = new Map<string, { at: number; value: Promise<R> }>()
  // Clone on every read (matching unstable_cache, which deserialised a
  // fresh copy per call) so a caller that mutates its result can't
  // corrupt the cached copy shared with everyone else.
  const readFresh = (value: Promise<R>): Promise<R> =>
    value.then((v) => structuredClone(v))
  return (...args: Args): Promise<R> => {
    const key = JSON.stringify(args)
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < MEMO_TTL_MS) return readFresh(hit.value)
    const value = fn(...args)
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
    return readFresh(value)
  }
}
