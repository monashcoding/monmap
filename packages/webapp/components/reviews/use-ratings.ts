"use client"

import { useEffect, useSyncExternalStore } from "react"

import { fetchRatings } from "@/lib/api/client"
import { chunkCodes } from "@/lib/api/query"
import { NO_RATINGS, type RatingSummary } from "@/lib/reviews/types"
import type { ReviewKind } from "@/lib/reviews/axes"

/**
 * Overall ratings for lists drawn in the browser (the planner's unit
 * search, popovers and map panel). Requests from every component on
 * the page within 30 ms go out as one GET request per kind (more for
 * over 300 codes), and results are kept for 5 minutes. Codes are sorted
 * before they are split, so the same codes give the same URLs and the
 * browser cache can answer.
 */

const TTL_MS = 5 * 60 * 1000
const BATCH_MS = 30
const CHUNK = 300

const cache = new Map<string, { at: number; value: RatingSummary }>()
const inFlight = new Set<string>()
const queued = new Map<ReviewKind, Set<string>>()
const listeners = new Set<() => void>()
let version = 0
let timer: ReturnType<typeof setTimeout> | null = null

const key = (kind: ReviewKind, code: string) => `${kind}:${code}`

function fresh(k: string): RatingSummary | undefined {
  const hit = cache.get(k)
  return hit && Date.now() - hit.at < TTL_MS ? hit.value : undefined
}

function request(kind: ReviewKind, codes: readonly string[]) {
  for (const code of codes) {
    const k = key(kind, code)
    if (fresh(k) || inFlight.has(k)) continue
    inFlight.add(k)
    const set = queued.get(kind) ?? new Set<string>()
    set.add(code)
    queued.set(kind, set)
  }
  if (queued.size > 0 && !timer) timer = setTimeout(flush, BATCH_MS)
}

function flush() {
  timer = null
  const batches = [...queued]
  queued.clear()
  for (const [kind, set] of batches) {
    for (const chunk of chunkCodes(set, CHUNK)) {
      void fetchRatings(kind, chunk)
        .then((found) => {
          const at = Date.now()
          for (const code of chunk) {
            cache.set(key(kind, code), { at, value: found[code] ?? NO_RATINGS })
          }
        })
        .catch(() => {})
        .finally(() => {
          for (const code of chunk) inFlight.delete(key(kind, code))
          version++
          for (const l of listeners) l()
        })
    }
  }
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const getVersion = () => version
const getServerVersion = () => 0

/** Ratings by code; a code is missing until its rating has loaded. */
export function useRatings(
  kind: ReviewKind,
  codes: readonly string[]
): Record<string, RatingSummary> {
  useSyncExternalStore(subscribe, getVersion, getServerVersion)
  const joined = codes.join(",")
  useEffect(() => {
    if (joined) request(kind, joined.split(","))
  }, [kind, joined])
  const out: Record<string, RatingSummary> = {}
  for (const code of codes) {
    const v = fresh(key(kind, code))
    if (v) out[code] = v
  }
  return out
}

/** One code's rating, or undefined until it has loaded. */
export function useRating(
  kind: ReviewKind,
  code: string | null | undefined
): RatingSummary | undefined {
  const all = useRatings(kind, code ? [code] : [])
  return code ? all[code] : undefined
}
