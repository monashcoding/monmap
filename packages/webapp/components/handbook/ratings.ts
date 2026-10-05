import { ratingSummaries } from "@/lib/db/reviews"
import type { EntityKind } from "@/lib/handbook/links"
import { NO_RATINGS, type RatingSummary } from "@/lib/reviews/types"

/** Overall ratings keyed by `kind:code`. */
export type Ratings = ReadonlyMap<string, RatingSummary>

export const ratingKey = (kind: EntityKind, code: string) => `${kind}:${code}`

/**
 * Ratings for every row a page lists, one query per kind. A code with
 * no reviews maps to NO_RATINGS, so a missing key means "not loaded".
 */
export async function loadRatings(
  items: ReadonlyArray<{ kind: EntityKind; code: string }>
): Promise<Ratings> {
  const byKind = new Map<EntityKind, string[]>()
  for (const it of items) {
    byKind.set(it.kind, [...(byKind.get(it.kind) ?? []), it.code])
  }
  const out = new Map<string, RatingSummary>()
  await Promise.all(
    [...byKind].map(async ([kind, codes]) => {
      const found = await ratingSummaries(kind, codes)
      for (const code of codes) {
        out.set(ratingKey(kind, code), found[code] ?? NO_RATINGS)
      }
    })
  )
  return out
}
