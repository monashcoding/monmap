"use client"

import { useEffect, useSyncExternalStore } from "react"

import { fetchUnitText } from "@/lib/api/client"
import type { UnitText } from "@/lib/planner/types"

/**
 * The synopsis and enrolment rules of the unit a detail panel shows.
 * The planner and graph payloads leave this prose out, so the panel
 * asks for it when it opens. Handbook text only changes on ingest, so
 * an answer is kept for the session, up to MAX_ENTRIES codes; a failed
 * request is retried the next time a panel asks.
 */

const MAX_ENTRIES = 500

const cache = new Map<string, UnitText>()
const inFlight = new Set<string>()
const failed = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

const key = (year: string, code: string) => `${year}:${code}`

const NO_TEXT: UnitText = { synopsis: null, enrolmentRules: [] }

function notify() {
  version++
  for (const l of listeners) l()
}

// /api/units/text answers at most this many codes per request.
const MAX_CODES_PER_REQUEST = 12

function request(codes: readonly string[], year: string) {
  const missing = codes.filter((c) => {
    const k = key(year, c)
    return !cache.has(k) && !inFlight.has(k)
  })
  for (let i = 0; i < missing.length; i += MAX_CODES_PER_REQUEST)
    requestBatch(missing.slice(i, i + MAX_CODES_PER_REQUEST), year)
}

function requestBatch(missing: string[], year: string) {
  for (const c of missing) {
    inFlight.add(key(year, c))
    failed.delete(key(year, c))
  }
  void fetchUnitText(missing, year)
    .then((found) => {
      for (const c of missing) {
        if (cache.size >= MAX_ENTRIES) {
          const oldest = cache.keys().next().value
          if (oldest !== undefined) cache.delete(oldest)
        }
        cache.set(key(year, c), found[c] ?? NO_TEXT)
      }
    })
    .catch(() => {
      for (const c of missing) failed.add(key(year, c))
    })
    .finally(() => {
      for (const c of missing) inFlight.delete(key(year, c))
      notify()
    })
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const getVersion = () => version
const getServerVersion = () => 0

/**
 * Text for `codes` in handbook `year`, by code. `loading` is true until
 * every code has an answer. Pass a null year to ask for nothing, such
 * as while the panel is closed or the unit is not in the handbook.
 */
export function useUnitText(
  codes: readonly string[],
  year: string | null
): { text: Record<string, UnitText>; loading: boolean } {
  useSyncExternalStore(subscribe, getVersion, getServerVersion)
  const joined = year ? codes.join(",") : ""
  useEffect(() => {
    if (year && joined) request(joined.split(","), year)
  }, [joined, year])
  const text: Record<string, UnitText> = {}
  let loading = false
  if (year) {
    for (const c of codes) {
      const hit = cache.get(key(year, c))
      if (hit) text[c] = hit
      else if (!failed.has(key(year, c))) loading = true
    }
  }
  return { text, loading }
}
